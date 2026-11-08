"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Menu } from "@/lib/order";
import { requestJson, staffMessage } from "./staff-workspace";
import { offlineStore, updateSnapshot } from "@/lib/offline-store";
import type { Staff } from "@/lib/staff-server";

export function useMenu(staff?: Staff) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const pending = useRef<Promise<Menu> | null>(null);
  const refresh = useCallback((): Promise<Menu> => {
    if (pending.current) return pending.current;
    pending.current = requestJson<Menu>("/api/counter/menu")
      .then((data) => {
        if (active.current) {
          setMenu(data);
          setConnected(true);
          setError("");
          if (staff) void updateSnapshot(staff, { menu: data });
        }
        return data;
      })
      .catch((e) => {
        if (active.current) {
          setConnected(false);
          setError(
            staffMessage(
              e,
              "Cannot refresh the menu. Reconnect and try again.",
            ),
          );
        }
        throw e;
      })
      .finally(() => {
        pending.current = null;
      });
    return pending.current;
  }, [staff]);
  useEffect(() => {
    active.current = true;
    if (staff)
      void offlineStore.snapshots.get(staff.id).then((snapshot) => {
        if (active.current && snapshot?.menu) setMenu(snapshot.menu);
      });
    const load = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    const offline = () => {
      setConnected(false);
      setError(
        "No connection. Your draft stays on this device; submissions and menu saves are paused.",
      );
    };
    load();
    const timer = setInterval(load, 3000);
    window.addEventListener("online", load);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", load);
    return () => {
      active.current = false;
      clearInterval(timer);
      window.removeEventListener("online", load);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", load);
    };
  }, [refresh, staff]);
  return { menu, connected, error, refresh };
}
