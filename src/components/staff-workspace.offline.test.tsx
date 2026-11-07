// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { offlineStore, rememberStaff } from "@/lib/offline-store";
import { StaffWorkspace } from "./staff-workspace";

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

it("restores only the latest verified account after a network failure", async () => {
  await rememberStaff({ id: "staff-1", username: "admin", role: "admin" });
  await rememberStaff({ id: "staff-2", username: "barista", role: "barista" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await act(async () => {
    root.render(
      <StaffWorkspace>
        {(staff) => <p>Account: {staff.username}</p>}
      </StaffWorkspace>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(host.textContent).toContain("Account: barista");
  expect(host.textContent).not.toContain("Account: admin");
});

it("does not restore cached access when the server rejects the session", async () => {
  await rememberStaff({ id: "staff-1", username: "admin", role: "admin" });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ error: "Expired" }, { status: 401 })),
  );
  await act(async () => {
    root.render(
      <StaffWorkspace>
        {(staff) => <p>Account: {staff.username}</p>}
      </StaffWorkspace>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(host.textContent).toContain("Staff sign-in");
  expect(host.textContent).not.toContain("Account: admin");
});
