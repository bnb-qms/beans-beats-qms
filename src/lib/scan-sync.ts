import { lockOfflineStaff, offlineStore } from "@/lib/offline-store";
import {
  hashCode,
  isScanOutcome,
  orderLabel,
  parseReadyCodes,
  type ScanOutcome,
} from "@/lib/scan";
import type { Staff } from "@/lib/staff-server";

/** What the customer-facing screen shows after a scan. */
export type ScanDisplay = {
  tone: "collected" | "check";
  title: string;
  detail: string;
};

const SEE_BARISTA = "Please show your pickup number to the barista.";

function display(outcome: ScanOutcome): ScanDisplay {
  const label = orderLabel(outcome);
  if (outcome.result === "collected" || outcome.result === "already_collected")
    return { tone: "collected", title: label, detail: "Enjoy your drink!" };
  if (outcome.result === "not_ready")
    return {
      tone: "check",
      title: "Not ready yet",
      detail: `${label} is still being made. Watch the board for your number.`,
    };
  return { tone: "check", title: label, detail: SEE_BARISTA };
}

async function post(code: string) {
  return fetch("/api/scan", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

async function signedOut() {
  await lockOfflineStaff();
  window.dispatchEvent(new Event("staff-session-ended"));
}

/** Confirm a scan with the server, or from the local Ready copy when the server is unreachable. */
export async function scanCode(
  staff: Staff,
  code: string,
): Promise<ScanDisplay> {
  if (navigator.onLine !== false) {
    try {
      const response = await post(code);
      if (response.ok) {
        const outcome: unknown = await response.json();
        if (isScanOutcome(outcome)) {
          await forgetReady(staff, await hashCode(code));
          return display(outcome);
        }
      } else if (response.status === 401 || response.status === 403) {
        await signedOut();
        return {
          tone: "check",
          title: "Scanner signed out",
          detail: SEE_BARISTA,
        };
      } else if (response.status === 400 || response.status === 404) {
        return { tone: "check", title: "Order not found", detail: SEE_BARISTA };
      }
    } catch {
      // Unreachable: fall back to the local copy below.
    }
  }
  return scanOffline(staff, code);
}

async function scanOffline(staff: Staff, code: string): Promise<ScanDisplay> {
  const saved = await offlineStore.pendingScans.get(code);
  if (saved && !saved.needsReview)
    return {
      tone: "collected",
      title: saved.label,
      detail: "Enjoy your drink!",
    };
  const hash = await hashCode(code);
  const copy = await offlineStore.readyCopies.get(staff.id);
  const order = copy?.orders.find((o) => o.code_hash === hash);
  if (!order)
    return {
      tone: "check",
      title: "Can't confirm right now",
      detail: SEE_BARISTA,
    };
  const label = orderLabel(order);
  await offlineStore.pendingScans.put({
    code,
    staffId: staff.id,
    label,
    scannedAt: Date.now(),
  });
  await forgetReady(staff, hash);
  return { tone: "collected", title: label, detail: "Enjoy your drink!" };
}

/** A collected order must not show green again from the local copy. */
async function forgetReady(staff: Staff, hash: string) {
  await offlineStore.transaction("rw", offlineStore.readyCopies, async () => {
    const copy = await offlineStore.readyCopies.get(staff.id);
    if (!copy) return;
    await offlineStore.readyCopies.put({
      ...copy,
      orders: copy.orders.filter((o) => o.code_hash !== hash),
    });
  });
}

/** Replace the local copy of today's Ready orders. Leaves the old copy if the server is unreachable. */
export async function refreshReadyCopy(staff: Staff): Promise<boolean> {
  try {
    const response = await fetch("/api/scan", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      await signedOut();
      return false;
    }
    if (!response.ok) return false;
    const orders = parseReadyCodes((await response.json())?.orders);
    if (!orders) return false;
    // Scans waiting to sync stay hidden from the copy, so they cannot show green twice.
    const waiting = await offlineStore.pendingScans
      .where("staffId")
      .equals(staff.id)
      .toArray();
    const hashes = new Set(
      await Promise.all(waiting.map((s) => hashCode(s.code))),
    );
    await offlineStore.readyCopies.put({
      staffId: staff.id,
      orders: orders.filter((o) => !hashes.has(o.code_hash)),
      savedAt: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}

let syncing = false;

/** Send saved scans. Confirmed ones are removed; ones the server rejects go to "Needs review". */
export async function syncScans(staff: Staff): Promise<void> {
  if (syncing || navigator.onLine === false) return;
  syncing = true;
  try {
    const pending = await offlineStore.pendingScans
      .where("staffId")
      .equals(staff.id)
      .toArray();
    for (const scan of pending) {
      if (scan.needsReview) continue;
      try {
        const response = await post(scan.code);
        if (response.ok) {
          const outcome: unknown = await response.json();
          if (!isScanOutcome(outcome)) break;
          if (
            outcome.result === "collected" ||
            outcome.result === "already_collected"
          )
            await offlineStore.pendingScans.delete(scan.code);
          else
            await offlineStore.pendingScans.update(scan.code, {
              needsReview: true,
              error:
                outcome.result === "not_ready"
                  ? "Scanned offline, but the order was not Ready. Check it on the queue."
                  : "Scanned offline, but the order was cancelled.",
            });
        } else if (response.status === 400 || response.status === 404) {
          await offlineStore.pendingScans.update(scan.code, {
            needsReview: true,
            error: "Scanned offline, but the order was not found.",
          });
        } else {
          if (response.status === 401 || response.status === 403)
            await signedOut();
          break;
        }
      } catch {
        break;
      }
    }
  } finally {
    syncing = false;
    window.dispatchEvent(new Event("offline-scans-changed"));
  }
}

export async function dismissScan(code: string) {
  await offlineStore.pendingScans.delete(code);
  window.dispatchEvent(new Event("offline-scans-changed"));
}
