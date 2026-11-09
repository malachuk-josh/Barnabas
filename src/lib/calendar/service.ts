import { churchData } from "../chms";
import type { Leader } from "../auth/session";
import { audit } from "../data/records";
import { getProfile } from "../profile";
import { accessToken, connections, PROVIDERS, recordError } from "./connections";
import { getEvent, insertEvent, listEvents, removeEvent, replaceEvent } from "./store";
import { addDaysIso, fromWall } from "./time";
import type { CalendarEvent, EventInput, OutsideEvent, ProviderId } from "./types";

/**
 * Calendar operations used by the API routes and by Barnabas's tools. Local changes are saved first,
 * then copied to connected calendars; a sync failure never loses the local change.
 */

function friendlySyncError(err: unknown) {
  const status = (err as { status?: number }).status;
  if (status === 401 || status === 403) return "The connection expired. Reconnect it in Settings.";
  return "Couldn't reach the connected calendar. Barnabas will try again on the next change.";
}

async function pushAll(leader: Leader, event: CalendarEvent, tz: string): Promise<CalendarEvent> {
  const external = { ...(event.external ?? {}) };
  const errors: string[] = [];
  for (const c of await connections(leader)) {
    if (!c.push) continue;
    try {
      const token = await accessToken(leader, c.provider);
      if (!token) throw Object.assign(new Error("no token"), { status: 401 });
      external[c.provider] = await PROVIDERS[c.provider].upsert(token, event, tz, external[c.provider]);
      await recordError(leader, c.provider, null);
    } catch (err) {
      console.warn(`[barnabas] calendar push to ${c.provider} failed`, err);
      const message = friendlySyncError(err);
      errors.push(`${c.label}: ${message}`);
      await recordError(leader, c.provider, message);
    }
  }
  const updated = await replaceEvent(leader, { ...event, external, syncError: errors.length ? errors.join(" ") : undefined });
  return updated ?? event;
}

export async function createEvent(leader: Leader, input: EventInput, by: CalendarEvent["createdBy"], conversationId?: string) {
  const { timezone } = await getProfile(leader);
  const event = await insertEvent(leader, input, by);
  await audit(leader, { conversationId, action: `calendar.create_by_${by}`, detail: `${event.id} ${event.date}` });
  return pushAll(leader, event, timezone);
}

export async function updateEvent(leader: Leader, id: string, patch: Partial<EventInput>, by: CalendarEvent["createdBy"], conversationId?: string) {
  const current = await getEvent(leader, id);
  if (!current) return null;
  const { timezone } = await getProfile(leader);
  const saved = await replaceEvent(leader, { ...current, ...patch });
  if (!saved) return null;
  await audit(leader, { conversationId, action: `calendar.update_by_${by}`, detail: id });
  return pushAll(leader, saved, timezone);
}

export async function deleteEvent(leader: Leader, id: string, by: CalendarEvent["createdBy"], conversationId?: string) {
  const removed = await removeEvent(leader, id);
  if (!removed) return null;
  for (const [p, externalId] of Object.entries(removed.external ?? {}) as [ProviderId, string][]) {
    try {
      const token = await accessToken(leader, p);
      if (token) await PROVIDERS[p].remove(token, externalId);
    } catch (err) {
      console.warn(`[barnabas] calendar delete in ${p} failed`, err);
      await recordError(leader, p, friendlySyncError(err));
    }
  }
  await audit(leader, { conversationId, action: `calendar.delete_by_${by}`, detail: id });
  return removed;
}

/** Events from connected calendars and the church database, in the leader's time zone. */
export async function outsideEvents(leader: Leader, from: string, to: string, opts: { timeoutMs?: number } = {}) {
  const { timezone } = await getProfile(leader);
  const out: OutsideEvent[] = [];
  const problems: string[] = [];
  const start = fromWall(from, "00:00", timezone);
  const end = fromWall(addDaysIso(to, 1), "00:00", timezone);

  const tasks = (await connections(leader)).map(async (c) => {
    try {
      const token = await accessToken(leader, c.provider);
      if (!token) throw Object.assign(new Error("no token"), { status: 401 });
      out.push(...(await PROVIDERS[c.provider].list(token, start, end, timezone)));
    } catch (err) {
      console.warn(`[barnabas] calendar read from ${c.provider} failed`, err);
      const message = friendlySyncError(err);
      problems.push(`${c.label}: ${message}`);
      await recordError(leader, c.provider, message);
    }
  });
  const church = churchData()
    .events(from, to)
    .then((events) => {
      const to24 = (t?: string) => {
        const m = t ? /^(\d{1,2}):(\d{2}) (AM|PM)/.exec(t) : null;
        if (!m) return undefined;
        let h = Number(m[1]) % 12;
        if (m[3] === "PM") h += 12;
        return `${String(h).padStart(2, "0")}:${m[2]}`;
      };
      for (const e of events) {
        const startTime = to24(e.time);
        const endTime = to24(e.endTime) ?? (startTime ? `${String(Math.min(23, Number(startTime.slice(0, 2)) + 1)).padStart(2, "0")}:${startTime.slice(3)}` : undefined);
        out.push({ id: `church:${e.id}`, source: "church", title: e.title, date: e.date, start: startTime, end: endTime, allDay: !startTime, location: e.location });
      }
    });
  const all = Promise.allSettled([...tasks, church]);
  if (opts.timeoutMs) await Promise.race([all, new Promise((r) => setTimeout(r, opts.timeoutMs))]);
  else await all;
  return { events: out.sort((a, b) => (a.date + (a.start ?? "")).localeCompare(b.date + (b.start ?? ""))), problems };
}

export async function calendarRange(leader: Leader, from: string, to: string) {
  const [mine, outside] = await Promise.all([listEvents(leader, from, to), outsideEvents(leader, from, to)]);
  return { events: mine, outside: outside.events, problems: outside.problems };
}
