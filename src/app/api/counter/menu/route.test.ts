import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
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
    requireStaff: vi.fn(),
    rpc: vi.fn(),
    database: vi.fn(),
    rows: {} as Record<string, unknown[]>,
    errors: {} as Record<string, { message: string } | null>,
  };
});
vi.mock("@/lib/staff-server", () => ({
  HttpError: mocks.HttpError,
  requireStaff: mocks.requireStaff,
  database: mocks.database,
  checkOrigin: (r: Request) => {
    if (r.headers.get("origin") !== new URL(r.url).origin)
      throw new mocks.HttpError(403, "Origin rejected");
  },
  body: (r: Request) => r.json(),
  json: (value: unknown) =>
    Response.json(value, { headers: { "Cache-Control": "no-store" } }),
  failure: (e: unknown) =>
    Response.json(
      { error: e instanceof Error ? e.message : "Unavailable" },
      { status: e instanceof mocks.HttpError ? e.status : 503 },
    ),
}));
import { GET, PATCH } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const change = {
  kind: "drink",
  id,
  version: 1,
  action: "price",
  value: "9.00",
  role: "admin",
  staffId: "forged",
};
const request = (data: unknown, origin = "https://booth.test") =>
  new Request("https://booth.test/api/counter/menu", {
    method: "PATCH",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
const drinkRow = {
  id,
  name: "Oat Latte",
  base_price: "5.50",
  is_active: true,
  is_available: true,
  version: 1,
};
const addOnRow = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Extra shot",
  price: "1.50",
  is_available: true,
  version: 1,
};
const fromChain = (name: string) => {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    order: () => self,
  };
  self.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
    Promise.resolve({
      data: mocks.rows[name] ?? [],
      error: mocks.errors[name] ?? null,
    }).then(res, rej);
  return self;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ id, role: "admin" });
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
  mocks.rows = { menu_items: [drinkRow], add_ons: [addOnRow] };
  mocks.errors = {};
  mocks.database.mockReturnValue({ rpc: mocks.rpc, from: fromChain });
});
it("passes the trusted actor and exact cents to the price function", async () => {
  expect((await PATCH(request(change))).status).toBe(200);
  expect(mocks.rpc.mock.calls[0][1]).toEqual({
    p_staff_id: id,
    p_kind: "drink",
    p_id: id,
    p_version: 1,
    p_change: { price_cents: 900 },
  });
});
it("blocks forged admin roles, cross-origin writes and invalid prices", async () => {
  expect((await PATCH(request(change, "https://attacker.test"))).status).toBe(
    403,
  );
  expect((await PATCH(request({ ...change, value: "9.001" }))).status).toBe(
    400,
  );
  mocks.requireStaff.mockResolvedValue({ id, role: "barista" });
  expect((await PATCH(request(change))).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("surfaces concurrent edits as conflicts", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "BB_CONFLICT" },
  });
  expect((await PATCH(request(change))).status).toBe(409);
});

it("allows explicit availability for baristas and refuses inactive drink reactivation", async () => {
  mocks.requireStaff.mockResolvedValue({ id, role: "barista" });
  const availability = { ...change, action: "availability", value: false };
  expect((await PATCH(request(availability))).status).toBe(200);
  expect(mocks.rpc.mock.calls[0][1].p_change).toEqual({ is_available: false });
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "BB_INACTIVE" },
  });
  expect((await PATCH(request({ ...availability, value: true }))).status).toBe(
    409,
  );
});

it("restricts deactivation to admins and sends a soft-deactivation flag", async () => {
  const deactivation = { ...change, action: "deactivate", value: false };
  expect((await PATCH(request(deactivation))).status).toBe(200);
  expect(mocks.rpc.mock.calls[0][1].p_change).toEqual({ is_active: false });
  mocks.requireStaff.mockResolvedValue({ id, role: "barista" });
  expect((await PATCH(request(deactivation))).status).toBe(403);
  expect((await PATCH(request({ ...deactivation, value: true }))).status).toBe(
    400,
  );
});

it("allows only admins to explicitly reactivate a drink", async () => {
  const reactivation = { ...change, action: "reactivate", value: true };
  expect((await PATCH(request(reactivation))).status).toBe(200);
  expect(mocks.rpc.mock.calls[0][1].p_change).toEqual({ is_active: true });
  mocks.requireStaff.mockResolvedValue({ id, role: "barista" });
  expect((await PATCH(request(reactivation))).status).toBe(403);
  expect(
    (await PATCH(request({ ...reactivation, kind: "option" }))).status,
  ).toBe(400);
});

it("returns the active menu for staff with a no-store cache header", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual({
    drinks: [drinkRow],
    addOns: [addOnRow],
  });
});

it("rejects unauthenticated menu reads before touching the database", async () => {
  mocks.requireStaff.mockRejectedValue(
    new mocks.HttpError(
      401,
      "Your session ended. Sign in again; your draft is retained.",
    ),
  );
  const response = await GET();
  expect(response.status).toBe(401);
  expect(mocks.database).not.toHaveBeenCalled();
});

it("answers 503 when the service client is unconfigured", async () => {
  mocks.database.mockImplementation(() => {
    throw new mocks.HttpError(
      503,
      "Staff service is not configured. Ask the booth lead to finish setup.",
    );
  });
  expect((await GET()).status).toBe(503);
});

it("answers 503 when either menu query fails without leaking details", async () => {
  mocks.errors = { menu_items: { message: "relation does not exist" } };
  const response = await GET();
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain(
    "relation does not exist",
  );
  mocks.errors = { add_ons: { message: "timeout" } };
  expect((await GET()).status).toBe(503);
});

it("maps server-side denial to 403 and unknown errors to 503", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "BB_FORBIDDEN" },
  });
  expect((await PATCH(request(change))).status).toBe(403);
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "connection refused" },
  });
  expect((await PATCH(request(change))).status).toBe(503);
});
