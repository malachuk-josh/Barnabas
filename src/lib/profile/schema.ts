import { z } from "zod";
import { NOTIFICATION_TYPES } from "../notifications/types";
import { BIBLE_TRANSLATION_IDS } from "./translations";
import { isValidTimezone } from "./index";

/**
 * How a leader's own settings are validated: the Settings API (`src/app/api/profile/route.ts`) and
 * Barnabas's update_my_settings tool both use these, so they accept exactly the same values.
 */
export const VoiceBody = z.object({
  speakReplies: z.boolean(),
  language: z.enum(["en-US", "es-US", "ko-KR"]),
  rate: z.number().min(0.7).max(1.4),
  voiceId: z.string().regex(/^[A-Za-z0-9]{8,40}$/).optional().or(z.literal("")),
  handsFree: z.boolean(),
  readTyped: z.boolean().optional(),
  pauseMs: z.number().int().min(200).max(2000).optional(),
  fillers: z.boolean().optional(),
});

export const ProfileBody = z.object({
  name: z.string().trim().min(1).max(80),
  preferredName: z.string().trim().min(1).max(80),
  role: z.string().trim().max(80),
  ministries: z.array(z.string().trim().min(1).max(60)).max(12),
  timezone: z.string().refine(isValidTimezone, "Unknown time zone"),
  replyLanguage: z.enum(["en", "es", "ko"]),
  bibleTranslation: z.enum(BIBLE_TRANSLATION_IDS).optional(),
  voice: VoiceBody,
  pronunciations: z.array(z.object({ word: z.string().trim().min(1).max(40), sayAs: z.string().trim().min(1).max(60) })).max(50),
  about: z.string().max(1500),
});

/** The PATCH that saves notification toggles as they're flipped. */
export const NotificationsPatch = z.object({
  enabled: z.boolean().optional(),
  types: z.partialRecord(z.enum(NOTIFICATION_TYPES), z.boolean()).optional(),
});
