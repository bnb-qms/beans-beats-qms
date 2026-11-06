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
  return {
    HttpError,
    failure: (error: unknown) =>
      Response.json(
        { error: error instanceof Error ? error.message : "Unavailable" },
        {
          status: error instanceof HttpError ? error.status : 503,
          headers: { "Cache-Control": "no-store" },
        },
      ),
    requireStaff: mocks.requireStaff,
    database: () => ({ rpc: mocks.rpc }),
  };
});
import { GET } from "./route";
const request = (query = "?date=2026-11-26") =>
  new Request(`https://example.test/api/report/csv${query}`);
describe("GET CSV export", () => {
  beforeEach(() => {
    mocks.requireStaff
      .mockReset()
      .mockResolvedValue({ id: "admin-id", role: "admin" });
    mocks.rpc.mockReset().mockResolvedValue({
      data: { date: "2026-11-26", lines: [], cups: 0, sales_cents: 0 },
      error: null,
    });
  });
  it("downloads an empty day with trusted staff and no store", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="beans-beats-sales-2026-11-26.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toContain(
      "TOTAL (excluding cancelled orders)",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("report_csv_export", {
      p_staff_id: "admin-id",
      p_date: "2026-11-26",
    });
  });
  it("rejects authorization and invalid dates before querying", async () => {
    mocks.requireStaff.mockRejectedValueOnce(new Error("session"));
    expect((await GET(request())).status).toBe(503);
    mocks.requireStaff.mockResolvedValueOnce({ id: "staff", role: "barista" });
    expect((await GET(request())).status).toBe(403);
    for (const query of [
      "",
      "?date=2026-02-30",
      "?date=2026-11-26&date=2026-11-27",
    ])
      expect((await GET(request(query))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns JSON without attachment on malformed RPC data", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { date: "2026-11-26", lines: null },
      error: null,
    });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
