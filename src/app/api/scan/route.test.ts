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

import { GET, POST } from "./route";

const code = "a".repeat(64);
const request = () => new Request("https://x.app/api/scan", { method: "POST" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireStaff.mockResolvedValue({ id: "staff-1", role: "barista" });
});

describe("GET /api/scan", () => {
  it("returns today's ready codes", async () => {
    const orders = [
      {
        code_hash: "b".repeat(64),
        order_number: 4,
        customer_first_name: "Mei",
      },
    ];
    mocks.rpc.mockResolvedValue({ data: orders, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orders });
    expect(mocks.rpc).toHaveBeenCalledWith("scan_ready_orders", {
      p_staff_id: "staff-1",
    });
  });

  it("rejects signed-out staff and bad data", async () => {
    const { HttpError } = await import("@/lib/staff-server");
    mocks.requireStaff.mockRejectedValueOnce(new HttpError(401, "Sign in"));
    expect((await GET()).status).toBe(401);
    mocks.rpc.mockResolvedValue({ data: [{ code_hash: "x" }], error: null });
    expect((await GET()).status).toBe(503);
  });
});

describe("POST /api/scan", () => {
  it("collects the scanned order", async () => {
    mocks.body.mockResolvedValue({ code });
    const outcome = {
      result: "collected",
      order_number: 4,
      customer_first_name: "Mei",
    };
    mocks.rpc.mockResolvedValue({ data: outcome, error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(outcome);
    expect(mocks.checkOrigin).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("scan_collect", {
      p_staff_id: "staff-1",
      p_tracking_token: code,
    });
  });

  it("rejects codes that are not tracking codes without calling the database", async () => {
    mocks.body.mockResolvedValue({ code: "nope" });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps database errors", async () => {
    mocks.body.mockResolvedValue({ code });
    for (const [message, status] of [
      ["BB_NOT_FOUND", 404],
      ["BB_FORBIDDEN", 403],
      ["BB_INVALID", 400],
      ["timeout", 503],
    ] as const) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message } });
      expect((await POST(request())).status).toBe(status);
    }
  });
});
