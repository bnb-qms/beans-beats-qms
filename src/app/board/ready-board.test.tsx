// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The board picks its data source (sample vs rpc) when the module loads, so
// the Supabase URL must exist before the component module is imported.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
});

// Only the board's ready_orders rpc call is under test here.
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));

import { ReadyBoard } from "./ready-board";

type ReadyRow = {
  order_number: number;
  event_day: string;
  customer_first_name: string;
  ready_at: string;
};

const row = (
  orderNumber: number,
  customerFirstName: string,
  readyAt: string,
): ReadyRow => ({
  order_number: orderNumber,
  event_day: "2026-11-08",
  customer_first_name: customerFirstName,
  ready_at: readyAt,
});

const ok = (data: ReadyRow[]) => ({ data, error: null });
const fail = { data: null, error: { message: "Fetch failed" } };

// A poll whose response the test controls, to simulate overlapping requests.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("ReadyBoard", () => {
  let host: HTMLDivElement;
  let root: Root;
  let fullscreen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    fullscreen = vi.fn();
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: fullscreen,
      configurable: true,
    });
    mocks.rpc.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Mount the board and let the initial poll settle.
  async function mountAndLoad() {
    await act(async () => root.render(<ReadyBoard />));
    await act(async () => vi.advanceTimersByTimeAsync(0));
  }

  it("shows today's ready orders in ready-time order on the initial load", async () => {
    // Arrive out of order; the board must present them by ready time.
    mocks.rpc.mockResolvedValue(
      ok([
        row(43, "Wei", "2026-11-08T04:05:00.000Z"),
        row(41, "Mei", "2026-11-08T04:01:00.000Z"),
        row(42, "Arjun", "2026-11-08T04:03:00.000Z"),
      ]),
    );
    await mountAndLoad();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("ready_orders");
    expect(host.textContent).toContain("Ready for pickup");
    expect(host.textContent).toContain("Mei");
    expect(host.textContent).toContain("Arjun");
    expect(host.textContent).toContain("Wei");
    expect(host.textContent.indexOf("41")).toBeLessThan(
      host.textContent.indexOf("42"),
    );
    expect(host.textContent.indexOf("42")).toBeLessThan(
      host.textContent.indexOf("43"),
    );
    expect(host.textContent).not.toContain("Sample data");
    expect(host.textContent).not.toContain("Reconnecting");
  });

  it("shows an empty board message when no orders are ready", async () => {
    mocks.rpc.mockResolvedValue(ok([]));
    await mountAndLoad();
    expect(host.textContent).toContain("No orders ready yet");
  });

  it("polls the ready list every three seconds", async () => {
    mocks.rpc.mockResolvedValue(
      ok([row(41, "Mei", "2026-11-08T04:01:00.000Z")]),
    );
    await mountAndLoad();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(2999));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
  });

  it("keeps the last good list and flags reconnection while a poll fails", async () => {
    mocks.rpc
      .mockResolvedValueOnce(ok([row(41, "Mei", "2026-11-08T04:01:00.000Z")]))
      .mockResolvedValueOnce(fail)
      .mockResolvedValueOnce(
        ok([
          row(41, "Mei", "2026-11-08T04:01:00.000Z"),
          row(44, "Dawn", "2026-11-08T04:06:00.000Z"),
        ]),
      );
    await mountAndLoad();
    expect(host.textContent).toContain("Mei");
    expect(host.querySelector('[role="status"]')).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.textContent).toContain("Reconnecting");
    expect(host.textContent).toContain("Mei");

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.textContent).not.toContain("Reconnecting");
    expect(host.textContent).toContain("Dawn");
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
  });

  it("removes an order once it is no longer ready", async () => {
    mocks.rpc
      .mockResolvedValueOnce(
        ok([
          row(41, "Mei", "2026-11-08T04:01:00.000Z"),
          row(44, "Dawn", "2026-11-08T04:06:00.000Z"),
        ]),
      )
      .mockResolvedValueOnce(ok([row(44, "Dawn", "2026-11-08T04:06:00.000Z")]));
    await mountAndLoad();
    expect(host.textContent).toContain("Mei");
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(host.textContent).not.toContain("Mei");
    expect(host.textContent).toContain("Dawn");
  });

  it("never lets an older response restore a collected order", async () => {
    // A slow poll stays in flight while a newer poll reports that Mei was
    // collected; the slow poll's stale list must not bring her back.
    const stale = deferred<{ data: ReadyRow[]; error: null }>();
    mocks.rpc
      .mockResolvedValueOnce(ok([row(41, "Mei", "2026-11-08T04:01:00.000Z")]))
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce(ok([row(44, "Dawn", "2026-11-08T04:06:00.000Z")]));
    await mountAndLoad();
    expect(host.textContent).toContain("Mei");

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(host.textContent).not.toContain("Mei");
    expect(host.textContent).toContain("Dawn");

    await act(async () => {
      stale.resolve(
        ok([
          row(41, "Mei", "2026-11-08T04:01:00.000Z"),
          row(44, "Dawn", "2026-11-08T04:06:00.000Z"),
        ]),
      );
      await Promise.resolve();
    });
    expect(host.textContent).not.toContain("Mei");
  });

  it("requests fullscreen from the Fullscreen button", async () => {
    mocks.rpc.mockResolvedValue(ok([]));
    await mountAndLoad();
    const button = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Fullscreen",
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(fullscreen).toHaveBeenCalledTimes(1);
  });

  it("stops polling after the board is unmounted", async () => {
    mocks.rpc.mockResolvedValue(
      ok([row(41, "Mei", "2026-11-08T04:01:00.000Z")]),
    );
    await mountAndLoad();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
