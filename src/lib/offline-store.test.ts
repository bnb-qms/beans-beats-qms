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
  await offlineStore.syncedOrders.clear();
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
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "order-1",
            order_number: 12,
            customer_first_name: "Mei",
            event_day: "2026-11-07",
            items: [],
          }),
        }),
    );
    expect((await syncPendingOrders(staff))[0].error).toBe("Try again");
    expect(await syncPendingOrders(staff)).toEqual([]);
    expect(await offlineStore.pendingOrders.count()).toBe(0);
    expect(
      (await offlineStore.syncedOrders.get("request-1"))?.receipt.order_number,
    ).toBe(12);
  });

  it("holds a rejected order for review without retrying and retains the POS amount", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const attempt = {
      draft: {
        requestId: "request-2",
        firstName: "Arjun",
        mobile: "",
        consent: false,
        lines: [],
      },
      totalCents: 800,
    };
    await offlineStore.pendingOrders.put({
      requestId: "request-2",
      staffId: staff.id,
      attempt,
    });
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Price changed" }),
    });
    vi.stubGlobal("fetch", fetcher);
    const [rejected] = await syncPendingOrders(staff);
    expect(rejected).toMatchObject({
      needsReview: true,
      error: "Price changed",
      attempt: { totalCents: 800 },
    });
    await syncPendingOrders(staff);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses only the most recently verified staff account offline", async () => {
    await rememberStaff(staff);
    const admin = { id: "staff-2", username: "admin", role: "admin" as const };
    await rememberStaff(admin);
    expect(await cachedStaff()).toEqual(admin);
    expect((await offlineStore.snapshots.get(staff.id))?.verifiedUntil).toBe(0);
  });
});
