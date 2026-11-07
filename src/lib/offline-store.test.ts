import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedStaff,
  offlineStore,
  rememberStaff,
  syncPendingOrders,
  updateSnapshot,
} from "./offline-store";

const staff = { id: "staff-1", username: "barista", role: "barista" as const };

afterEach(async () => {
  await offlineStore.snapshots.clear();
  await offlineStore.pendingOrders.clear();
  vi.unstubAllGlobals();
});

describe("offline persistence", () => {
  it("retains a verified staff snapshot across reads and merges cached sections", async () => {
    await rememberStaff(staff);
    await updateSnapshot(staff, { orders: [] });
    await updateSnapshot(staff, { pending: [] });
    expect(await cachedStaff()).toEqual(staff);
    expect((await offlineStore.snapshots.get(staff.id))?.orders).toEqual([]);
  });

  it("keeps failed orders and removes confirmed orders", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const attempt = {
      draft: {
        requestId: "request-1",
        firstName: "Mei",
        mobile: "",
        consent: false,
        lines: [],
      },
      totalCents: 300,
    };
    await offlineStore.pendingOrders.put({
      requestId: "request-1",
      staffId: staff.id,
      attempt,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({ error: "Try again" }),
        })
        .mockResolvedValueOnce({ ok: true }),
    );
    expect((await syncPendingOrders(staff))[0].error).toBe("Try again");
    expect(await syncPendingOrders(staff)).toEqual([]);
    expect(await offlineStore.pendingOrders.count()).toBe(0);
  });
});
