import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { requestJson, StaffWorkspace } from "./staff-workspace";

afterEach(() => vi.unstubAllGlobals());

it("does not render protected children before the initial session check", () => {
  const children = vi.fn(() => "protected staff data");
  const html = renderToStaticMarkup(
    <StaffWorkspace>{children}</StaffWorkspace>,
  );
  expect(html).toContain("Checking staff access");
  expect(html).not.toContain("protected staff data");
  expect(children).not.toHaveBeenCalled();
});

it("ends the workspace on a protected 401, preserving permission errors and failed logins", async () => {
  const target = new EventTarget();
  const ended = vi.fn();
  target.addEventListener("staff-session-ended", ended);
  vi.stubGlobal("window", target);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const [url, status] of [
    ["/api/counter/menu", 401],
    ["/api/report/daily-totals", 403],
    ["/api/staff/session", 401],
  ] as const) {
    fetcher.mockResolvedValueOnce(
      Response.json({ error: "Access denied" }, { status }),
    );
    await expect(requestJson(url)).rejects.toThrow("Access denied");
  }
  expect(ended).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/counter/menu",
    expect.objectContaining({ cache: "no-store" }),
  );
});

describe("staffMessage", () => {
  it("hides the browser's network error behind a plain message", async () => {
    const { staffMessage } = await import("./staff-workspace");
    expect(
      staffMessage(new TypeError("Failed to fetch"), "No connection."),
    ).toBe("No connection.");
    expect(staffMessage(new Error("Admin access is required."), "x")).toBe(
      "Admin access is required.",
    );
    expect(staffMessage("odd", "Fallback")).toBe("Fallback");
  });
});
