import type { Leader } from "../auth/session";
import { getJSON, setJSON } from "../store";

export type ReplyLanguage = "en" | "es" | "ko";
export type VoiceLang = "en-US" | "es-US" | "ko-KR";

import { DEFAULT_BIBLE_TRANSLATION, type BibleTranslation } from "./translations";
import { defaultNotifications, mergeNotifications, type NotificationSettings } from "../notifications/types";
export { BIBLE_TRANSLATIONS, BIBLE_TRANSLATION_IDS, DEFAULT_BIBLE_TRANSLATION, type BibleTranslation } from "./translations";

export type Profile = {
  name: string;
  /** What Barnabas calls the leader in conversation, e.g. "Pastor Dana" or "Dana". */
  preferredName: string;
  email: string;
  role: string;
  ministries: string[];
  /** IANA time zone, e.g. "America/Chicago". */
  timezone: string;
  replyLanguage: ReplyLanguage;
  /** The translation Barnabas quotes scripture in. */
  bibleTranslation: BibleTranslation;
  voice: {
    speakReplies: boolean;
    language: VoiceLang;
    rate: number;
    /** ElevenLabs voice for Barnabas; empty means the church default. */
    voiceId?: string;
    /** Keep listening between turns and allow interrupting by speaking. */
    handsFree: boolean;
    /** Speak replies to typed messages too, not only to spoken ones. */
    readTyped: boolean;
    /** How long a pause (ms) ends the leader's turn when talking: "Wait before answering". */
    pauseMs: number;
  };
  /** How Barnabas should say names it gets wrong, e.g. Nguyen -> "Win". */
  pronunciations: { word: string; sayAs: string }[];
  /** Anything the leader wants Barnabas to always know about them. */
  about: string;
  /** Push notifications: on by default, each type on by default (see `src/lib/notifications/types.ts`). */
  notifications: NotificationSettings;
  updatedAt: number;
};

export const DEFAULT_TIMEZONE = "America/New_York";

const key = (l: Pick<Leader, "churchId" | "leaderId">) => `profile:${l.churchId}:${l.leaderId}`;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function defaultProfile(leader: Leader): Profile {
  return {
    name: leader.name,
    preferredName: leader.name,
    email: leader.email,
    role: leader.role,
    ministries: [],
    timezone: DEFAULT_TIMEZONE,
    replyLanguage: "en",
    bibleTranslation: DEFAULT_BIBLE_TRANSLATION,
    voice: { speakReplies: true, language: "en-US", rate: 1, handsFree: true, readTyped: false, pauseMs: 300 },
    pronunciations: [],
    about: "",
    notifications: defaultNotifications(),
    updatedAt: Date.now(),
  };
}

export async function getProfile(leader: Leader): Promise<Profile> {
  const saved = await getJSON<Partial<Profile>>(key(leader));
  const base = defaultProfile(leader);
  if (!saved) return base;
  return { ...base, ...saved, voice: { ...base.voice, ...(saved.voice ?? {}) }, notifications: mergeNotifications(saved.notifications), email: leader.email };
}

/** A leader's notification settings (defaults if they've never saved any), without needing their session. */
export async function notificationSettingsFor(churchId: string, leaderId: string): Promise<NotificationSettings> {
  const saved = await getJSON<Partial<Profile>>(key({ churchId, leaderId }));
  return mergeNotifications(saved?.notifications);
}

/** Their time zone, for the morning briefing. */
export async function timezoneFor(churchId: string, leaderId: string): Promise<string> {
  const saved = await getJSON<Partial<Profile>>(key({ churchId, leaderId }));
  return saved?.timezone && isValidTimezone(saved.timezone) ? saved.timezone : DEFAULT_TIMEZONE;
}

export async function saveProfile(leader: Leader, profile: Profile) {
  await setJSON(key(leader), { ...profile, email: leader.email, updatedAt: Date.now() });
}

/**
 * A leader on the church's leadership list whose sign-in email the church gave starts with their profile
 * filled in from it: name, role, ministries and their published bio. Only at first sign-in; they can
 * change any of it in Settings.
 */
export async function prefillFromLeadership(profile: Profile, email: string) {
  const { DemoChurch } = await import("../chms/demo");
  const me = (await new DemoChurch().leadership()).find((l) => l.email && l.email.toLowerCase() === email.trim().toLowerCase());
  if (!me) return;
  const first = me.name.split(/\s+/)[0] ?? me.name;
  profile.name = me.name;
  profile.preferredName = /pastor/i.test(me.title) ? `Pastor ${first}` : first;
  profile.role = me.title;
  if (me.ministry) profile.ministries = me.ministry.split(/\s+and\s+|,\s*/).map((m) => m.trim()).filter(Boolean).map((m) => m[0]!.toUpperCase() + m.slice(1));
  if (me.bio) profile.about = me.bio;
}

/** Created once at first sign-in; later sign-ins don't overwrite edits. */
export async function ensureProfile(leader: Leader, timezone?: string) {
  const existing = await getJSON<Profile>(key(leader));
  if (existing) return existing;
  const profile = defaultProfile(leader);
  if (timezone && isValidTimezone(timezone)) profile.timezone = timezone;
  await prefillFromLeadership(profile, leader.email);
  await saveProfile(leader, profile);
  return profile;
}

/** Every sign-in starts hands-free; a leader can still turn it off in Settings or on the Talk screen. */
export async function handsFreeOnSignIn(leader: Leader, profile: Profile): Promise<Profile> {
  if (profile.voice?.handsFree) return profile;
  const next = { ...profile, voice: { ...defaultProfile(leader).voice, ...(profile.voice ?? {}), handsFree: true } };
  await saveProfile(leader, next);
  return next;
}

export function profileKey(leader: Pick<Leader, "churchId" | "leaderId">) {
  return key(leader);
}
