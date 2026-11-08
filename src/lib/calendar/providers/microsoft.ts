import { addDaysIso, fromWall, toWall } from "../time";
import type { OutsideEvent } from "../types";
import { call, form, type CalendarProvider, type Tokens } from "./types";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0/me";
const SCOPES = "offline_access User.Read Calendars.ReadWrite";
const MARK = "Barnabas";

type MEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  categories?: string[];
  location?: { displayName?: string };
  start?: { dateTime: string };
  end?: { dateTime: string };
};

function tokens(body: { access_token: string; refresh_token?: string; expires_in: number }): Tokens {
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
}

/** Graph times are sent and read in UTC to avoid Windows time-zone name mapping. */
const utc = (d: Date) => ({ dateTime: d.toISOString().replace(/\.\d{3}Z$/, ""), timeZone: "UTC" });

export const microsoft: CalendarProvider = {
  id: "microsoft",
  label: "Outlook",
  configured: () => Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),

  authorizeUrl(redirectUri, state) {
    const q = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES,
      state,
    });
    return `${AUTHORITY}/authorize?${q}`;
  },

  async exchangeCode(code, redirectUri) {
    return tokens(
      await call(`${AUTHORITY}/token`, form({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, code, redirect_uri: redirectUri, grant_type: "authorization_code", scope: SCOPES })),
    );
  },

  async refresh(refreshToken) {
    const t = tokens(
      await call(`${AUTHORITY}/token`, form({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: "refresh_token", scope: SCOPES })),
    );
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  },

  async account(accessToken) {
    const me = await call(GRAPH, { headers: { Authorization: `Bearer ${accessToken}` } });
    return me?.mail ?? me?.userPrincipalName ?? "Microsoft account";
  },

  async list(accessToken, from, to, tz) {
    const q = new URLSearchParams({
      startDateTime: from.toISOString(),
      endDateTime: to.toISOString(),
      $top: "250",
      $orderby: "start/dateTime",
      $select: "subject,isAllDay,isCancelled,categories,location,start,end",
    });
    const body = await call(`${GRAPH}/calendarView?${q}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    });
    const out: OutsideEvent[] = [];
    for (const e of (body?.value ?? []) as MEvent[]) {
      if (e.isCancelled || e.categories?.includes(MARK) || !e.start || !e.end) continue;
      const s = toWall(new Date(`${e.start.dateTime.replace(/Z?$/, "")}Z`), tz);
      const en = toWall(new Date(`${e.end.dateTime.replace(/Z?$/, "")}Z`), tz);
      if (e.isAllDay) {
        // All-day events start at midnight UTC on Graph; take the date as written.
        out.push({ id: `microsoft:${e.id}`, source: "microsoft", title: e.subject ?? "(busy)", date: e.start.dateTime.slice(0, 10), allDay: true, location: e.location?.displayName });
      } else {
        out.push({ id: `microsoft:${e.id}`, source: "microsoft", title: e.subject ?? "(busy)", date: s.date, start: s.time, end: en.date === s.date ? en.time : "23:59", allDay: false, location: e.location?.displayName });
      }
    }
    return out;
  },

  async upsert(accessToken, event, tz, externalId) {
    const timed = !event.allDay && event.start && event.end;
    const body = {
      subject: event.title,
      body: { contentType: "text", content: "Added in Barnabas" },
      location: { displayName: event.location ?? "" },
      categories: [MARK],
      isAllDay: !timed,
      start: timed ? utc(fromWall(event.date, event.start!, tz)) : { dateTime: `${event.date}T00:00:00`, timeZone: "UTC" },
      end: timed ? utc(fromWall(event.date, event.end!, tz)) : { dateTime: `${addDaysIso(event.date, 1)}T00:00:00`, timeZone: "UTC" },
    };
    const init = { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const saved = externalId
      ? await call(`${GRAPH}/events/${encodeURIComponent(externalId)}`, { ...init, method: "PATCH" })
      : await call(`${GRAPH}/events`, { ...init, method: "POST" });
    return saved.id as string;
  },

  async remove(accessToken, externalId) {
    try {
      await call(`${GRAPH}/events/${encodeURIComponent(externalId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
    }
  },
};
