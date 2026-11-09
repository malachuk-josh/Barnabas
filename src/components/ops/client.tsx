"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** POSTs an action to an Operations API and throws the server's kind message on failure. */
export async function opsApi<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json as T;
}

/** Runs an action, shows its error or a notice, and refreshes the server-rendered page on success. */
export function useOps(path: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function act<T = Record<string, unknown>>(body: unknown, after?: (out: T) => void | string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const out = await opsApi<T>(path, body);
      const msg = after?.(out);
      if (typeof msg === "string") setNotice(msg);
      router.refresh();
      return out;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { act, busy, error, notice, setError, setNotice };
}

export const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
export const money = (cents?: number) => (cents ? `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}` : "Free");

/** Today in the browser's time zone, yyyy-mm-dd. */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Status({ error, notice }: { error: string | null; notice?: string | null }) {
  if (error)
    return (
      <p className="notice notice-danger ops-status" role="alert">
        {error}
      </p>
    );
  if (notice)
    return (
      <p className="notice success ops-status" role="status">
        {notice}
      </p>
    );
  return null;
}
