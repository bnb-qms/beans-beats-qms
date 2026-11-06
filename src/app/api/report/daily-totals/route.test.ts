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

describe("GET daily totals", () => {
  beforeEach(() => {
    mocks.requireStaff.mockReset();
    mocks.rpc.mockReset();
    mocks.requireStaff.mockResolvedValue({ id: "admin-id", role: "admin" });
    mocks.rpc.mockResolvedValue({
      data: { date: "2026-11-26", cups: 3, sales_cents: 2300 },
      error: null,
    });
  });
  const request = (query = "?date=2026-11-26") =>
    new Request(`https://example.test/api/report/daily-totals${query}`);
  it("returns snapshot totals with the server session identity and no-store", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      date: "2026-11-26",
      cups: 3,
      sales_cents: 2300,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("report_daily_totals", {
      p_staff_id: "admin-id",
      p_date: "2026-11-26",
    });
  });
  it("rejects non-admin and invalid dates before querying", async () => {
    mocks.requireStaff.mockResolvedValueOnce({
      id: "barista-id",
      role: "barista",
    });
    expect((await GET(request())).status).toBe(403);
    for (const query of [
      "",
      "?date=2026-02-30",
      "?date=2026-11-26&date=2026-11-27",
    ])
      expect((await GET(request(query))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects unsafe numeric results", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        date: "2026-11-26",
        cups: 1,
        sales_cents: Number.MAX_SAFE_INTEGER + 1,
      },
      error: null,
    });
    expect((await GET(request())).status).toBe(503);
  });
});
