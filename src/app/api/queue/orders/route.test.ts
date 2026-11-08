import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { HttpError } from "@/lib/staff-server";
import { GET, PATCH } from "./route";

const sampleOrder = {
  id: "00000000-0000-4000-8000-000000000001",
  order_number: 14,
  event_day: "2026-11-26",
  customer_first_name: "Mei",
  status: "queued" as const,
  created_at: "2026-11-26T02:00:00.000Z",
  version: 1,
  items: [
    {
      id: "00000000-0000-4000-8000-000000000011",
      menu_item_name: "latte",
      quantity: 2,
      add_ons: ["iced", "oat milk"],
    },
  ],
};

describe("GET /api/queue/orders", () => {
  beforeEach(() => {
    mocks.requireStaff.mockReset();
    mocks.checkOrigin.mockReset();
    mocks.body.mockReset();
    mocks.rpc.mockReset();
    mocks.requireStaff.mockResolvedValue({
      id: "barista-id",
      username: "preview-barista",
      role: "barista",
    });
    mocks.rpc.mockResolvedValue({ data: [sampleOrder], error: null });
  });

  it("returns sorted active queue orders with server staff identity and no-store", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ orders: [sampleOrder] });
    expect(mocks.rpc).toHaveBeenCalledWith("queue_orders", {
      p_staff_id: "barista-id",
    });
  });

  it("maps BB_FORBIDDEN to 403", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "BB_FORBIDDEN" },
    });
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("rejects malformed or failed database responses with 503", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ ...sampleOrder, status: "collected" }],
      error: null,
    });
    expect((await GET()).status).toBe(503);

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "connection error" },
    });
    expect((await GET()).status).toBe(503);
  });

  it("treats a null database row without an error as malformed", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when no orders are active today", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orders: [] });
  });

  it("maps an expired session to 401 without calling the queue", async () => {
    mocks.requireStaff.mockRejectedValueOnce(
      new HttpError(
        401,
        "Your session ended. Sign in again; your draft is retained.",
      ),
    );
    const response = await GET();
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe(
      "Your session ended. Sign in again; your draft is retained.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/queue/orders", () => {
  const patchRequest = () =>
    new Request("https://example.test/api/queue/orders", { method: "PATCH" });

  beforeEach(() => {
    mocks.requireStaff.mockReset();
    mocks.checkOrigin.mockReset();
    mocks.body.mockReset();
    mocks.rpc.mockReset();
    mocks.requireStaff.mockResolvedValue({
      id: "barista-id",
      username: "preview-barista",
      role: "barista",
    });
    mocks.body.mockResolvedValue({
      orderId: sampleOrder.id,
      expectedVersion: 1,
      status: "preparing",
    });
    mocks.rpc.mockResolvedValue({
      data: {
        id: sampleOrder.id,
        order_number: 14,
        event_day: "2026-11-26",
        status: "preparing",
        version: 2,
      },
      error: null,
    });
  });

  it("advances order status using server staff identity and version check", async () => {
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(200);
    expect(mocks.checkOrigin).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("queue_update_status", {
      p_staff_id: "barista-id",
      p_order_id: sampleOrder.id,
      p_expected_version: 1,
      p_status: "preparing",
    });
  });

  it("returns the updated order on success", async () => {
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      id: sampleOrder.id,
      order_number: 14,
      event_day: "2026-11-26",
      status: "preparing",
      version: 2,
    });
  });

  it("rejects invalid status payloads before calling database", async () => {
    mocks.body.mockResolvedValueOnce({
      orderId: sampleOrder.id,
      expectedVersion: 1,
      status: "queued",
    });
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed status payloads without touching the database", async () => {
    const invalidBodies = [
      null,
      {},
      { orderId: "not-a-uuid", expectedVersion: 1, status: "preparing" },
      { orderId: sampleOrder.id, expectedVersion: "1", status: "preparing" },
      { orderId: sampleOrder.id, expectedVersion: -1, status: "preparing" },
      { orderId: sampleOrder.id, expectedVersion: 1.5, status: "preparing" },
      { orderId: sampleOrder.id, expectedVersion: 1 },
      { orderId: sampleOrder.id, status: "preparing" },
      { orderId: sampleOrder.id, expectedVersion: 1, status: "cancelled" },
      { orderId: sampleOrder.id, expectedVersion: 1, status: 7 },
    ];
    for (const value of invalidBodies) {
      mocks.body.mockResolvedValueOnce(value);
      const response = await PATCH(patchRequest());
      expect(response.status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an expired session before reading the request body", async () => {
    mocks.requireStaff.mockRejectedValueOnce(
      new HttpError(
        401,
        "Your session ended. Sign in again; your draft is retained.",
      ),
    );
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(401);
    expect(mocks.body).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin update without calling the database", async () => {
    mocks.checkOrigin.mockImplementationOnce(() => {
      throw new HttpError(403, "Open this app directly and try again.");
    });
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(403);
    expect(mocks.body).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps BB_CONFLICT and BB_INVALID_TRANSITION to 409, BB_FORBIDDEN to 403", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "BB_CONFLICT" },
    });
    expect((await PATCH(patchRequest())).status).toBe(409);

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "BB_INVALID_TRANSITION" },
    });
    expect((await PATCH(patchRequest())).status).toBe(409);

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "BB_FORBIDDEN" },
    });
    expect((await PATCH(patchRequest())).status).toBe(403);
  });

  it("maps BB_NOT_FOUND to 404 and BB_INVALID to 400", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "BB_NOT_FOUND" },
    });
    const missing = await PATCH(patchRequest());
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toContain("not found");

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "BB_INVALID" },
    });
    expect((await PATCH(patchRequest())).status).toBe(400);
  });

  it("maps an unknown database failure to 503", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("could not be confirmed");
  });
});
