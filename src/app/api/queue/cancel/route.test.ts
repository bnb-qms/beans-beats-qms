import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  checkOrigin: vi.fn(),
  body: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/staff-server", () => {
  class HttpError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  return {
    HttpError,
    json,
    failure: (error: unknown) =>
      json(
        { error: error instanceof HttpError ? error.message : "Unavailable" },
        error instanceof HttpError ? error.status : 503,
      ),
    requireStaff: mocks.requireStaff,
    checkOrigin: mocks.checkOrigin,
    body: mocks.body,
    database: () => ({ rpc: mocks.rpc }),
  };
});

import { POST } from "./route";

const orderId = "00000000-0000-4000-8000-000000000001";
const request = () =>
  new Request("https://x.app/api/queue/cancel", { method: "POST" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireStaff.mockResolvedValue({ id: "staff-1", role: "barista" });
});

it("cancels with the staff ID and expected version", async () => {
  mocks.body.mockResolvedValue({ orderId, expectedVersion: 3 });
  const cancelled = {
    id: orderId,
    order_number: 4,
    status: "cancelled",
    version: 4,
  };
  mocks.rpc.mockResolvedValue({ data: cancelled, error: null });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(cancelled);
  expect(mocks.checkOrigin).toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("queue_cancel_order", {
    p_staff_id: "staff-1",
    p_order_id: orderId,
    p_expected_version: 3,
  });
});

it("rejects bad input without calling the database", async () => {
  mocks.body.mockResolvedValue({ orderId: "nope", expectedVersion: 0 });
  expect((await POST(request())).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("maps database errors", async () => {
  mocks.body.mockResolvedValue({ orderId, expectedVersion: 1 });
  for (const [message, status] of [
    ["BB_CONFLICT", 409],
    ["BB_INVALID_TRANSITION", 409],
    ["BB_NOT_FOUND", 404],
    ["BB_FORBIDDEN", 403],
    ["timeout", 503],
  ] as const) {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message } });
    expect((await POST(request())).status).toBe(status);
  }
});
