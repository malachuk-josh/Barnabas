/**
 * Short sounds Barnabas makes right after the leader finishes speaking, so there's no dead air while
 * Claude writes the reply. Calm and neutral on purpose: they have to fit any moment, a hard one included.
 * Browser-safe (no server imports).
 */
export const FILLERS: Record<"en" | "es" | "ko", string[]> = {
  en: ["Mm.", "Okay.", "Mm-hmm.", "Let me think.", "Alright.", "Let's see.", "Mm, okay."],
  es: ["Mm.", "Bueno.", "A ver.", "Déjame pensar.", "Está bien."],
  ko: ["음.", "네.", "잠시만요.", "글쎄요.", "좋아요."],
};

/** Wait this long after sending before a filler plays; if Barnabas's first words arrive sooner, skip it. */
export const FILLER_DELAY_MS = 250;
