import { NextResponse } from "next/server";
import { z } from "zod";
import { currentLeader } from "@/lib/auth/session";
import { getProfile } from "@/lib/profile";
import { normalizeForSpeech } from "@/lib/speech/normalize";
import { accessFor } from "@/lib/team";
import { DialogueError, synthesizeDialogue } from "@/lib/voice/dialogue";
import { elevenLabs, VOICE_ID } from "@/lib/voice/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  text: z.string().trim().min(1).max(1500),
  mode: z.enum(["whole", "chunked"]),
  lang: z.enum(["en", "es", "ko"]).optional(),
});

const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });

/**
 * Admin-only voice test: speaks the text over ElevenLabs' Text to Dialogue WebSocket (eleven_v4_turbo)
 * and returns the whole MP3, with server timings in headers. Anyone who isn't an admin gets a 404.
 */
export async function POST(request: Request) {
  const leader = await currentLeader();
  if (!leader || !(await accessFor(leader)).admin) return notFound();
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Type something to say first." }, { status: 400 });
  const voice = elevenLabs.defaultVoice();
  if (!elevenLabs.configured() || !voice || !VOICE_ID.test(voice)) {
    return NextResponse.json({ error: "Barnabas's voice isn't set up (ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID)." }, { status: 503 });
  }
  // The same rewriting today's voice gets: the leader's pronunciations, then numbers, verses, times and money.
  const profile = await getProfile(leader);
  const text = normalizeForSpeech(parsed.data.text, profile.pronunciations);
  try {
    const r = await synthesizeDialogue({ text, mode: parsed.data.mode, lang: parsed.data.lang, signal: request.signal });
    return new Response(new Uint8Array(r.audio), {
      headers: {
        "Content-Type": r.contentType,
        "Cache-Control": "no-store",
        "X-Connect-Ms": String(r.connectMs),
        "X-First-Audio-Ms": String(r.firstAudioMs ?? ""),
        "X-Total-Ms": String(r.totalMs),
        "X-Chunks": String(r.chunks),
        "X-Model": elevenLabs.model(),
      },
    });
  } catch (err) {
    if (err instanceof DialogueError) {
      return NextResponse.json({ error: err.message, code: err.code, detail: err.detail ?? null, model: elevenLabs.model() }, { status: 502 });
    }
    console.error("[barnabas] voice test failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "The voice test failed on our side." }, { status: 500 });
  }
}
