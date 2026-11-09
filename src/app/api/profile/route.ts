import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { getProfile, isValidTimezone, saveProfile, BIBLE_TRANSLATION_IDS } from "@/lib/profile";
import { updateLeaderDisplay } from "@/lib/team";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/types";

export const runtime = "nodejs";

export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return NextResponse.json({ profile: await getProfile(leader) });
}

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  preferredName: z.string().trim().min(1).max(80),
  role: z.string().trim().max(80),
  ministries: z.array(z.string().trim().min(1).max(60)).max(12),
  timezone: z.string().refine(isValidTimezone, "Unknown time zone"),
  replyLanguage: z.enum(["en", "es", "ko"]),
  bibleTranslation: z.enum(BIBLE_TRANSLATION_IDS).optional(),
  voice: z.object({
    speakReplies: z.boolean(),
    language: z.enum(["en-US", "es-US", "ko-KR"]),
    rate: z.number().min(0.7).max(1.4),
    voiceId: z.string().regex(/^[A-Za-z0-9]{8,40}$/).optional().or(z.literal("")),
    handsFree: z.boolean(),
    readTyped: z.boolean().optional(),
  }),
  pronunciations: z.array(z.object({ word: z.string().trim().min(1).max(40), sayAs: z.string().trim().min(1).max(60) })).max(50),
  about: z.string().max(1500),
});

const Notifications = z.object({
  enabled: z.boolean().optional(),
  types: z.partialRecord(z.enum(NOTIFICATION_TYPES), z.boolean()).optional(),
});

/** Changes only the notification settings (the Settings toggles save as they're flipped). */
export async function PATCH(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // "Read typed replies aloud" on the Talk panel saves as it's flipped.
  if (raw.voice !== undefined) {
    const v = z.object({ readTyped: z.boolean() }).strict().safeParse(raw.voice);
    if (!v.success) return NextResponse.json({ error: "Check the voice settings." }, { status: 400 });
    const current = await getProfile(leader);
    const next = { ...current, voice: { ...current.voice, readTyped: v.data.readTyped } };
    await saveProfile(leader, next);
    return NextResponse.json({ voice: next.voice });
  }
  const parsed = Notifications.strict().safeParse(raw.notifications);
  if (!parsed.success) return NextResponse.json({ error: "Check the notification settings." }, { status: 400 });
  const current = await getProfile(leader);
  const types = { ...current.notifications.types };
  for (const [t, on] of Object.entries(parsed.data.types ?? {})) if (typeof on === "boolean") types[t as NotificationType] = on;
  const next = { ...current, notifications: { enabled: parsed.data.enabled ?? current.notifications.enabled, types } };
  await saveProfile(leader, next);
  return NextResponse.json({ notifications: next.notifications });
}

export async function PUT(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: `Check ${first?.path.join(".") || "the form"}: ${first?.message ?? "invalid value"}.` }, { status: 400 });
  }
  const current = await getProfile(leader);
  const next = {
    ...current,
    ...parsed.data,
    bibleTranslation: parsed.data.bibleTranslation ?? current.bibleTranslation,
    voice: { ...parsed.data.voice, readTyped: parsed.data.voice.readTyped ?? current.voice.readTyped },
  };
  await saveProfile(leader, next);
  await updateLeaderDisplay(leader, next.name, next.role);
  // Keep the signed-in session's display name and role in step with the profile.
  const token = await signSession({ ...leader, name: next.name, role: next.role });
  const response = NextResponse.json({ profile: next });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
