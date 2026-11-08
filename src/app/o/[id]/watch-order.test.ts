import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { watchGuestOrder, type GuestTrackingState } from "./watch-order";
import type { GuestOrder } from "@/lib/guest-order";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));

const token = "ab".repeat(32);
const order: GuestOrder = {
  order_number: 12,
  event_day: "2026-11-07",
  status: "queued",
};
const response = (status: GuestOrder["status"]) => ({
  data: [{ ...order, status }],
  error: null,
});
let browser: EventTarget & { location: { hash: string } };
let page: EventTarget & { hidden: boolean };
let network: { onLine: boolean };
let states: GuestTrackingState[];
let subscription: ReturnType<typeof watchGuestOrder> | undefined;
const latest = () => states.at(-1)!;
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
function start(id = "track") {
  subscription = watchGuestOrder(id, (state) => states.push(state));
  return subscription;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T02:00:00Z"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  browser = Object.assign(new EventTarget(), {
    location: { hash: `#${token}` },
  });
  page = Object.assign(new EventTarget(), { hidden: false });
  network = { onLine: true };
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", page);
  vi.stubGlobal("navigator", network);
  states = [];
  mocks.rpc.mockReset().mockImplementation(() => ({ abortSignal: mocks.read }));
  mocks.read.mockReset().mockResolvedValue(response("queued"));
});
afterEach(() => {
  subscription?.stop();
  subscription = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("polls confirmed progress using the same protected token, including corrections", async () => {
  start();
  await tick();
  expect(latest().order?.status).toBe("queued");
  for (const status of [
    "preparing",
    "ready",
    "preparing",
    "ready",
    "collected",
    "cancelled",
  ] as const) {
    mocks.read.mockResolvedValueOnce(response(status));
    await tick(3000);
    expect(latest().order?.status).toBe(status);
    expect(latest().reconnecting).toBe(false);
  }
  expect(mocks.rpc).toHaveBeenCalledTimes(7);
  for (const call of mocks.rpc.mock.calls)
    expect(call).toEqual(["guest_order_status", { p_tracking_token: token }]);
});

it("keeps repeated Ready content stable while updating the confirmation timestamp", async () => {
  mocks.read.mockResolvedValue(response("ready"));
  start();
  await tick();
  const first = latest();
  expect(first.order?.status).toBe("ready");
  await tick(3000);
  expect(latest().order).toBe(first.order);
  expect(latest().lastUpdated).toBe(first.lastUpdated! + 3000);
});

it("retains last-known Ready through failures and recovers directly to Collected", async () => {
  mocks.read.mockResolvedValueOnce(response("ready"));
  start();
  await tick();
  const confirmed = latest();
  mocks.read.mockRejectedValueOnce(new Error("network details"));
  await tick(3000);
  expect(latest()).toEqual({ ...confirmed, reconnecting: true });
  mocks.read.mockResolvedValueOnce(response("collected"));
  await tick(3000);
  expect(latest().order?.status).toBe("collected");
  expect(latest().reconnecting).toBe(false);
  expect(JSON.stringify(states)).not.toContain("network details");
});

it("backs off failed requests up to 30 seconds and resets after recovery", async () => {
  mocks.read.mockRejectedValue(new Error());
  start();
  await tick();
  expect(latest().kind).toBe("error");
  let calls = 1;
  for (const delay of [3000, 6000, 12000, 24000, 30000, 30000]) {
    await tick(delay - 1);
    expect(mocks.read).toHaveBeenCalledTimes(calls);
    await tick(1);
    expect(mocks.read).toHaveBeenCalledTimes(++calls);
  }
  mocks.read.mockResolvedValue(response("queued"));
  browser.dispatchEvent(new Event("online"));
  await tick();
  expect(latest().kind).toBe("order");
  await tick(3000);
  expect(mocks.read).toHaveBeenCalledTimes(calls + 2);
});

it("times out a stalled request and retries without overlapping it", async () => {
  mocks.read.mockImplementationOnce(
    (signal: AbortSignal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );
  const watcher = start();
  watcher.refresh();
  await tick(9999);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(latest().kind).toBe("error");
  await tick(3000);
  expect(latest().order?.status).toBe("queued");
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it("pauses while hidden and fetches immediately on return with only one polling loop", async () => {
  page.hidden = true;
  start();
  await tick(30000);
  expect(mocks.read).not.toHaveBeenCalled();
  page.hidden = false;
  page.dispatchEvent(new Event("visibilitychange"));
  await tick();
  expect(mocks.read).toHaveBeenCalledTimes(1);
  page.hidden = true;
  page.dispatchEvent(new Event("visibilitychange"));
  await tick(30000);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  mocks.read.mockResolvedValue(response("ready"));
  page.hidden = false;
  page.dispatchEvent(new Event("visibilitychange"));
  await tick();
  expect(latest().order?.status).toBe("ready");
  await tick(3000);
  expect(mocks.read).toHaveBeenCalledTimes(3);
});

it("waits for connectivity on initial offline load", async () => {
  network.onLine = false;
  start();
  await tick(60000);
  expect(latest().reconnecting).toBe(true);
  expect(mocks.read).not.toHaveBeenCalled();
  network.onLine = true;
  browser.dispatchEvent(new Event("online"));
  await tick();
  expect(latest().order?.status).toBe("queued");
});

it("retains stale data offline and fetches the latest state immediately on reconnect", async () => {
  start();
  await tick();
  const first = latest();
  network.onLine = false;
  browser.dispatchEvent(new Event("offline"));
  await tick(60000);
  expect(latest()).toEqual({ ...first, reconnecting: true });
  expect(mocks.read).toHaveBeenCalledTimes(1);
  mocks.read.mockResolvedValue(response("collected"));
  network.onLine = true;
  browser.dispatchEvent(new Event("online"));
  await tick();
  expect(latest().order?.status).toBe("collected");
  expect(latest().reconnecting).toBe(false);
});

it.each(["", "12", "invalid", "00000000-0000-4000-8000-000000000001"])(
  "never polls malformed tracking access %s",
  async (invalid) => {
    browser.location.hash = `#${invalid}`;
    const watcher = start();
    watcher.refresh();
    browser.dispatchEvent(new Event("online"));
    await tick(60000);
    expect(latest().kind).toBe("unavailable");
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);

it("clears expired access and stops requests until a different link is opened", async () => {
  start();
  await tick();
  mocks.read.mockResolvedValueOnce({ data: [], error: null });
  await tick(3000);
  expect(latest()).toMatchObject({
    kind: "unavailable",
    order: null,
    lastUpdated: null,
  });
  browser.dispatchEvent(new Event("online"));
  await tick(60000);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  browser.location.hash = `#${"cd".repeat(32)}`;
  browser.dispatchEvent(new Event("hashchange"));
  await tick();
  expect(latest().order?.status).toBe("queued");
});

it("ignores obsolete responses after a link changes", async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  start();
  browser.location.hash = `#${"cd".repeat(32)}`;
  mocks.read.mockResolvedValueOnce({
    data: [{ ...order, order_number: 99 }],
    error: null,
  });
  browser.dispatchEvent(new Event("hashchange"));
  await tick();
  expect(latest().order?.order_number).toBe(99);
  resolveOld(response("ready"));
  await tick();
  expect(latest().order?.order_number).toBe(99);
});

it("aborts requests and removes all timers and listeners on disposal", async () => {
  let signal!: AbortSignal;
  let resolveOld!: (value: unknown) => void;
  mocks.read.mockImplementationOnce((value: AbortSignal) => {
    signal = value;
    return new Promise((resolve) => {
      resolveOld = resolve;
    });
  });
  const watcher = start();
  watcher.stop();
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  const changes = states.length;
  resolveOld(response("ready"));
  for (const event of ["hashchange", "online", "offline"])
    browser.dispatchEvent(new Event(event));
  page.dispatchEvent(new Event("visibilitychange"));
  watcher.refresh();
  await tick(60000);
  expect(states).toHaveLength(changes);
  expect(mocks.read).toHaveBeenCalledTimes(1);
});

it("treats malformed responses as transient errors without inventing a status", async () => {
  mocks.read.mockResolvedValueOnce({
    data: [{ ...order, status: "unknown" }],
    error: null,
  });
  start();
  await tick();
  expect(latest()).toMatchObject({
    kind: "error",
    order: null,
    reconnecting: true,
  });
  await tick(3000);
  expect(latest().order?.status).toBe("queued");
});

it("refetches immediately on manual refresh and resumes the normal poll cycle", async () => {
  const watcher = start();
  await tick();
  expect(mocks.read).toHaveBeenCalledTimes(1);
  watcher.refresh();
  await tick(0);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(latest().order?.status).toBe("queued");
  await tick(2999);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  await tick(1);
  expect(mocks.read).toHaveBeenCalledTimes(3);
});

it("never overlaps a manual refresh with the in-flight request", async () => {
  let resolveFirst!: (value: unknown) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
  );
  const watcher = start();
  expect(mocks.read).toHaveBeenCalledTimes(1);
  watcher.refresh();
  await tick(0);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  resolveFirst(response("ready"));
  await tick(0);
  expect(latest().order?.status).toBe("ready");
  expect(mocks.read).toHaveBeenCalledTimes(1);
  await tick(3000);
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it("retries immediately on manual refresh after a failure and resets the backoff", async () => {
  mocks.read.mockRejectedValueOnce(new Error());
  const watcher = start();
  await tick();
  expect(latest()).toMatchObject({ kind: "error", reconnecting: true });
  watcher.refresh();
  await tick(0);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(latest()).toMatchObject({ kind: "order", reconnecting: false });
  await tick(2999);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  await tick(1);
  expect(mocks.read).toHaveBeenCalledTimes(3);
});

it("ignores manual refresh for malformed tracking access", async () => {
  browser.location.hash = "#invalid";
  const watcher = start();
  watcher.refresh();
  await tick(60000);
  expect(latest().kind).toBe("unavailable");
  expect(mocks.read).not.toHaveBeenCalled();
});

it("ignores manual refresh after the link has expired", async () => {
  const watcher = start();
  await tick();
  mocks.read.mockResolvedValueOnce({ data: [], error: null });
  await tick(3000);
  expect(latest().kind).toBe("unavailable");
  watcher.refresh();
  await tick(60000);
  expect(latest().kind).toBe("unavailable");
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it("aborts an in-flight request when the connection drops and ignores its late result", async () => {
  let signal!: AbortSignal;
  let resolveLate!: (value: unknown) => void;
  mocks.read.mockImplementationOnce((s: AbortSignal) => {
    signal = s;
    return new Promise((resolve) => {
      resolveLate = resolve;
    });
  });
  start();
  await tick();
  expect(signal.aborted).toBe(false);
  network.onLine = false;
  browser.dispatchEvent(new Event("offline"));
  await tick(0);
  expect(signal.aborted).toBe(true);
  expect(latest()).toMatchObject({
    kind: "error",
    order: null,
    reconnecting: true,
  });
  resolveLate(response("ready"));
  await tick(0);
  expect(latest()).toMatchObject({ kind: "error", order: null });
  network.onLine = true;
  browser.dispatchEvent(new Event("online"));
  await tick();
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(latest()).toMatchObject({ kind: "order", reconnecting: false });
});

it("keeps the explicit sample page labelled by the UI and makes no network requests", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  start("example");
  await tick(60000);
  expect(latest().order).toEqual(order);
  expect(latest().lastUpdated).toBeNull();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
