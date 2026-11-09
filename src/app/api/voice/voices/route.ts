import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { deepgram, elevenLabs } from "@/lib/voice/server";

export const runtime = "nodejs";

/** Voice setup status and the voices available in the church's ElevenLabs account. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const status = { tts: elevenLabs.configured(), stt: deepgram.configured(), defaultVoice: elevenLabs.defaultVoice(), model: elevenLabs.model() };
  if (!status.tts) return NextResponse.json({ ...status, voices: [] });
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": elevenLabs.key() }, signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    type ElevenVoice = { voice_id: string; name: string; category?: string; labels?: { gender?: string } };
    // Barnabas speaks with a male voice: female voices are left out of the picker.
    // Cloned voices without a gender label are kept, so the church's own clone always shows.
    const voices = ((body.voices ?? []) as ElevenVoice[])
      .filter((v) => (v.labels?.gender ?? "").toLowerCase() !== "female")
      .map((v) => ({ id: v.voice_id, name: v.name, category: v.category ?? "" }));
    // Cloned and designed voices first: they're the church's own.
    voices.sort((a, b) => Number(b.category !== "premade") - Number(a.category !== "premade") || a.name.localeCompare(b.name));
    return NextResponse.json({ ...status, voices });
  } catch {
    return NextResponse.json({ ...status, voices: [], error: "Couldn't load voices from ElevenLabs." });
  }
}
