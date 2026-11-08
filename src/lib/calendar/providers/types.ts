import type { CalendarEvent, OutsideEvent, ProviderId } from "../types";

export type Tokens = { accessToken: string; refreshToken?: string; expiresAt: number };

export interface CalendarProvider {
  id: ProviderId;
  label: string;
  /** True when the administrator has registered the app (client id and secret are set). */
  configured(): boolean;
  authorizeUrl(redirectUri: string, state: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<Tokens>;
  refresh(refreshToken: string): Promise<Tokens>;
  account(accessToken: string): Promise<string>;
  /** Events between two instants, converted to the leader's time zone. Copies Barnabas pushed are left out. */
  list(accessToken: string, from: Date, to: Date, tz: string): Promise<OutsideEvent[]>;
  /** Create or update the copy of a Barnabas event; returns the provider's event id. */
  upsert(accessToken: string, event: CalendarEvent, tz: string, externalId?: string): Promise<string>;
  remove(accessToken: string, externalId: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function call(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 8000) });
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = body?.error?.message ?? body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
    throw new ProviderError(typeof message === "string" ? message : `HTTP ${res.status}`, res.status);
  }
  return body;
}

export function form(data: Record<string, string>) {
  return { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data).toString() };
}
