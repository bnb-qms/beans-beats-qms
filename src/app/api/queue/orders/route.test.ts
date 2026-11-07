import { beforeEach, describe, expect, it, vi } from "vitest";

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
    database: () => ({ rpc: mocks.rpc }),
  };
});

import { GET } from "./route";

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
      data: [{ ...sampleOrder, status: "ready" }],
      error: null,
    });
    expect((await GET()).status).toBe(503);

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "connection error" },
    });
    expect((await GET()).status).toBe(503);
  });
});
