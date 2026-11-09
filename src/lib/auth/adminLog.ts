import { audit } from "../data/records";
import { getJSON, setJSON } from "../store";
import type { Leader } from "./session";

/**
 * The Admin console's activity list (`adminlog:{church}`, the last 200), alongside the acting owner's own
 * audit log. Entries name who did what to whom; never a password, hash or link token.
 */
export type AdminLogEntry = { at: number; byId: string; byName: string; action: string; targetId?: string; targetEmail?: string; detail?: string };

const key = (churchId: string) => `adminlog:${churchId}`;

export async function adminAudit(actor: Leader, entry: { action: string; targetId?: string; targetEmail?: string; detail?: string }) {
  await audit(actor, { action: `admin.${entry.action}`, detail: [entry.targetId, entry.detail].filter(Boolean).join(" ") });
  const all = (await getJSON<AdminLogEntry[]>(key(actor.churchId))) ?? [];
  all.push({ at: Date.now(), byId: actor.leaderId, byName: actor.name, ...entry });
  await setJSON(key(actor.churchId), all.slice(-200));
}

export async function recentAdminActivity(churchId: string, limit = 25) {
  return ((await getJSON<AdminLogEntry[]>(key(churchId))) ?? []).slice(-limit).reverse();
}
