import { churchData } from "../chms";
import { config } from "../config";
import { getJSON, kv, setJSON } from "../store";
import { bookStore } from "../store/book";
import { newToken, tokenHash, TOKEN_RE } from "../care/welcome";
import type { EventsBook, FormField, RegEvent } from "./types";

/**
 * Redis layout, per church:
 *   evt:{church}:meta            demo flag
 *   evt:{church}:events          events that take registrations (form fields, capacity, waitlist)
 *   evt:{church}:registrations   registrations, waitlist and check-ins
 *   evtlink:{sha256(token)}      public registration link lookup -> { churchId, eventId }
 */
export const PARTS = ["meta", "events", "registrations"] as const;

export const emptyEvents = (): EventsBook => ({ meta: { demo: false, createdAt: Date.now() }, events: [], registrations: [] });

const linkKey = (hash: string) => `evtlink:${hash}`;
type Lookup = { churchId: string; eventId: string };

export async function saveLink(churchId: string, event: Pick<RegEvent, "id" | "token">) {
  await setJSON(linkKey(await tokenHash(event.token)), { churchId, eventId: event.id } satisfies Lookup);
}
export async function dropLink(token: string) {
  await kv().del(linkKey(await tokenHash(token)));
}
export async function lookupLink(token: string): Promise<Lookup | null> {
  if (!TOKEN_RE.test(token)) return null;
  return getJSON<Lookup>(linkKey(await tokenHash(token)));
}

/**
 * The demo church's events with registration: three real MGBC events from its published calendar,
 * with no one registered yet (no registrant is made up).
 */
async function seedDemoEvents(church: string): Promise<EventsBook> {
  const all = await churchData().events("2026-01-01", "2027-12-31");
  const f = (id: string, label: string, kind: FormField["kind"], required: boolean, options?: string[]): FormField => ({ id, label, kind, required, options });
  const specs: { id: string; capacity?: number; waitlist: boolean; maxParty: number; priceCents?: number; fields: FormField[] }[] = [
    { id: "mgbc-reverb", capacity: 40, waitlist: true, maxParty: 1, priceCents: 6700, fields: [f("grade", "Grade", "choice", true, ["6th", "7th", "8th", "9th", "10th", "11th", "12th"]), f("guardian", "Parent or guardian name", "text", true), f("guardian_phone", "Parent or guardian phone", "text", true), f("first_time", "First time at Reverb?", "yesno", false)] },
    { id: "mgbc-thanksgiving", capacity: 150, waitlist: false, maxParty: 8, fields: [f("dish", "Bringing a dish to share?", "yesno", false)] },
    { id: "mgbc-teens-christmas", capacity: 50, waitlist: true, maxParty: 1, fields: [f("grade", "Grade", "choice", true, ["6th", "7th", "8th", "9th", "10th", "11th", "12th"]), f("gift", "Bringing a gift for the game?", "yesno", false), f("ride", "Need a ride from the church?", "yesno", false)] },
  ];
  const events: RegEvent[] = [];
  for (const s of specs) {
    const e = all.find((x) => x.id === s.id);
    if (!e) continue;
    const ev: RegEvent = {
      id: `evt_${s.id}`, title: e.title, date: e.date, time: e.time || undefined, endTime: e.endTime, location: e.location, description: e.description, churchEventId: e.id,
      capacity: s.capacity, waitlist: s.waitlist, open: true, maxParty: s.maxParty, priceCents: s.priceCents, fields: s.fields, token: newToken(), createdAt: Date.now(), createdBy: "demo", demo: true,
    };
    await saveLink(church, ev);
    events.push(ev);
  }
  return { meta: { demo: true, createdAt: Date.now() }, events, registrations: [] };
}

const store = bookStore<EventsBook>({
  prefix: "evt",
  parts: PARTS,
  empty: emptyEvents,
  async seed(church) {
    return church === config.churchId ? seedDemoEvents(church) : null;
  },
});

export const loadEvents = store.load;
export const updateEvents = store.update;
export const resetEvents = store.reset;
