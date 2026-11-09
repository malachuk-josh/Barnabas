import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Leader } from "../auth/session";
import { can, type Access } from "../auth/roles";
import { churchData } from "../chms";
import { config } from "../config";
import { loadCare } from "../care/store";
import { audit } from "../data/records";
import { newId } from "../data/ids";
import { loadEvents } from "../events/store";
import { loadKids } from "../kids/store";
import { loadServe } from "../serve/store";
import { loadServices } from "../services/store";
import { ITEM_LABELS } from "../services/types";
import { listLeaders } from "../team";
import { scrubText, type ScrubResult } from "./scrub";
import { LocalTransport, type NetworkTransport } from "./transport";
import { ITEM_KINDS, KIND_LABELS, type ChurchProfile, type ItemKind, type Link, type SharedItem } from "./types";

/**
 * Mesa, the church-to-church network. Consent first: a connection needs an admin of each church (one makes
 * an invite code, the other redeems it, the first approves). Sharing needs `network.share`, and every item
 * is scrubbed of people in code before it's stored where another church can read it; the share screen
 * previews exactly the scrubbed text. Searching sees only your own items and those of connected churches.
 */

export class NetworkError extends Error {}
const fail = (m: string): never => {
  throw new NetworkError(m);
};

let transport: NetworkTransport = new LocalTransport();
export function setNetworkTransport(t: NetworkTransport) {
  transport = t;
}

export const EXAMPLE_CHURCH: ChurchProfile = { churchId: "mesa-example", name: "Example church (demo)", joinedAt: 0, example: true };

const churchName = (church: string) => (church === config.churchId ? config.churchName.replace(/\s*\(demo\)\s*$/i, "") : church);

async function profileFor(church: string): Promise<ChurchProfile> {
  const existing = await transport.getProfile(church);
  if (existing) return existing;
  const p = { churchId: church, name: churchName(church), joinedAt: Date.now() };
  await transport.saveProfile(p);
  return p;
}

const needAdmin = (access: Access) => access.admin || fail("Only a church administrator can manage network connections.");

/* ---------- Connections ---------- */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode(): string {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `MESA-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Step 1 (church A's admin): an invite code to give to another church's leader. Shown once; 7 days; single use. */
export async function createInvite(leader: Leader, access: Access) {
  needAdmin(access);
  const me = await profileFor(leader.churchId);
  const code = newCode();
  const expiresAt = Date.now() + 7 * 86_400_000;
  await transport.saveInvite(code, { fromChurch: me.churchId, fromName: me.name, createdAt: Date.now(), expiresAt });
  await audit(leader, { action: "network.invite", detail: "invite code created" });
  return { code, expiresAt };
}

/** Step 2 (church B's admin): redeeming the code is B's approval. A still has to approve. */
export async function redeemInvite(leader: Leader, access: Access, code: string) {
  needAdmin(access);
  const invite = await transport.takeInvite(code);
  if (!invite) fail("That code isn't valid. It may have expired or been used already; ask for a new one.");
  if (invite!.fromChurch === leader.churchId) fail("That's your own church's code. Give it to the other church's leader.");
  const me = await profileFor(leader.churchId);
  const now = Date.now();
  const existing = (await transport.links(leader.churchId)).find((l) => l.peer === invite!.fromChurch);
  if (existing?.status === "connected") fail(`You're already connected with ${invite!.fromName}.`);
  await transport.deliverLink(leader.churchId, invite!.fromChurch, { peer: invite!.fromChurch, peerName: invite!.fromName, status: "awaiting_them", requestedAt: now, approvals: { [leader.churchId]: { at: now } } });
  await transport.deliverLink(invite!.fromChurch, leader.churchId, { peer: leader.churchId, peerName: me.name, status: "awaiting_us", requestedAt: now, approvals: { [leader.churchId]: { at: now } } });
  await audit(leader, { action: "network.redeem", detail: `requested ${invite!.fromChurch}` });
  return { peer: invite!.fromChurch, peerName: invite!.fromName };
}

/** Step 3 (church A's admin): approve or decline the request. */
export async function answerRequest(leader: Leader, access: Access, peer: string, approve: boolean) {
  needAdmin(access);
  const mine = (await transport.links(leader.churchId)).find((l) => l.peer === peer && l.status === "awaiting_us");
  if (!mine) fail("There's no request from that church waiting for you.");
  if (!approve) {
    await transport.deliverLink(leader.churchId, peer, null);
    await transport.deliverLink(peer, leader.churchId, null);
    await audit(leader, { action: "network.decline", detail: peer });
    return { status: "declined" as const };
  }
  const now = Date.now();
  const approvals = { ...mine!.approvals, [leader.churchId]: { at: now } };
  if (!approvals[peer]) fail("The other church hasn't approved yet.");
  const me = await profileFor(leader.churchId);
  await transport.deliverLink(leader.churchId, peer, { ...mine!, status: "connected", approvals, connectedAt: now });
  await transport.deliverLink(peer, leader.churchId, { peer: leader.churchId, peerName: me.name, status: "connected", requestedAt: mine!.requestedAt, approvals, connectedAt: now });
  await audit(leader, { action: "network.approve", detail: peer });
  return { status: "connected" as const };
}

export async function disconnect(leader: Leader, access: Access, peer: string) {
  needAdmin(access);
  await transport.deliverLink(leader.churchId, peer, null);
  await transport.deliverLink(peer, leader.churchId, null);
  await audit(leader, { action: "network.disconnect", detail: peer });
}

/** Adds the clearly fictional example church (demo) as a connection, with a few example resources. */
export async function addExampleChurch(leader: Leader, access: Access) {
  needAdmin(access);
  const now = Date.now();
  await transport.saveProfile({ ...EXAMPLE_CHURCH, joinedAt: now });
  if (!(await transport.items(EXAMPLE_CHURCH.churchId)).length) await transport.publish(EXAMPLE_CHURCH.churchId, exampleItems(now));
  const approvals = { [leader.churchId]: { at: now }, [EXAMPLE_CHURCH.churchId]: { at: now } };
  await transport.deliverLink(leader.churchId, EXAMPLE_CHURCH.churchId, { peer: EXAMPLE_CHURCH.churchId, peerName: EXAMPLE_CHURCH.name, status: "connected", requestedAt: now, approvals, connectedAt: now, example: true });
  await audit(leader, { action: "network.example", detail: "example church added" });
}

function exampleItems(now: number): SharedItem[] {
  const base = { church: EXAMPLE_CHURCH.churchId, churchName: EXAMPLE_CHURCH.name, sharedAt: now, example: true };
  return [
    { ...base, id: "mesa_ex_1", kind: "series_outline", title: "Faith that works: James in six weeks (example)", scripture: "James 1–5", tags: ["james", "series", "faith", "works"], body: "Week 1: Joy in trials (1:1–18)\nWeek 2: Doers of the word (1:19–27)\nWeek 3: No favoritism (2:1–13)\nWeek 4: Faith and works (2:14–26)\nWeek 5: Taming the tongue (3:1–18)\nWeek 6: Patience and prayer (5:7–20)\nSmall-group questions follow each week's passage." },
    { ...base, id: "mesa_ex_2", kind: "training_doc", title: "Greeter training in one page (example)", tags: ["greeters", "hospitality", "training"], body: "Arrive 20 minutes early. Stand outside the door, not behind it. Learn one thing about each guest and introduce them to one other person. Walk families to the kids check-in desk instead of pointing." },
    { ...base, id: "mesa_ex_3", kind: "event_idea", title: "Fall harvest night for neighbors (example)", tags: ["outreach", "fall", "families"], body: "Chili cook-off, hayride, and a short story time for kids. Invite the neighborhood with door hangers two weeks out. Ask three families to host tables." },
  ];
}

export async function networkState(leader: Leader) {
  const [me, links, items] = await Promise.all([profileFor(leader.churchId), transport.links(leader.churchId), transport.items(leader.churchId)]);
  return { me, links: links.sort((a, b) => b.requestedAt - a.requestedAt), myItems: items.sort((a, b) => b.sharedAt - a.sharedAt) };
}

/* ---------- Sharing ---------- */

export const ShareInput = z.object({
  kind: z.enum(ITEM_KINDS),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(8000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  scripture: z.string().trim().max(60).optional(),
});

/** Every name this church knows: whoever the scrubber must keep inside the church. */
export async function peopleNames(churchId: string): Promise<string[]> {
  const out = new Set<string>();
  const add = (n?: string) => n && out.add(n);
  const [people, leadership, leaders, serve, care, kids, events] = await Promise.all([
    churchData().listPeople().catch(() => []),
    churchData().leadership().catch(() => []),
    listLeaders(churchId).catch(() => []),
    loadServe(churchId).catch(() => null),
    loadCare(churchId).catch(() => null),
    loadKids(churchId).catch(() => null),
    loadEvents(churchId).catch(() => null),
  ]);
  people.forEach((p) => add(p.name));
  leadership.forEach((l) => add(l.name));
  leaders.forEach((l) => add(l.name));
  serve?.volunteers.forEach((v) => add(v.name));
  serve?.teams.forEach((t) => add(t.lead));
  care?.cases.forEach((c) => add(c.subject.name));
  care?.guests.forEach((g) => add(g.name));
  care?.prayers.forEach((p) => add(p.name));
  care?.pathways.forEach((p) => add(p.name));
  care?.classes.forEach((c) => add(c.teacherName));
  kids?.households.forEach((h) => {
    add(h.name);
    h.children.forEach((c) => add(`${c.firstName} ${c.lastName}`));
    h.guardians.forEach((g) => add(g.name));
    h.pickups.forEach((p) => add(p.name));
  });
  events?.registrations.forEach((r) => add(r.name));
  return [...out];
}

export type SharePreview = { item: Omit<SharedItem, "id" | "sharedAt">; title: ScrubResult; body: ScrubResult; tags: string[] };

/** Exactly what would leave the church. The share screen shows this, and `share` stores this and nothing else. */
export async function previewShare(leader: Leader, input: z.input<typeof ShareInput>): Promise<SharePreview> {
  const v = ShareInput.parse(input);
  const names = await peopleNames(leader.churchId);
  const me = await profileFor(leader.churchId);
  const title = scrubText(v.title, names);
  const body = scrubText(v.body, names);
  const tags = v.tags.map((t) => scrubText(t, names).text).filter((t) => !t.includes("removed"));
  const scripture = v.scripture ? scrubText(v.scripture, names).text : undefined;
  return { item: { church: leader.churchId, churchName: me.name, kind: v.kind, title: title.text, body: body.text, tags, scripture }, title, body, tags };
}

export async function share(leader: Leader, access: Access, input: z.input<typeof ShareInput>) {
  if (!can(access, "network.share")) fail("Sharing with other churches is for pastors and staff.");
  const p = await previewShare(leader, input);
  const item: SharedItem = { ...p.item, id: newId("mesa"), sharedAt: Date.now() };
  const items = await transport.items(leader.churchId);
  await transport.publish(leader.churchId, [...items, item]);
  await audit(leader, { action: "network.share", detail: `${item.id} ${item.kind} (${p.title.total + p.body.total} details removed)` });
  return item;
}

export async function unshare(leader: Leader, access: Access, id: string) {
  if (!can(access, "network.share")) fail("Only pastors and staff manage what's shared.");
  const items = await transport.items(leader.churchId);
  if (!items.some((i) => i.id === id)) fail("That item isn't shared anymore.");
  await transport.publish(leader.churchId, items.filter((i) => i.id !== id));
  await audit(leader, { action: "network.unshare", detail: id });
}

/** Starting points from this church's own planning (no people: preachers and leaders are left out). */
export async function shareStarters(leader: Leader) {
  const [svc, care] = await Promise.all([loadServices(leader.churchId).catch(() => null), loadCare(leader.churchId).catch(() => null)]);
  const series = (svc?.series ?? []).map((s) => {
    const weeks = (svc?.rotation ?? []).filter((r) => r.seriesId === s.id).sort((a, b) => a.date.localeCompare(b.date));
    return {
      id: s.id,
      kind: "series_outline" as ItemKind,
      title: s.title,
      scripture: s.passage,
      body: weeks.length ? weeks.map((w, i) => `Week ${i + 1}: ${w.title ?? "Sermon"}${w.passage ? ` (${w.passage})` : ""}`).join("\n") : `${s.title}${s.passage ? `, ${s.passage}` : ""}.${s.notes ? `\n${s.notes}` : ""}`,
    };
  });
  const plans = (svc?.plans ?? []).slice(-6).map((p) => ({
    id: p.id,
    kind: "service_template" as ItemKind,
    title: `Order of service (${p.items.reduce((a, i) => a + i.minutes, 0)} minutes)`,
    body: p.items.map((i) => `${ITEM_LABELS[i.kind]}: ${i.minutes} min${i.passage ? `, ${i.passage}` : ""}`).join("\n"),
  }));
  const prayers = (care?.prayers ?? []).filter((p) => p.shareable && !p.answered).slice(-10).map((p) => ({ id: p.id, kind: "prayer_need" as ItemKind, title: "Prayer request", body: p.request }));
  return { series, plans, prayers };
}

/* ---------- Search ---------- */

export async function connectedPeers(church: string) {
  return (await transport.links(church)).filter((l) => l.status === "connected");
}

const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1);

/** Shared resources from this church and connected churches, best match first. Unconnected churches are never searched. */
export async function searchNetwork(leader: Leader, query: string, kind?: ItemKind) {
  const peers = await connectedPeers(leader.churchId);
  const lists = await Promise.all([leader.churchId, ...peers.map((p) => p.peer)].map((c) => transport.items(c)));
  const q = words(query).filter((w) => !["a", "an", "the", "on", "of", "series", "church", "find", "that", "done", "has", "about", "for", "any"].includes(w));
  const all = lists.flat().filter((i) => !kind || i.kind === kind);
  const scored = all
    .map((i) => {
      const title = words(i.title);
      const hay = new Set([...title, ...words(i.body), ...i.tags.flatMap(words), ...words(i.scripture ?? ""), ...words(KIND_LABELS[i.kind])]);
      const score = q.length ? q.reduce((a, w) => a + (title.includes(w) ? 3 : 0) + (hay.has(w) ? 1 : 0) + (i.tags.some((t) => t.toLowerCase() === w) ? 2 : 0), 0) : 1;
      return { i, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.i.sharedAt - a.i.sharedAt);
  return { peers: peers.length, results: scored.slice(0, 30).map((x) => ({ ...x.i, mine: x.i.church === leader.churchId })) };
}
