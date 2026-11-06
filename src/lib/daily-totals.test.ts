import { describe, expect, it } from "vitest";
import { singaporeToday, validReportDate } from "./daily-totals";

describe("daily report dates", () => {
  it("accepts only real four-digit calendar dates", () => {
    expect(validReportDate("2028-02-29")).toBe(true);
    for (const value of [
      "",
      "2026-02-29",
      "2026-02-30",
      "0000-01-01",
      "2026-13-01",
      "2026-1-01",
      "2026-01-01x",
    ])
      expect(validReportDate(value)).toBe(false);
  });
  it("uses Singapore day across the UTC boundary", () => {
    expect(singaporeToday(new Date("2026-11-25T15:59:59Z"))).toBe("2026-11-25");
    expect(singaporeToday(new Date("2026-11-25T16:00:00Z"))).toBe("2026-11-26");
  });
});
