import { createClient } from "@/lib/supabase/client";
import {
  isGuestOrder,
  TRACKING_TOKEN,
  type GuestOrder,
} from "@/lib/guest-order";

export type GuestTrackingState = {
  kind: "loading" | "order" | "unavailable" | "error";
  order: GuestOrder | null;
  lastUpdated: number | null;
  reconnecting: boolean;
};

export const initialGuestState: GuestTrackingState = {
  kind: "loading",
  order: null,
  lastUpdated: null,
  reconnecting: false,
};

// Follow the public-page interval in docs/building.md; F8's 5 seconds is a review target.
const POLL_MS = 3000;
const MAX_RETRY_MS = 30000;
const REQUEST_TIMEOUT_MS = 10000;

export function watchGuestOrder(
  id: string,
  onChange: (state: GuestTrackingState) => void,
) {
  let state = initialGuestState;
  let stopped = false;
  let token = "";
  let retryDelay = POLL_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let requestTimeout: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | null = null;
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const sample = !configured && id === "example";

  function publish(next: GuestTrackingState) {
    state = next;
    if (!stopped) onChange(state);
  }
  function cancel() {
    clearTimeout(timer);
    clearTimeout(requestTimeout);
    requestTimeout = undefined;
    request?.abort();
    request = null;
  }
  function stale() {
    publish({
      ...state,
      kind: state.order ? "order" : "error",
      reconnecting: true,
    });
  }
  function schedule(delay: number) {
    if (
      !stopped &&
      state.kind !== "unavailable" &&
      !document.hidden &&
      navigator.onLine
    )
      timer = setTimeout(load, delay);
  }
  async function load() {
    if (
      stopped ||
      sample ||
      state.kind === "unavailable" ||
      request ||
      document.hidden
    )
      return;
    clearTimeout(timer);
    if (!navigator.onLine) {
      stale();
      return;
    }
    const current = new AbortController();
    request = current;
    const timeout = setTimeout(() => current.abort(), REQUEST_TIMEOUT_MS);
    requestTimeout = timeout;
    let nextDelay = POLL_MS;
    try {
      if (!configured) throw new Error();
      const { data, error } = await createClient()
        .rpc("guest_order_status", { p_tracking_token: token })
        .abortSignal(current.signal);
      if (stopped || request !== current) return;
      if (error) throw new Error();
      if (Array.isArray(data) && data.length === 0) {
        publish({ ...initialGuestState, kind: "unavailable" });
        return;
      }
      if (!Array.isArray(data) || data.length !== 1 || !isGuestOrder(data[0]))
        throw new Error();
      const order = data[0];
      // Keep unchanged status content stable, separate from the changing timestamp.
      const unchanged =
        state.order &&
        state.order.order_number === order.order_number &&
        state.order.event_day === order.event_day &&
        state.order.status === order.status;
      publish({
        kind: "order",
        order: unchanged ? state.order : order,
        lastUpdated: Date.now(),
        reconnecting: false,
      });
      retryDelay = POLL_MS;
    } catch {
      if (stopped || request !== current) return;
      stale();
      nextDelay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
    } finally {
      clearTimeout(timeout);
      if (!stopped && request === current) {
        request = null;
        requestTimeout = undefined;
        schedule(nextDelay);
      }
    }
  }
  function refresh() {
    if (stopped || state.kind === "unavailable") return;
    void load();
  }
  function visibilityChanged() {
    cancel();
    if (!document.hidden) refresh();
  }
  function online() {
    cancel();
    refresh();
  }
  function offline() {
    cancel();
    if (state.kind !== "unavailable" && !sample) stale();
  }
  function linkChanged() {
    cancel();
    token = window.location.hash.slice(1);
    retryDelay = POLL_MS;
    // shortcut: only the explicit example page uses sample data without Supabase configuration.
    if (sample) {
      publish({
        ...initialGuestState,
        kind: "order",
        order: { order_number: 12, event_day: "2026-11-07", status: "queued" },
      });
    } else if (id !== "track" || !TRACKING_TOKEN.test(token)) {
      publish({ ...initialGuestState, kind: "unavailable" });
    } else {
      publish(initialGuestState);
      refresh();
    }
  }

  window.addEventListener("hashchange", linkChanged);
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  document.addEventListener("visibilitychange", visibilityChanged);
  linkChanged();
  return {
    refresh,
    stop() {
      stopped = true;
      cancel();
      window.removeEventListener("hashchange", linkChanged);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibilityChanged);
    },
  };
}
