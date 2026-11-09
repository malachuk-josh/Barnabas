import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { deepgram, elevenLabs, VOICE_ID } from "@/lib/voice/server";

export const runtime = "nodejs";

/** Voice setup status and the name of Barnabas's voice (the church's clone). */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  const id = elevenLabs.defaultVoice();
  const status = { tts: elevenLabs.configured(), stt: deepgram.configured(), voiceReady: elevenLabs.configured() && VOICE_ID.test(id), voiceName: "" };
  if (!status.voiceReady) return NextResponse.json(status);
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${id}`, { headers: { "xi-api-key": elevenLabs.key() }, signal: AbortSignal.timeout(8000) });
    const body = res.ok ? await res.json() : null;
    return NextResponse.json({ ...status, voiceName: body?.name ?? "" });
  } catch {
    return NextResponse.json(status);
  }
}
