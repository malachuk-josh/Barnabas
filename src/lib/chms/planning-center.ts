import { addDays, today } from "../dates";
import { DemoChurch } from "./demo";
import { PcoClient, rel, type Fetch, type Resource } from "./pco";
import { emptySnapshot, type ChmsSnapshot, type Household } from "./snapshot";
import type { ChurchData, Person, Roster, ServingRecord, Team } from "./types";

/**
 * The Planning Center adapter. Syncing reads People (people, emails, phones, households) and optionally
 * Services (teams and the plans' team members) into a snapshot in Redis; the adapter then serves Barnabas
 * from that snapshot, so a voice turn never waits on Planning Center. Leadership and the weekly schedule
 * stay as the church published them (the demo base) until those come from the ChMS too.
 */

export function pcoCredentials(env: NodeJS.ProcessEnv = process.env) {
  const appId = env.PCO_APP_ID?.trim();
  const secret = env.PCO_SECRET?.trim();
  return appId && secret ? { appId, secret } : null;
}

export const pcoPersonId = (id: string) => `pco_${id}`;
export const pcoTeamId = (id: string) => `pco_team_${id}`;

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function pickPrimary(items: Resource[], field: string, prefer?: (r: Resource) => boolean) {
  const primary = items.find((i) => i.attributes.primary === true) ?? (prefer ? items.find(prefer) : undefined) ?? items[0];
  return primary ? str(primary.attributes[field]) || undefined : undefined;
}

/** Maps a People API page set (with included emails, phones, households) to Barnabas people and households. */
export function mapPeople(data: Resource[], included: Resource[]): { people: ChmsSnapshot["people"]; households: Household[] } {
  const byKey = new Map(included.map((r) => [`${r.type}:${r.id}`, r]));
  const households = new Map<string, Household>();
  const people: ChmsSnapshot["people"] = [];
  for (const r of data) {
    const first = str(r.attributes.nickname) || str(r.attributes.first_name);
    const last = str(r.attributes.last_name);
    const name = str(r.attributes.name) || [first, last].filter(Boolean).join(" ");
    if (!name) continue;
    const emails = rel(r, "emails").map((e) => byKey.get(`Email:${e.id}`)).filter((x): x is Resource => Boolean(x));
    const phones = rel(r, "phone_numbers").map((p) => byKey.get(`PhoneNumber:${p.id}`)).filter((x): x is Resource => Boolean(x));
    const hh = rel(r, "households").map((h) => byKey.get(`Household:${h.id}`)).filter((x): x is Resource => Boolean(x));
    const id = pcoPersonId(r.id);
    for (const h of hh) {
      const existing = households.get(h.id) ?? { id: `pco_hh_${h.id}`, name: str(h.attributes.name) || `${last} household`, memberIds: [] };
      existing.memberIds.push(id);
      households.set(h.id, existing);
    }
    people.push({
      id,
      externalId: r.id,
      source: "planning_center",
      dedupeKey: `pco:${r.id}`,
      name,
      firstName: first || name.split(/\s+/)[0],
      household: hh[0] ? str(hh[0].attributes.name) || undefined : undefined,
      // Planning Center has no preferred-language field; English until the church sets one in Barnabas.
      language: "en",
      email: pickPrimary(emails, "address"),
      phone: pickPrimary(phones, "number", (p) => /mobile|cell/i.test(str(p.attributes.location))),
    });
  }
  return { people, households: [...households.values()] };
}

export type SyncResult = { snapshot: ChmsSnapshot; organization?: string; plans: number; requests: number; retries: number };

/** Pulls everything into a fresh snapshot. Pure apart from the client's HTTP calls (tests pass a mock fetch). */
export async function pullPlanningCenter(client: PcoClient, opts: { includeServices: boolean; asOf?: string; maxServiceTypes?: number; plansPerType?: number }): Promise<SyncResult> {
  const asOf = opts.asOf ?? today();
  const org = await client.get("/people/v2").catch(() => null);
  const organization = org && !Array.isArray(org.data) ? str((org.data as unknown as Resource).attributes?.name) || undefined : undefined;
  const { data, included } = await client.all("/people/v2/people?per_page=100&include=emails,phone_numbers,households&where[status]=active&order=last_name");
  const { people, households } = mapPeople(data, included);
  const snap: ChmsSnapshot = { ...emptySnapshot(), sources: ["planning_center"], syncedAt: Date.now(), people, households };
  let plans = 0;
  if (opts.includeServices) {
    const teams = await client.all("/services/v2/teams?per_page=100");
    snap.teams = teams.data.filter((t) => !t.attributes.archived_at).map((t): Team => ({ id: pcoTeamId(t.id), name: str(t.attributes.name) || "Team" }));
    const known = new Set(people.map((p) => p.id));
    const types = (await client.all("/services/v2/service_types?per_page=100")).data.slice(0, opts.maxServiceTypes ?? 3);
    const since = addDays(asOf, -84);
    const until = addDays(asOf, 28);
    const rosters = new Map<string, Roster>();
    for (const st of types) {
      const list = await client.get(`/services/v2/service_types/${st.id}/plans?filter=after&after=${since}&order=sort_date&per_page=${opts.plansPerType ?? 20}`);
      for (const plan of list.data) {
        const date = str(plan.attributes.sort_date).slice(0, 10);
        if (!date || date > until) continue;
        plans++;
        const members = await client.all(`/services/v2/service_types/${st.id}/plans/${plan.id}/team_members?per_page=100`, 5);
        for (const m of members.data) {
          const person = rel(m, "person")[0];
          const team = rel(m, "team")[0];
          if (!person || !team) continue;
          const personId = pcoPersonId(person.id);
          if (!known.has(personId)) continue;
          const teamId = pcoTeamId(team.id);
          const s = str(m.attributes.status).toUpperCase();
          const status: ServingRecord["status"] = s === "D" ? "declined" : date <= asOf && s === "C" ? "served" : "scheduled";
          if (date <= asOf && status === "scheduled") continue; // unconfirmed in the past: unknown
          snap.serving.push({ personId, teamId, date, status });
          if (date > asOf) {
            const key = `${date}|${teamId}`;
            const r = rosters.get(key) ?? { date, teamId, teamName: snap.teams.find((t) => t.id === teamId)?.name ?? "Team", people: [] };
            if (!r.people.some((p) => p.personId === personId)) r.people.push({ personId, name: people.find((p) => p.id === personId)!.name, status });
            rosters.set(key, r);
          }
        }
      }
    }
    snap.rosters = [...rosters.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  return { snapshot: snap, organization, plans, requests: client.requests, retries: client.retries };
}

export function newPcoClient(fetchImpl?: Fetch) {
  const creds = pcoCredentials();
  if (!creds) return null;
  return new PcoClient({ ...creds, fetchImpl });
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Serves ChurchData from a snapshot (Planning Center and/or imported people). Leadership and events come
 * from the base (the church's published leadership and schedule).
 */
export class SnapshotChurch implements ChurchData {
  constructor(private readonly snap: ChmsSnapshot, private readonly base: ChurchData = new DemoChurch()) {}

  get source() {
    return this.snap.sources.includes("planning_center") ? "planning_center" : "import";
  }

  private person(p: ChmsSnapshot["people"][number]): Person {
    const { source: _s, dedupeKey: _d, externalId: _e, ...rest } = p;
    return rest;
  }

  leadership() {
    return this.base.leadership();
  }
  async listPeople() {
    return this.snap.people.map((p) => this.person(p));
  }
  async getPerson(id: string) {
    const p = this.snap.people.find((x) => x.id === id);
    return p ? this.person(p) : null;
  }
  async findPeople(query: string) {
    const words = norm(query.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return this.snap.people.filter((p) => words.every((w) => norm(p.name).includes(w))).map((p) => this.person(p));
  }
  async teams() {
    return this.snap.teams.length ? this.snap.teams : this.base.teams();
  }
  async serving(sinceISO: string) {
    return this.snap.serving.filter((s) => s.date >= sinceISO);
  }
  async attendance() {
    // Attendance (Check-Ins) isn't synced yet; reports say so.
    return [];
  }
  async rosters(fromISO: string, toISO: string) {
    return this.snap.rosters.filter((r) => r.date >= fromISO && r.date <= toISO);
  }
  events(fromISO: string, toISO: string) {
    return this.base.events(fromISO, toISO);
  }
}
