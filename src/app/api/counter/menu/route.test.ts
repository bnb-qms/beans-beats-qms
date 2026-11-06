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
import { PATCH } from "./route";
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ id, role: "admin" });
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
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
