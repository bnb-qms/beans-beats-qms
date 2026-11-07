// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { offlineStore, updateSnapshot } from "@/lib/offline-store";
import type { Menu } from "@/lib/order";
import type { Staff } from "@/lib/staff-server";
import { useMenu } from "./use-menu";

const mocks = vi.hoisted(() => ({ requestJson: vi.fn() }));
vi.mock("./staff-workspace", () => ({
  requestJson: mocks.requestJson,
  inputClass: "field",
}));

const staff: Staff = { id: "staff-9", username: "brew", role: "barista" };
const cachedMenu: Menu = {
  drinks: [
    {
      id: "c1",
      name: "cached espresso",
      base_price: 3.5,
      is_active: true,
      is_available: true,
      version: 2,
    },
  ],
  addOns: [],
};
const liveMenu: Menu = {
  drinks: [
    {
      id: "d1",
      name: "live latte",
      base_price: 5.5,
      is_active: true,
      is_available: true,
      version: 1,
    },
  ],
  addOns: [
    { id: "o1", name: "live shot", price: 1.5, is_available: true, version: 1 },
  ],
};

function Probe({ staff }: { staff?: Staff }) {
  const { menu, connected, error } = useMenu(staff);
  return (
    <div>
      <p data-testid="connected">{connected ? "online" : "offline"}</p>
      <p data-testid="error">{error}</p>
      <p data-testid="menu">
        {menu
          ? [...menu.drinks, ...menu.addOns].map((i) => i.name).join(",")
          : "none"}
      </p>
    </div>
  );
}

function text(name: string): string {
  return host.querySelector(`[data-testid="${name}"]`)!.textContent ?? "";
}

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value,
    configurable: true,
  });
}

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  setVisibility("visible");
  mocks.requestJson.mockResolvedValue(liveMenu);
  await offlineStore.snapshots.clear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  if (vi.isFakeTimers()) vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows a successful refresh and persists it as the cached snapshot", async () => {
  await act(async () => root.render(<Probe staff={staff} />));
  await vi.waitFor(() => expect(text("menu")).toContain("live latte"));
  expect(text("connected")).toBe("online");
  expect(text("error")).toBe("");
  const snapshot = await offlineStore.snapshots.get(staff.id);
  expect(snapshot?.menu).toEqual(liveMenu);
});

it("restores the cached snapshot when the refresh fails", async () => {
  await updateSnapshot(staff, { menu: cachedMenu });
  mocks.requestJson.mockRejectedValue(new TypeError("offline"));
  await act(async () => root.render(<Probe staff={staff} />));
  await vi.waitFor(() => expect(text("menu")).toContain("cached espresso"));
  expect(text("connected")).toBe("offline");
  expect(text("error")).toBe("offline");
});

it("shows the failure message when no snapshot is cached", async () => {
  mocks.requestJson.mockRejectedValue(new Error("Cannot reach the booth."));
  await act(async () => root.render(<Probe staff={staff} />));
  await vi.waitFor(() => expect(text("connected")).toBe("offline"));
  expect(text("menu")).toBe("none");
  expect(text("error")).toBe("Cannot reach the booth.");
});

it("refreshes when the tab becomes visible again", async () => {
  setVisibility("hidden");
  await act(async () => root.render(<Probe staff={staff} />));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(mocks.requestJson).not.toHaveBeenCalled();
  setVisibility("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.waitFor(() => expect(text("menu")).toContain("live latte"));
  expect(mocks.requestJson).toHaveBeenCalledTimes(1);
});

it("pauses on offline and refreshes again on reconnect", async () => {
  await act(async () => root.render(<Probe staff={staff} />));
  await vi.waitFor(() => expect(text("connected")).toBe("online"));
  await act(async () => {
    window.dispatchEvent(new Event("offline"));
  });
  expect(text("connected")).toBe("offline");
  expect(text("error")).toContain(
    "No connection. Your draft stays on this device",
  );
  const callsBefore = mocks.requestJson.mock.calls.length;
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await vi.waitFor(() =>
    expect(mocks.requestJson.mock.calls.length).toBeGreaterThan(callsBefore),
  );
  await vi.waitFor(() => expect(text("connected")).toBe("online"));
});

it("polls on the interval timer while mounted", async () => {
  vi.useFakeTimers();
  setVisibility("visible");
  await act(async () => root.render(<Probe />));
  expect(mocks.requestJson).toHaveBeenCalledTimes(1);
  await act(async () => {
    vi.advanceTimersByTime(3000);
  });
  await act(async () => {});
  expect(mocks.requestJson).toHaveBeenCalledTimes(2);
});

it("clears the timer and removes the listeners on unmount", async () => {
  const intervalSpy = vi.spyOn(globalThis, "setInterval");
  const clearSpy = vi.spyOn(globalThis, "clearInterval");
  await act(async () => root.render(<Probe />));
  await act(async () => root.unmount());
  host.remove();
  expect(clearSpy).toHaveBeenCalledTimes(1);
  const startedIds = intervalSpy.mock.results.map((r) => r.value);
  expect(startedIds).toContain(clearSpy.mock.calls[0][0]);
  // No listener survives the unmount, so reconnecting does not refetch.
  const callsBefore = mocks.requestJson.mock.calls.length;
  window.dispatchEvent(new Event("online"));
  await act(async () => {});
  expect(mocks.requestJson.mock.calls.length).toBe(callsBefore);
});
