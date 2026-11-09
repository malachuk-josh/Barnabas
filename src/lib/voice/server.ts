/** Server-side voice settings. API keys never leave the server. */

export const elevenLabs = {
  key: () => process.env.ELEVENLABS_API_KEY ?? "",
  /** The church's default Barnabas voice (for example your cloned voice). */
  defaultVoice: () => process.env.ELEVENLABS_VOICE_ID ?? "",
  model: () => process.env.ELEVENLABS_MODEL || "eleven_v4_turbo",
  configured: () => Boolean(process.env.ELEVENLABS_API_KEY),
};

export const deepgram = {
  key: () => process.env.DEEPGRAM_API_KEY ?? "",
  configured: () => Boolean(process.env.DEEPGRAM_API_KEY),
};

/** v4 models accept a language hint; older models infer it. */
export function supportsLanguageCode(model: string) {
  return model.startsWith("eleven_v4");
}

export const VOICE_ID = /^[A-Za-z0-9]{8,40}$/;

/**
 * Delivery settings for a warm, upbeat voice. Lower stability lets the voice vary its intonation
 * (more expressive); style adds a little of the speaker's natural warmth. Override with
 * ELEVENLABS_STABILITY / ELEVENLABS_STYLE (0 to 1) if a particular voice sounds off.
 */
export function deliverySettings(overrides: { stability?: number; style?: number } = {}) {
  const num = (v: string | number | undefined, d: number) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 && n <= 1 ? n : d;
  };
  return {
    // An admin's choice in the voice sliders (Settings -> Barnabas and voice) wins, then Vercel's ELEVENLABS_* values, then these.
    stability: num(overrides.stability, num(process.env.ELEVENLABS_STABILITY, 0.6)),
    similarity_boost: 0.8,
    style: num(overrides.style, num(process.env.ELEVENLABS_STYLE, 0.6)),
    use_speaker_boost: true,
  };
}
