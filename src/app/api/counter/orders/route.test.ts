import { beforeEach, expect, it, vi } from "vitest";

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
it("uses server staff identity rather than a supplied actor or role", async () => {
  expect((await POST(request(input))).status).toBe(200);
  expect(mocks.rpc.mock.calls[0][1].p_staff_id).toBe(id);
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
