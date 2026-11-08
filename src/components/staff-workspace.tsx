"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Button } from "./button";
import type { Staff } from "@/lib/staff-server";
import {
  cachedStaff,
  lockOfflineStaff,
  rememberStaff,
} from "@/lib/offline-store";

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !url.endsWith("/session"))
      window.dispatchEvent(new Event("staff-session-ended"));
    throw new Error(data.error ?? "Request failed. Try again.");
  }
  return data;
}
export const inputClass =
  "min-h-tap w-full border-2 border-ink bg-paper px-3 py-2 disabled:opacity-50";

export function StaffWorkspace({
  children,
}: {
  children: (staff: Staff) => ReactNode;
}) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  async function load() {
    const current = ++generation.current;
    setStaff(null);
    setLoading(true);
    try {
      const { staff } = await requestJson<{ staff: Staff | null }>(
        "/api/staff/session",
      );
      if (current === generation.current) {
        setStaff(staff);
        setError("");
        if (staff) await rememberStaff(staff);
        else await lockOfflineStaff();
      }
    } catch (cause) {
      if (current === generation.current) {
        const cached =
          cause instanceof TypeError
            ? await cachedStaff().catch(() => null)
            : null;
        if (current === generation.current) {
          setStaff(cached);
          if (!cached) await lockOfflineStaff().catch(() => {});
          setError(
            cached
              ? "Offline · using previously verified staff access."
              : "Cannot check your session. Connect and try signing in.",
          );
        }
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const ended = () => {
      ++generation.current;
      setStaff(null);
      setLoading(false);
      setError("Your session ended. Sign in again to recover your draft.");
    };
    const restored = () => void load();
    const hidden = () => {
      ++generation.current;
      setStaff(null);
      setLoading(true);
    };
    const visibility = () => {
      if (document.visibilityState === "visible") restored();
      else hidden();
    };
    const updates =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("bb-staff-session");
    channel.current = updates;
    if (updates) updates.onmessage = restored;
    window.addEventListener("staff-session-ended", ended);
    window.addEventListener("pageshow", restored);
    window.addEventListener("pagehide", hidden);
    window.addEventListener("online", restored);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current = generation.current + 1;
      clearTimeout(timer);
      updates?.close();
      channel.current = null;
      window.removeEventListener("staff-session-ended", ended);
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("pagehide", hidden);
      window.removeEventListener("online", restored);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const current = ++generation.current;
    const form = new FormData(event.currentTarget);
    try {
      const { staff } = await requestJson<{ staff: Staff }>(
        "/api/staff/session",
        {
          method: "POST",
          body: JSON.stringify({
            username: form.get("username"),
            password: form.get("password"),
          }),
        },
      );
      if (current === generation.current) {
        setStaff(staff);
        await rememberStaff(staff);
        channel.current?.postMessage("changed");
      }
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof TypeError
            ? "Online sign-in is unavailable. Connect and try again."
            : e instanceof Error
              ? e.message
              : "Sign-in failed. Try again.",
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  async function signOut() {
    ++generation.current;
    setLoading(true);
    try {
      await requestJson("/api/staff/session", { method: "DELETE" });
      ++generation.current;
      setStaff(null);
      setError("");
      await lockOfflineStaff();
      channel.current?.postMessage("changed");
    } catch {
      setError("Could not sign out. Reconnect and try again.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-ink pb-4">
        <Link href="/" className="text-xl font-bold tracking-tight">
          BEANS&amp;BEATS / STAFF
        </Link>
        {staff && !loading && (
          <nav
            aria-label="Staff workspace"
            className="flex flex-wrap items-center gap-4"
          >
            <Link
              className="inline-flex min-h-tap items-center underline"
              href="/order"
            >
              Take orders
            </Link>
            <Link
              className="inline-flex min-h-tap items-center underline"
              href="/queue"
            >
              Barista queue
            </Link>
            <Link
              className="inline-flex min-h-tap items-center underline"
              href="/scan"
            >
              Pickup scanner
            </Link>
            <Link
              className="inline-flex min-h-tap items-center underline"
              href="/menu"
            >
              Menu controls
            </Link>
            {staff.role === "admin" && (
              <Link
                className="inline-flex min-h-tap items-center underline"
                href="/report"
              >
                Daily report
              </Link>
            )}
            <span className="eyebrow">
              {staff.username} · {staff.role}
            </span>
            <Button variant="quiet" onClick={signOut}>
              Sign out
            </Button>
          </nav>
        )}
      </header>
      {error && (
        <p
          role="alert"
          className="mt-4 border-l-4 border-error bg-panel p-4 text-error"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="py-12">
          Checking staff access…
        </p>
      ) : staff ? (
        <section key={`${staff.id}:${staff.role}`}>{children(staff)}</section>
      ) : (
        <section className="mx-auto max-w-md py-12">
          <p className="eyebrow">Staff workspace</p>
          <h1 className="headline mt-2">Staff sign-in</h1>
          <p className="my-6 text-muted">
            Use the staff account provided by your booth lead.
          </p>
          <form onSubmit={signIn} className="grid gap-5">
            <label className="grid gap-2 font-bold">
              Username
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={100}
                className={inputClass}
              />
            </label>
            <label className="grid gap-2 font-bold">
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={200}
                className={inputClass}
              />
            </label>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Checking…" : "Sign in"}
            </Button>
          </form>
        </section>
      )}
    </main>
  );
}
