import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireStaff: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/staff-server", () => {
  class HttpError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    HttpError,
    requireStaff: mocks.requireStaff,
    database: () => ({ rpc: mocks.rpc }),
    checkOrigin: (r: Request) => {
      if (r.headers.get("origin") !== new URL(r.url).origin)
        throw new HttpError(403, "Origin rejected");
    },
    body: (r: Request) => r.json(),
    json: (value: unknown) => Response.json(value),
    failure: (e: unknown) =>
      Response.json(
        { error: e instanceof Error ? e.message : "Unavailable" },
        { status: e instanceof HttpError ? e.status : 503 },
      ),
  };
});
import { POST } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const input = {
  draft: {
    requestId: id,
    firstName: "Bella",
    mobile: "",
    consent: false,
    lines: [{ id: "line", menu_item_id: id, quantity: 1, add_on_ids: [] }],
  },
  totalCents: 800,
  role: "admin",
  staffId: "forged",
};
const request = (data: unknown, origin = "https://booth.test") =>
  new Request("https://booth.test/api/counter/orders", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ id, role: "barista" });
  mocks.rpc.mockResolvedValue({ data: { order_number: 1 }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("supplies a private QR for the confirmed order and preserves it on retry", async () => {
  vi.stubEnv("TRACKING_BASE_URL", "");
  const token = "ab".repeat(32);
  mocks.rpc.mockResolvedValue({
    data: { id, order_number: 1, tracking_token: token },
    error: null,
  });
  const first = await (await POST(request(input))).json();
  expect(first.tracking_url).toBe(`https://booth.test/o/track#${token}`);
  expect(first.tracking_qr).toMatch(/^data:image\/png;base64,/);
  expect(first).not.toHaveProperty("tracking_token");
  expect(await (await POST(request(input))).json()).toEqual(first);
});
it("keeps a saved order successful when HTTPS QR setup is unavailable", async () => {
  vi.stubEnv("TRACKING_BASE_URL", "http://insecure.test");
  mocks.rpc.mockResolvedValue({
    data: { id, order_number: 1, tracking_token: "ab".repeat(32) },
    error: null,
  });
  const response = await POST(request(input));
  expect(response.status).toBe(200);
  const receipt = await response.json();
  expect(receipt.id).toBe(id);
  expect(receipt.tracking_qr).toBeNull();
  expect(receipt.tracking_warning).toContain("Order saved");
});
it("uses server staff identity rather than a supplied actor or role", async () => {
  expect((await POST(request(input))).status).toBe(200);
  expect(mocks.rpc.mock.calls[0][1]).toEqual({
    p_staff_id: id,
    p_request_id: id,
    p_first_name: "Bella",
    p_mobile: null,
    p_consent: false,
    p_items: [{ menu_item_id: id, quantity: 1, add_on_ids: [] }],
    p_total_cents: 800,
  });
});
it("accepts the boundary quantity and forwards the draft verbatim", async () => {
  const response = await POST(
    request({
      ...input,
      draft: {
        ...input.draft,
        lines: [
          { id: "line", menu_item_id: id, quantity: 100, add_on_ids: [] },
        ],
      },
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.rpc.mock.calls[0][1].p_items[0].quantity).toBe(100);
});
it("rejects structurally invalid drafts before touching the database", async () => {
  const bad = [
    { ...input, totalCents: -1 },
    { ...input, totalCents: 100000000 },
    { ...input, totalCents: "800" },
    { draft: input.draft },
    { ...input, draft: null },
    { ...input, draft: { ...input.draft, lines: [] } },
    { ...input, draft: { ...input.draft, firstName: " " } },
    {
      ...input,
      draft: {
        ...input.draft,
        lines: [
          { id: "line", menu_item_id: "nope", quantity: 1, add_on_ids: [] },
        ],
      },
    },
    {
      ...input,
      draft: {
        ...input.draft,
        lines: [{ id: "line", menu_item_id: id, quantity: 0, add_on_ids: [] }],
      },
    },
    {
      ...input,
      draft: {
        ...input.draft,
        lines: [
          { id: "line", menu_item_id: id, quantity: 101, add_on_ids: [] },
        ],
      },
    },
    {
      ...input,
      draft: {
        ...input.draft,
        lines: [
          {
            id: "line",
            menu_item_id: id,
            quantity: 1,
            add_on_ids: [id, id, id],
          },
        ],
      },
    },
    { ...input, draft: { ...input.draft, mobile: "71234567", consent: true } },
  ];
  for (const data of bad) {
    const response = await POST(request(data));
    expect(response.status, JSON.stringify(data)).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not write for signed-out, cross-origin or malformed requests", async () => {
  expect((await POST(request(input, "https://attacker.test"))).status).toBe(
    403,
  );
  expect((await POST(request({ ...input, totalCents: 1.2 }))).status).toBe(400);
  mocks.requireStaff.mockRejectedValue(new Error("No session"));
  expect((await POST(request(input))).status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("maps every known database error to its safe, plain message", async () => {
  const cases: [string, number, string][] = [
    ["BB_UNAVAILABLE", 409, "reconcile it on the POS"],
    ["BB_PRICE_CHANGED", 409, "updated total"],
    ["BB_INVALID", 409, "draft is retained"],
    ["BB_FORBIDDEN", 403, "Sign in again"],
  ];
  for (const [code, status, fragment] of cases) {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } });
    const response = await POST(request(input));
    expect(response.status, code).toBe(status);
    const data = await response.json();
    expect(data.error, code).toContain(fragment);
    expect(data.error, code).not.toContain(code);
  }
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "connection refused to secret-host:5432" },
  });
  const response = await POST(request(input));
  expect(response.status).toBe(503);
  const data = await response.json();
  expect(data.error).toContain("Retry this same draft");
  expect(data.error).not.toContain("secret-host");
});
it("reports price conflicts without exposing raw database errors", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "BB_PRICE_CHANGED" },
  });
  const response = await POST(request(input));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("POS payment");
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "secret database detail" },
  });
  expect((await (await POST(request(input))).json()).error).not.toContain(
    "secret",
  );
});
