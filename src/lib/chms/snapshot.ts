import { getJSON, setJSON } from "../store";
import type { Person, Roster, ServingRecord, Team } from "./types";

/**
 * A church's real people, cached in Redis from its ChMS (Planning Center sync) or a CSV import (ChurchTrac).
 *
 *   chms:{church}:snapshot     the people, households, teams and serving the adapter serves from
 *   chms:{church}:connection   Planning Center connection state (no secrets: the token lives in env vars)
 *   chms:{church}:sync-lock    one sync at a time
 */
export type Household = { id: string; name: string; memberIds: string[] };

export type SnapshotSource = "planning_center" | "import";

export type ChmsSnapshot = {
  version: 1;
  /** Where people came from. A Planning Center sync replaces its own people; imports merge by dedupe key. */
  sources: SnapshotSource[];
  syncedAt: number;
  people: (Person & { source: SnapshotSource; dedupeKey: string; externalId?: string })[];
  households: Household[];
  teams: Team[];
  serving: ServingRecord[];
  rosters: Roster[];
};

export type Connection = {
  provider: "planning_center";
  connectedAt: number;
  connectedBy: string;
  /** The organization name Planning Center returned, for the Settings screen. */
  organization?: string;
  includeServices: boolean;
  lastSyncAt?: number;
  lastResult?: { people: number; households: number; teams: number; plans: number; requests: number; ms: number };
  lastError?: string;
};

const k = (church: string, part: string) => `chms:${church}:${part}`;
export const snapshotKey = (church: string) => k(church, "snapshot");
export const connectionKey = (church: string) => k(church, "connection");
export const syncLockKey = (church: string) => k(church, "sync-lock");

export function emptySnapshot(): ChmsSnapshot {
  return { version: 1, sources: [], syncedAt: 0, people: [], households: [], teams: [], serving: [], rosters: [] };
}

export async function loadSnapshot(church: string): Promise<ChmsSnapshot | null> {
  return getJSON<ChmsSnapshot>(snapshotKey(church));
}

export async function saveSnapshot(church: string, snap: ChmsSnapshot) {
  await setJSON(snapshotKey(church), snap);
}

export async function getConnection(church: string) {
  return getJSON<Connection>(connectionKey(church));
}

export async function saveConnection(church: string, c: Connection | null) {
  if (c) await setJSON(connectionKey(church), c);
  else {
    const { kv } = await import("../store");
    await kv().del(connectionKey(church));
  }
}

/** True once real people are connected (a sync or an import committed at least one person). */
export function hasRealData(snap: ChmsSnapshot | null): snap is ChmsSnapshot {
  return Boolean(snap && snap.people.length > 0);
}
