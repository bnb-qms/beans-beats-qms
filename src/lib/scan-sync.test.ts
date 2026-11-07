// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineStore } from "./offline-store";
import { hashCode } from "./scan";
import {
  dismissScan,
  refreshReadyCopy,
  REQUEST_MS,
  scanCode,
  syncScans,
} from "./scan-sync";

const staff = { id: "staff-1", username: "barista", role: "barista" as const };
const code = "a".repeat(64);
const other = "b".repeat(64);
const fetchMock = vi.fn();
const reply = (status: number, value: unknown) =>
  Promise.resolve(Response.json(value, { status }));
const outcome = (result: string) => ({
  result,
  order_number: 12,
  customer_first_name: "Mei",
});

function online(value: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

async function saveCopy() {
  await offlineStore.readyCopies.put({
    staffId: staff.id,
    orders: [
      {
        code_hash: await hashCode(code),
        order_number: 12,
        customer_first_name: "Mei",
      },
    ],
    savedAt: Date.now(),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  online(true);
});

afterEach(async () => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await offlineStore.pendingScans.clear();
  await offlineStore.readyCopies.clear();
  await offlineStore.snapshots.clear();
});

describe("scanCode online", () => {
  it("shows green when the server collects the order", async () => {
    fetchMock.mockReturnValue(reply(200, outcome("collected")));
    expect(await scanCode(staff, code)).toEqual({
      tone: "collected",
      title: "#12 Mei",
      detail: "Enjoy your drink!",
    });
    expect(await offlineStore.pendingScans.count()).toBe(0);
  });

  it("treats an already collected order as success", async () => {
    fetchMock.mockReturnValue(reply(200, outcome("already_collected")));
    expect((await scanCode(staff, code)).tone).toBe("collected");
  });

  it("shows amber for an order that is not ready, cancelled or unknown", async () => {
    fetchMock.mockReturnValueOnce(reply(200, outcome("not_ready")));
    expect(await scanCode(staff, code)).toMatchObject({
      tone: "check",
      title: "Not ready yet",
    });
    fetchMock.mockReturnValueOnce(reply(200, outcome("cancelled")));
    expect((await scanCode(staff, code)).tone).toBe("check");
    fetchMock.mockReturnValueOnce(reply(404, { error: "Not found" }));
    expect(await scanCode(staff, code)).toMatchObject({
      tone: "check",
      title: "Order not found",
    });
  });

  it("falls back to the local copy when the server cannot be reached", async () => {
    await saveCopy();
    fetchMock.mockRejectedValue(new TypeError("offline"));
    expect((await scanCode(staff, code)).tone).toBe("collected");
    expect(await offlineStore.pendingScans.get(code)).toMatchObject({
      label: "#12 Mei",
    });
  });
});

describe("stalled requests", () => {
  it("treats a hanging request as offline instead of freezing the scanner", async () => {
    await saveCopy();
    // Never answers, like a request stuck on weak Wi-Fi; only the abort ends it.
    fetchMock.mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const result = scanCode(staff, code);
      await vi.advanceTimersByTimeAsync(REQUEST_MS);
      vi.useRealTimers();
      expect((await result).tone).toBe("collected");
      expect(await offlineStore.pendingScans.count()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("scanCode offline", () => {
  beforeEach(() => online(false));

  it("shows green and saves a scan found in the local copy", async () => {
    await saveCopy();
    expect((await scanCode(staff, code)).tone).toBe("collected");
    expect(await offlineStore.pendingScans.count()).toBe(1);
    expect((await offlineStore.readyCopies.get(staff.id))?.orders).toEqual([]);
    // Showing the QR again still shows green, without a second saved scan.
    expect((await scanCode(staff, code)).tone).toBe("collected");
    expect(await offlineStore.pendingScans.count()).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows amber and saves nothing for a code not in the copy", async () => {
    await saveCopy();
    expect(await scanCode(staff, other)).toMatchObject({
      tone: "check",
      title: "Can't confirm right now",
    });
    expect(await offlineStore.pendingScans.count()).toBe(0);
  });
});

describe("syncScans", () => {
  async function saveScan(scanCodeValue: string) {
    await offlineStore.pendingScans.put({
      code: scanCodeValue,
      staffId: staff.id,
      label: "#12 Mei",
      scannedAt: Date.now(),
    });
  }

  it("removes confirmed scans and flags rejected ones for review", async () => {
    await saveScan(code);
    await saveScan(other);
    fetchMock.mockImplementation((_url, init: RequestInit) =>
      JSON.parse(init.body as string).code === code
        ? reply(200, outcome("collected"))
        : reply(200, outcome("not_ready")),
    );
    await syncScans();
    expect(await offlineStore.pendingScans.get(code)).toBeUndefined();
    expect(await offlineStore.pendingScans.get(other)).toMatchObject({
      needsReview: true,
    });
    await dismissScan(other);
    expect(await offlineStore.pendingScans.count()).toBe(0);
  });

  it("sends scans saved by a staff member who has since signed out", async () => {
    await offlineStore.pendingScans.put({
      code,
      staffId: "staff-who-left",
      label: "#12 Mei",
      scannedAt: Date.now(),
    });
    fetchMock.mockReturnValue(reply(200, outcome("collected")));
    await syncScans();
    expect(await offlineStore.pendingScans.count()).toBe(0);
  });

  it("keeps scans when the server is unreachable", async () => {
    await saveScan(code);
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await syncScans();
    expect(await offlineStore.pendingScans.get(code)).toMatchObject({
      code,
    });
    expect(
      (await offlineStore.pendingScans.get(code))?.needsReview,
    ).toBeUndefined();
  });
});

describe("refreshReadyCopy", () => {
  it("stores the server list but hides scans still waiting to sync", async () => {
    await offlineStore.pendingScans.put({
      code,
      staffId: staff.id,
      label: "#12 Mei",
      scannedAt: Date.now(),
    });
    const waitingHash = await hashCode(code);
    const otherHash = await hashCode(other);
    fetchMock.mockReturnValue(
      reply(200, {
        orders: [
          {
            code_hash: waitingHash,
            order_number: 12,
            customer_first_name: "Mei",
          },
          { code_hash: otherHash, order_number: 13, customer_first_name: "" },
        ],
      }),
    );
    expect(await refreshReadyCopy(staff)).toBe(true);
    expect(
      (await offlineStore.readyCopies.get(staff.id))?.orders.map(
        (o) => o.order_number,
      ),
    ).toEqual([13]);
  });

  it("keeps the old copy when the server fails", async () => {
    await saveCopy();
    fetchMock.mockReturnValue(reply(503, { error: "down" }));
    expect(await refreshReadyCopy(staff)).toBe(false);
    expect((await offlineStore.readyCopies.get(staff.id))?.orders).toHaveLength(
      1,
    );
  });
});
