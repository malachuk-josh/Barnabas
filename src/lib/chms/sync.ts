import type { Leader } from "../auth/session";
import { audit } from "../data/records";
import { kv } from "../store";
import { invalidateChurchData } from "./index";
import { newPcoClient, pcoCredentials, pullPlanningCenter } from "./planning-center";
import { PcoClient, PcoError, type Fetch } from "./pco";
import { emptySnapshot, getConnection, loadSnapshot, saveConnection, saveSnapshot, syncLockKey, type ChmsSnapshot, type Connection } from "./snapshot";

export class SyncError extends Error {}

/** Contact-based identity, so an imported person and the same person from Planning Center merge. */
export function identityKeys(p: { name: string; email?: string; phone?: string }) {
  const keys: string[] = [];
  if (p.email) keys.push(`e:${p.email.trim().toLowerCase()}`);
  const digits = p.phone?.replace(/\D/g, "").slice(-10);
  if (digits && digits.length === 10) keys.push(`p:${digits}:${p.name.trim().toLowerCase()}`);
  return keys;
}

/** Planning Center's people replace the last sync's; imported people stay unless Planning Center has them too. */
export function mergePco(prev: ChmsSnapshot | null, pulled: ChmsSnapshot): ChmsSnapshot {
  const fromPco = new Set(pulled.people.flatMap(identityKeys));
  const kept = (prev?.people ?? []).filter((p) => p.source === "import" && !identityKeys(p).some((k) => fromPco.has(k)));
  return {
    ...pulled,
    sources: kept.length ? ["planning_center", "import"] : ["planning_center"],
    people: [...pulled.people, ...kept],
    households: [...pulled.households, ...(prev?.households ?? []).filter((h) => h.id.startsWith("imp_"))],
  };
}

export async function connectionState(churchId: string) {
  const [connection, snap] = await Promise.all([getConnection(churchId), loadSnapshot(churchId)]);
  return {
    credentials: Boolean(pcoCredentials()),
    connection,
    people: snap?.people.length ?? 0,
    imported: snap?.people.filter((p) => p.source === "import").length ?? 0,
    households: snap?.households.length ?? 0,
    teams: snap?.teams.length ?? 0,
    syncedAt: snap?.syncedAt || null,
  };
}

/** Checks the token against Planning Center and records the connection (the token itself stays in env vars). */
export async function connectPlanningCenter(leader: Leader, includeServices: boolean, fetchImpl?: Fetch) {
  const client = newPcoClient(fetchImpl);
  if (!client) throw new SyncError("Set PCO_APP_ID and PCO_SECRET in the server settings first (see the steps below).");
  let organization: string | undefined;
  try {
    const org = await client.get("/people/v2");
    organization = (org.data as unknown as { attributes?: { name?: string } })?.attributes?.name;
  } catch (err) {
    throw new SyncError(err instanceof PcoError ? err.message : "Couldn't reach Planning Center.");
  }
  const c: Connection = { provider: "planning_center", connectedAt: Date.now(), connectedBy: leader.leaderId, organization, includeServices };
  await saveConnection(leader.churchId, c);
  await audit(leader, { action: "chms.connect", detail: `planning_center${includeServices ? " +services" : ""}` });
  return c;
}

export async function disconnectPlanningCenter(leader: Leader, removePeople: boolean) {
  await saveConnection(leader.churchId, null);
  if (removePeople) {
    const snap = await loadSnapshot(leader.churchId);
    if (snap) {
      const people = snap.people.filter((p) => p.source !== "planning_center");
      await saveSnapshot(leader.churchId, { ...emptySnapshot(), ...snap, sources: people.length ? ["import"] : [], people, households: snap.households.filter((h) => h.id.startsWith("imp_")), teams: [], serving: [], rosters: [] });
    }
  }
  invalidateChurchData();
  await audit(leader, { action: "chms.disconnect", detail: removePeople ? "people removed" : "people kept" });
}

/** Sync now: one at a time per church; the result replaces the cached snapshot. */
export async function syncPlanningCenter(leader: Leader, opts: { fetchImpl?: Fetch; client?: PcoClient } = {}) {
  const connection = await getConnection(leader.churchId);
  if (!connection) throw new SyncError("Connect Planning Center first.");
  const client = opts.client ?? newPcoClient(opts.fetchImpl);
  if (!client) throw new SyncError("PCO_APP_ID and PCO_SECRET aren't set on the server anymore.");
  const lock = syncLockKey(leader.churchId);
  if (!(await kv().setIfAbsent(lock, String(Date.now()), 10 * 60_000))) throw new SyncError("A sync is already running. Give it a minute.");
  const started = Date.now();
  try {
    const result = await pullPlanningCenter(client, { includeServices: connection.includeServices });
    const merged = mergePco(await loadSnapshot(leader.churchId), result.snapshot);
    await saveSnapshot(leader.churchId, merged);
    const lastResult = { people: result.snapshot.people.length, households: result.snapshot.households.length, teams: result.snapshot.teams.length, plans: result.plans, requests: result.requests, ms: Date.now() - started };
    await saveConnection(leader.churchId, { ...connection, organization: result.organization ?? connection.organization, lastSyncAt: Date.now(), lastResult, lastError: undefined });
    invalidateChurchData();
    await audit(leader, { action: "chms.sync", detail: `${lastResult.people} people, ${lastResult.households} households, ${lastResult.teams} teams, ${lastResult.requests} requests` });
    return lastResult;
  } catch (err) {
    const message = err instanceof PcoError ? err.message : "The sync didn't finish. Try again.";
    if (!(err instanceof PcoError)) console.error("[barnabas] planning center sync failed", err instanceof Error ? err.message : "unknown");
    await saveConnection(leader.churchId, { ...connection, lastError: message });
    throw new SyncError(message);
  } finally {
    await kv().del(lock);
  }
}
