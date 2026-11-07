"use client";

import { useEffect, useState } from "react";
import { cachedStaff, syncPendingOrders } from "@/lib/offline-store";

export function OfflineSupport() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      void navigator.serviceWorker.register("/sw.js");
    const sync = async () => {
      if (!navigator.onLine) return;
      const staff = await cachedStaff().catch(() => null);
      if (staff) await syncPendingOrders(staff).catch(() => {});
    };
    void sync();
    const timer = setInterval(() => void sync(), 3000);
    window.addEventListener("online", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline ? (
    <p
      role="status"
      className="bg-signal px-4 py-2 text-center font-bold text-ink"
    >
      Offline · changes will sync when connected
    </p>
  ) : null;
}
