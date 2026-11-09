import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { getJSON, setJSON } from "@/lib/store";
import { FILLERS } from "@/lib/voice/fillers";
import { voiceDelivery } from "@/lib/ai/settings";
import { elevenLabs, supportsLanguageCode, VOICE_ID } from "@/lib/voice/server";

export const runtime = "nodejs";

/**
 * One filler sound ("Mm.", "Let me think.") in Barnabas's voice. Generated once per voice, model,
 * delivery settings and phrase, then kept in Redis, so it costs ElevenLabs nothing after the first time
 * and plays instantly; the browser caches it too.
 */
export async function GET(request: Request, { params }: { params: Promise<{ n: string }> }) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  if (!elevenLabs.configured()) return NextResponse.json({ error: "Barnabas's voice isn't set up." }, { status: 503 });
  const voice = elevenLabs.defaultVoice();
  if (!voice || !VOICE_ID.test(voice)) return NextResponse.json({ error: "Barnabas's voice isn't set up." }, { status: 503 });
  const lang = (new URL(request.url).searchParams.get("lang") ?? "en") as keyof typeof FILLERS;
  const list = FILLERS[lang] ?? FILLERS.en;
  const n = Number((await params).n);
  if (!Number.isInteger(n) || n < 0 || n >= list.length) return NextResponse.json({ error: "No such sound." }, { status: 404 });
  const text = list[n]!;
  const model = elevenLabs.model();
  const settings = await voiceDelivery(leader.churchId);
  const hash = createHash("sha256").update(JSON.stringify([voice, model, settings, lang, text])).digest("hex").slice(0, 24);
  const key = `filler:${hash}`;

  let audio: Buffer | null = null;
  const cached = await getJSON<string>(key).catch(() => null);
  if (cached) audio = Buffer.from(cached, "base64");
  if (!audio) {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": elevenLabs.key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model, voice_settings: settings, ...(supportsLanguageCode(model) ? { language_code: lang } : {}) }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (!upstream?.ok) return NextResponse.json({ error: "That sound isn't available right now." }, { status: 502 });
    audio = Buffer.from(await upstream.arrayBuffer());
    await setJSON(key, audio.toString("base64")).catch(() => {});
  }
  return new Response(new Uint8Array(audio), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=604800", ETag: `"${hash}"` },
  });
}
