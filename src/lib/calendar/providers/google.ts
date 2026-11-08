import { addDaysIso, fromWall, toWall } from "../time";
import type { OutsideEvent } from "../types";
import { call, form, type CalendarProvider, type Tokens } from "./types";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};

function tokens(body: { access_token: string; refresh_token?: string; expires_in: number }): Tokens {
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
}

export const google: CalendarProvider = {
  id: "google",
  label: "Google Calendar",
  configured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  authorizeUrl(redirectUri, state) {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH}?${q}`;
  },

  async exchangeCode(code, redirectUri) {
    return tokens(
      await call(TOKEN, form({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: "authorization_code" })),
    );
  },

  async refresh(refreshToken) {
    const t = tokens(
      await call(TOKEN, form({ refresh_token: refreshToken, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: "refresh_token" })),
    );
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  },

  async account(accessToken) {
    const me = await call("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
    return me?.email ?? "Google account";
  },

  async list(accessToken, from, to, tz) {
    const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    const body = await call(`${API}?${q}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const out: OutsideEvent[] = [];
    for (const e of (body?.items ?? []) as GEvent[]) {
      if (e.status === "cancelled" || e.extendedProperties?.private?.barnabasId) continue;
      if (e.start?.date) {
        out.push({ id: `google:${e.id}`, source: "google", title: e.summary ?? "(busy)", date: e.start.date, allDay: true, location: e.location });
      } else if (e.start?.dateTime && e.end?.dateTime) {
        const s = toWall(new Date(e.start.dateTime), tz);
        const en = toWall(new Date(e.end.dateTime), tz);
        out.push({ id: `google:${e.id}`, source: "google", title: e.summary ?? "(busy)", date: s.date, start: s.time, end: en.date === s.date ? en.time : "23:59", allDay: false, location: e.location });
      }
    }
    return out;
  },

  async upsert(accessToken, event, tz, externalId) {
    const body = {
      summary: event.title,
      location: event.location ?? "",
      description: "Added in Barnabas",
      start: event.allDay || !event.start ? { date: event.date } : { dateTime: fromWall(event.date, event.start, tz).toISOString(), timeZone: tz },
      end: event.allDay || !event.end ? { date: addDaysIso(event.date, 1) } : { dateTime: fromWall(event.date, event.end, tz).toISOString(), timeZone: tz },
      extendedProperties: { private: { barnabasId: event.id } },
    };
    const init = { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const saved = externalId
      ? await call(`${API}/${encodeURIComponent(externalId)}`, { ...init, method: "PATCH" })
      : await call(API, { ...init, method: "POST" });
    return saved.id as string;
  },

  async remove(accessToken, externalId) {
    try {
      await call(`${API}/${encodeURIComponent(externalId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (err) {
      // Already gone in Google: nothing to do.
      if ((err as { status?: number }).status !== 404 && (err as { status?: number }).status !== 410) throw err;
    }
  },
};
