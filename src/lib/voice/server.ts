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
