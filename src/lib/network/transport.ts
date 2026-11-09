import { createHash } from "node:crypto";
import { getJSON, kv, setJSON, withLock } from "../store";
import type { ChurchProfile, Invite, Link, SharedItem } from "./types";

/**
 * The network seam. Everything Mesa does between churches goes through this interface; the service layer
 * never touches another church's keys itself. Today there is one deployment, so `LocalTransport` keeps the
 * whole network in this app's Redis under `mesa:*`, with each church's data under its own id. A future
 * multi-tenant or federated Mesa replaces this with an HTTP transport: `deliverLink` becomes a signed
 * request to the peer's Barnabas, `publish` pushes to (or is pulled by) connected peers, and `searchPeers`
 * asks each connected peer's search endpoint. The consent rules (two admin approvals, scrubbing before
 * anything leaves) stay in the service layer, on the sending side, either way.
 *
 * Redis layout:
 *   mesa:profile:{church}     the church's network profile (name, joined)
 *   mesa:invite:{sha256(code)} an invite code's issuer, 7-day expiry
 *   mesa:links:{church}       that church's view of its connections
 *   mesa:items:{church}       what that church has shared
 */
export interface NetworkTransport {
  getProfile(church: string): Promise<ChurchProfile | null>;
  saveProfile(p: ChurchProfile): Promise<void>;
  saveInvite(code: string, invite: Invite): Promise<void>;
  takeInvite(code: string): Promise<Invite | null>;
  links(church: string): Promise<Link[]>;
  /** Writes one side's view of a link (null removes it). In a federated version, the peer's side is a message. */
  deliverLink(church: string, peer: string, link: Link | null): Promise<void>;
  items(church: string): Promise<SharedItem[]>;
  publish(church: string, items: SharedItem[]): Promise<void>;
}

const k = (part: string) => `mesa:${part}`;
export const codeHash = (code: string) => createHash("sha256").update(code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");

export class LocalTransport implements NetworkTransport {
  getProfile(church: string) {
    return getJSON<ChurchProfile>(k(`profile:${church}`));
  }
  async saveProfile(p: ChurchProfile) {
    await setJSON(k(`profile:${p.churchId}`), p);
  }
  async saveInvite(code: string, invite: Invite) {
    await setJSON(k(`invite:${codeHash(code)}`), invite, { ttlSeconds: Math.max(60, Math.round((invite.expiresAt - Date.now()) / 1000)) });
  }
  async takeInvite(code: string) {
    const key = k(`invite:${codeHash(code)}`);
    const invite = await getJSON<Invite>(key);
    if (!invite) return null;
    await kv().del(key); // single use
    return invite.expiresAt > Date.now() ? invite : null;
  }
  async links(church: string) {
    return (await getJSON<Link[]>(k(`links:${church}`))) ?? [];
  }
  async deliverLink(church: string, peer: string, link: Link | null) {
    await withLock(k(`links-lock:${church}`), async () => {
      const all = (await this.links(church)).filter((l) => l.peer !== peer);
      if (link) all.push(link);
      await setJSON(k(`links:${church}`), all);
    });
  }
  async items(church: string) {
    return (await getJSON<SharedItem[]>(k(`items:${church}`))) ?? [];
  }
  async publish(church: string, items: SharedItem[]) {
    await setJSON(k(`items:${church}`), items.slice(-500));
  }
}
