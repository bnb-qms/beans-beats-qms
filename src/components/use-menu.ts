"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Menu } from "@/lib/order";
import { requestJson } from "./staff-workspace";

export function useMenu() {
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
        }
        return data;
      })
      .catch((e) => {
        if (active.current) {
          setConnected(false);
          setError(
            e instanceof Error
              ? e.message
              : "Cannot refresh the menu. Reconnect and try again.",
          );
        }
        throw e;
      })
      .finally(() => {
        pending.current = null;
      });
    return pending.current;
  }, []);
  useEffect(() => {
    active.current = true;
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
  }, [refresh]);
  return { menu, connected, error, refresh };
}
