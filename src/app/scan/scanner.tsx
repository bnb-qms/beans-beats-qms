"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { offlineStore, type PendingScan } from "@/lib/offline-store";
import { trackingCodeFromQr } from "@/lib/scan";
import {
  dismissScan,
  refreshReadyCopy,
  scanCode,
  syncScans,
  type ScanDisplay,
} from "@/lib/scan-sync";
import type { Staff } from "@/lib/staff-server";

const RESULT_MS = 3000;
const SAME_CODE_MS = 5000;
const FRAME_MS = 200;
const SYNC_MS = 3000;

export function Scanner({ staff }: { staff: Staff }) {
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const recent = useRef(new Map<string, number>());
  const [camera, setCamera] = useState<"starting" | "on" | "blocked">(
    "starting",
  );
  const [cameraTry, setCameraTry] = useState(0);
  const [shown, setShown] = useState<ScanDisplay | null>(null);
  const [online, setOnline] = useState(true);
  const [scans, setScans] = useState<PendingScan[]>([]);

  const loadScans = useCallback(async () => {
    setScans(
      await offlineStore.pendingScans
        .where("staffId")
        .equals(staff.id)
        .toArray(),
    );
  }, [staff.id]);

  const read = useCallback(
    async (text: string) => {
      const code = trackingCodeFromQr(text);
      if (!code || busy.current) return;
      const now = Date.now();
      if (now - (recent.current.get(code) ?? 0) < SAME_CODE_MS) return;
      recent.current.set(code, now);
      busy.current = true;
      try {
        setShown(await scanCode(staff, code));
      } catch {
        setShown({
          tone: "check",
          title: "Can't confirm right now",
          detail: "Please show your pickup number to the barista.",
        });
      }
      void loadScans();
      setTimeout(() => {
        setShown(null);
        busy.current = false;
      }, RESULT_MS);
    },
    [staff, loadScans],
  );
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  }, [read]);

  // Webcam: decode a downscaled frame five times a second.
  useEffect(() => {
    let live = true;
    let stream: MediaStream | undefined;
    let frame = 0;
    let last = 0;
    const canvas = document.createElement("canvas");
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const v = video.current;
      if (time - last < FRAME_MS || busy.current || !v || v.readyState < 2)
        return;
      last = time;
      const scale = Math.min(1, 640 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || !canvas.width) return;
      context.drawImage(v, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height, {
        inversionAttempts: "dontInvert",
      });
      if (found) void readRef.current(found.data);
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 } },
          audio: false,
        });
        if (!live || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setCamera("on");
        frame = requestAnimationFrame(tick);
      } catch {
        if (live) setCamera("blocked");
      }
    })();
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraTry]);

  // While online: send saved scans, then refresh the local copy of Ready orders.
  useEffect(() => {
    let live = true;
    const run = async () => {
      const isOnline = navigator.onLine !== false;
      setOnline(isOnline);
      if (isOnline) {
        await syncScans(staff);
        const fresh = await refreshReadyCopy(staff);
        if (live) setOnline(fresh);
      }
      if (live) await loadScans();
    };
    void run();
    const timer = setInterval(() => void run(), SYNC_MS);
    const changed = () => void run();
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    window.addEventListener("offline-scans-changed", loadScans);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
      window.removeEventListener("offline-scans-changed", loadScans);
    };
  }, [staff, loadScans]);

  const waiting = scans.filter((s) => !s.needsReview).length;
  const review = scans.filter((s) => s.needsReview);

  return (
    <section className="py-8">
      <ScanResult shown={shown} />
      <p className="eyebrow">Pickup</p>
      <h1 className="display mt-2">Show your order QR</h1>
      <p className="mt-4 max-w-2xl text-xl">
        Hold the QR from your order page up to the camera to collect your drink.
      </p>
      <div className="mt-6 max-w-3xl border-[3px] border-ink bg-ink">
        {/* Mirrored, so customers move their phone the way they expect. */}
        <video
          ref={video}
          muted
          playsInline
          aria-label="Camera preview"
          className="aspect-video w-full -scale-x-100 object-cover"
        />
      </div>
      {camera === "blocked" && (
        <div
          role="alert"
          className="mt-4 max-w-3xl border-l-4 border-error bg-panel p-4"
        >
          <p className="font-bold text-error">Camera unavailable.</p>
          <p className="mt-1">
            Allow camera access for this site, then try again. Until then,
            baristas use Mark collected on the queue.
          </p>
          <Button className="mt-3" onClick={() => setCameraTry((n) => n + 1)}>
            Try camera again
          </Button>
        </div>
      )}
      <p role="status" className="mt-4 text-sm text-muted">
        {camera === "starting" ? "Starting camera… " : ""}
        {online
          ? `Online${waiting ? ` · sending ${waiting} saved scan${waiting === 1 ? "" : "s"}` : ""}`
          : `Offline · ${waiting} scan${waiting === 1 ? "" : "s"} waiting to send. Unconfirmed codes go to the barista.`}
      </p>
      {review.length > 0 && (
        <section className="mt-8 max-w-3xl">
          <h2 className="section-title">Needs review ({review.length})</h2>
          <ul>
            {review.map((scan) => (
              <li
                key={scan.code}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-hair py-3"
              >
                <span>
                  <strong>{scan.label}</strong>
                  <span className="block text-sm text-muted">{scan.error}</span>
                </span>
                <Button
                  variant="quiet"
                  onClick={() => void dismissScan(scan.code)}
                >
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

export function ScanResult({ shown }: { shown: ScanDisplay | null }) {
  return (
    <div aria-live="assertive" aria-atomic="true">
      {shown && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center ${
            shown.tone === "collected"
              ? "bg-collected text-paper"
              : "bg-check text-ink"
          }`}
        >
          <p aria-hidden="true" className="display">
            {shown.tone === "collected" ? "✓" : "!"}
          </p>
          <p className="display numeral mt-6">{shown.title}</p>
          <p className="headline mt-6 max-w-4xl">{shown.detail}</p>
        </div>
      )}
    </div>
  );
}
