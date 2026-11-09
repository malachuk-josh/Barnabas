import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { getProfile } from "@/lib/profile";
import { deliverySettings, elevenLabs, supportsLanguageCode, VOICE_ID } from "@/lib/voice/server";

export const runtime = "nodejs";

const Body = z.object({
  text: z.string().trim().min(1).max(800),
  lang: z.enum(["en", "es", "ko"]).optional(),
  /** Only for previews in Settings. */
  voiceId: z.string().regex(VOICE_ID).optional(),
});

/** Speaks one sentence in Barnabas's voice, streamed as MP3 so playback starts right away. */
export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  if (!elevenLabs.configured()) return NextResponse.json({ error: "Barnabas's voice isn't set up." }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
  const profile = await getProfile(leader);
  const voice = parsed.data.voiceId || profile.voice.voiceId || elevenLabs.defaultVoice();
  if (!voice) return NextResponse.json({ error: "Choose a voice in Settings." }, { status: 503 });
  const model = elevenLabs.model();
  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": elevenLabs.key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: parsed.data.text,
      model_id: model,
      voice_settings: deliverySettings(),
      ...(parsed.data.lang && supportsLanguageCode(model) ? { language_code: parsed.data.lang } : {}),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!upstream.ok || !upstream.body) {
    console.error("[barnabas] tts failed", upstream.status, await upstream.text().catch(() => ""));
    return NextResponse.json({ error: "Barnabas's voice isn't available right now." }, { status: 502 });
  }
  return new Response(upstream.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
