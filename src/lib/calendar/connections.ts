import type { Leader } from "../auth/session";
import { getJSON, kv, setJSON } from "../store";
import { open, seal } from "./crypto";
import { google } from "./providers/google";
import { microsoft } from "./providers/microsoft";
import type { CalendarProvider, Tokens } from "./providers/types";
import type { ProviderId } from "./types";

export const PROVIDERS: Record<ProviderId, CalendarProvider> = { google, microsoft };

export function provider(id: string): CalendarProvider | null {
  return id === "google" || id === "microsoft" ? PROVIDERS[id] : null;
}

type Stored = {
  provider: ProviderId;
  account: string;
  sealedTokens: string;
  connectedAt: number;
  /** Copy Barnabas events into this calendar. */
  push: boolean;
  lastError?: string;
  lastErrorAt?: number;
};

export type ConnectionStatus = Omit<Stored, "sealedTokens">;

const key = (l: Pick<Leader, "churchId" | "leaderId">, p: ProviderId) => `calconn:${l.churchId}:${l.leaderId}:${p}`;

export async function saveConnection(leader: Leader, p: ProviderId, account: string, tokens: Tokens) {
  const stored: Stored = { provider: p, account, sealedTokens: await seal(JSON.stringify(tokens)), connectedAt: Date.now(), push: true };
  await setJSON(key(leader, p), stored);
}

export async function connectionStatus(leader: Leader, p: ProviderId): Promise<ConnectionStatus | null> {
  const stored = await getJSON<Stored>(key(leader, p));
  if (!stored) return null;
  const { sealedTokens: _hidden, ...status } = stored;
  return status;
}

export async function setPush(leader: Leader, p: ProviderId, push: boolean) {
  const stored = await getJSON<Stored>(key(leader, p));
  if (stored) await setJSON(key(leader, p), { ...stored, push });
}

export async function recordError(leader: Leader, p: ProviderId, message: string | null) {
  const stored = await getJSON<Stored>(key(leader, p));
  if (!stored) return;
  await setJSON(key(leader, p), { ...stored, lastError: message ?? undefined, lastErrorAt: message ? Date.now() : undefined });
}

export async function disconnect(leader: Leader, p: ProviderId) {
  await kv().del(key(leader, p));
}

/** A current access token, refreshed and re-sealed when it is about to expire. */
export async function accessToken(leader: Leader, p: ProviderId): Promise<string | null> {
  const stored = await getJSON<Stored>(key(leader, p));
  if (!stored) return null;
  let tokens = JSON.parse(await open(stored.sealedTokens)) as Tokens;
  if (tokens.expiresAt <= Date.now()) {
    if (!tokens.refreshToken) return null;
    tokens = await PROVIDERS[p].refresh(tokens.refreshToken);
    await setJSON(key(leader, p), { ...stored, sealedTokens: await seal(JSON.stringify(tokens)) });
  }
  return tokens.accessToken;
}

/** Connected providers, with the leader's status for each. */
export async function connections(leader: Leader) {
  const out: (ConnectionStatus & { label: string })[] = [];
  for (const p of Object.values(PROVIDERS)) {
    const status = await connectionStatus(leader, p.id);
    if (status) out.push({ ...status, label: p.label });
  }
  return out;
}

/* ---------- Private subscription feed (Apple Calendar, or any calendar app) ---------- */

const feedKey = (l: Pick<Leader, "churchId" | "leaderId">) => `calfeed:${l.churchId}:${l.leaderId}`;
const feedTokenKey = (token: string) => `calfeed:token:${token}`;

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function feedToken(leader: Leader, rotate = false): Promise<string> {
  const existing = await kv().get(feedKey(leader));
  if (existing && !rotate) return existing;
  if (existing) await kv().del(feedTokenKey(existing));
  const token = randomToken();
  await kv().set(feedKey(leader), token);
  await setJSON(feedTokenKey(token), { churchId: leader.churchId, leaderId: leader.leaderId });
  return token;
}

export async function existingFeedToken(leader: Leader) {
  return kv().get(feedKey(leader));
}

export async function leaderForFeed(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return getJSON<{ churchId: string; leaderId: string }>(feedTokenKey(token));
}

export async function stopFeed(leader: Leader) {
  const existing = await kv().get(feedKey(leader));
  if (existing) await kv().del(feedTokenKey(existing), feedKey(leader));
}
