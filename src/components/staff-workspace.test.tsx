// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { offlineStore } from "@/lib/offline-store";
import { requestJson, StaffWorkspace } from "./staff-workspace";

vi.mock("next/navigation", () => ({ usePathname: () => "/queue" }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  await offlineStore.snapshots.clear();
  vi.unstubAllGlobals();
});

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

// ---------------------------------------------------------------------------
// Interactive sign-in / role / sign-out behaviour.
// ---------------------------------------------------------------------------

const admin = { id: "a1", username: "booth-lead", role: "admin" };
const barista = { id: "b1", username: "counter", role: "barista" };

function sessionFetcher(
  initialStaff: { staff: object | null },
  onPost?: () => void,
) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "POST") {
      onPost?.();
      return Response.json({ staff: admin });
    }
    if (method === "DELETE") return Response.json({ signedOut: true });
    return Response.json(initialStaff);
  });
}

async function renderWorkspace() {
  await act(async () => {
    root.render(
      <StaffWorkspace>
        {(staff) => (
          <p>
            Protected:{staff.username}/{staff.role}
          </p>
        )}
      </StaffWorkspace>,
    );
  });
  // Let the initial session check settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function signInViaForm(username: string) {
  const form = host.querySelector("form")!;
  const user = form.querySelector<HTMLInputElement>('input[name="username"]')!;
  const pass = form.querySelector<HTMLInputElement>('input[name="password"]')!;
  user.value = username;
  pass.value = "secret";
  const submit = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )!;
  await act(async () => {
    submit.click();
    await new Promise((r) => setTimeout(r, 20));
  });
}

it("signs in with the form, reveals protected children and the role label", async () => {
  vi.stubGlobal("fetch", sessionFetcher({ staff: null }));
  await renderWorkspace();
  expect(host.textContent).toContain("Staff sign-in");
  expect(host.textContent).not.toContain("Protected:");
  await signInViaForm("booth-lead");
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Protected:booth-lead/admin"),
  );
  // The signed-in header shows the role and staff nav links.
  expect(host.textContent).toContain("booth-lead · admin");
  expect(host.querySelector('a[href="/order"]')).not.toBeNull();
  expect(host.querySelector('a[href="/report"]')).not.toBeNull();
});

it("hides the daily report link from non-admin roles", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) =>
      (init?.method ?? "GET") === "POST"
        ? Response.json({ staff: barista })
        : Response.json({ staff: null }),
    ),
  );
  await renderWorkspace();
  await signInViaForm("counter");
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Protected:counter/barista"),
  );
  expect(host.textContent).toContain("counter · barista");
  expect(host.querySelector('a[href="/report"]')).toBeNull();
});

it("hides protected children and shows a notice when the network check fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await renderWorkspace();
  expect(host.textContent).toContain("Staff sign-in");
  expect(host.textContent).toContain("Cannot check your session");
  expect(host.textContent).not.toContain("Protected:");
});

it("returns to sign-in after a successful sign-out and hides the children", async () => {
  vi.stubGlobal("fetch", sessionFetcher({ staff: admin }));
  await renderWorkspace();
  // Already signed in via the initial GET.
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Protected:booth-lead/admin"),
  );
  const signOut = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Sign out"),
  )!;
  await act(async () => {
    signOut.click();
    await new Promise((r) => setTimeout(r, 20));
  });
  await vi.waitFor(() => expect(host.textContent).toContain("Staff sign-in"));
  expect(host.textContent).not.toContain("Protected:");
});

it("ends the workspace when another tab ends the session", async () => {
  vi.stubGlobal("fetch", sessionFetcher({ staff: admin }));
  await renderWorkspace();
  await vi.waitFor(() =>
    expect(host.textContent).toContain("Protected:booth-lead/admin"),
  );
  await act(async () => {
    window.dispatchEvent(new Event("staff-session-ended"));
  });
  expect(host.textContent).toContain("Your session ended");
  expect(host.textContent).not.toContain("Protected:");
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

it.each([admin, barista])(
  "marks only the current staff route for $role",
  async (staff) => {
    vi.stubGlobal("fetch", sessionFetcher({ staff }));
    await renderWorkspace();
    await vi.waitFor(() =>
      expect(
        host.querySelector('nav a[aria-current="page"]')?.getAttribute("href"),
      ).toBe("/queue"),
    );
    expect(host.querySelectorAll('nav a[aria-current="page"]')).toHaveLength(1);
    expect(host.querySelector('a[href="/scan"]')).not.toBeNull();
    expect(host.querySelector('a[href="/report"]') !== null).toBe(
      staff.role === "admin",
    );
    expect(host.querySelector("nav button")).toBeNull();
    expect(
      Array.from(host.querySelectorAll("button")).some(
        (button) => button.textContent === "Sign out",
      ),
    ).toBe(true);
  },
);
