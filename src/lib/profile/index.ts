import type { Leader } from "../auth/session";
import { getJSON, setJSON } from "../store";

export type ReplyLanguage = "en" | "es" | "ko";
export type VoiceLang = "en-US" | "es-US" | "ko-KR";

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
  voice: { speakReplies: boolean; language: VoiceLang; rate: number };
  /** Anything the leader wants Barnabas to always know about them. */
  about: string;
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
    voice: { speakReplies: true, language: "en-US", rate: 1 },
    about: "",
    updatedAt: Date.now(),
  };
}

export async function getProfile(leader: Leader): Promise<Profile> {
  const saved = await getJSON<Partial<Profile>>(key(leader));
  const base = defaultProfile(leader);
  if (!saved) return base;
  return { ...base, ...saved, voice: { ...base.voice, ...(saved.voice ?? {}) }, email: leader.email };
}

export async function saveProfile(leader: Leader, profile: Profile) {
  await setJSON(key(leader), { ...profile, email: leader.email, updatedAt: Date.now() });
}

/** Created once at first sign-in; later sign-ins don't overwrite edits. */
export async function ensureProfile(leader: Leader, timezone?: string) {
  const existing = await getJSON<Profile>(key(leader));
  if (existing) return existing;
  const profile = defaultProfile(leader);
  if (timezone && isValidTimezone(timezone)) profile.timezone = timezone;
  await saveProfile(leader, profile);
  return profile;
}

export function profileKey(leader: Pick<Leader, "churchId" | "leaderId">) {
  return key(leader);
}
