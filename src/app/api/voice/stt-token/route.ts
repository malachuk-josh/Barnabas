import { NextResponse } from "next/server";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { churchData } from "@/lib/chms";
import { getProfile } from "@/lib/profile";
import { deepgram } from "@/lib/voice/server";

export const runtime = "nodejs";

const SCRIPTURE_TERMS = ["Barnabas", "Habakkuk", "Zephaniah", "Haggai", "Nehemiah", "Ecclesiastes", "Philemon", "Thessalonians", "Colossians", "Deuteronomy"];

/** A 60-second token so the browser can stream audio to Deepgram without seeing the API key. */
export async function GET() {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  if (!deepgram.configured()) return NextResponse.json({ error: "Listening service isn't set up." }, { status: 503 });
  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${deepgram.key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 60 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error("[barnabas] deepgram token failed", res.status);
    return NextResponse.json({ error: "Couldn't start listening." }, { status: 502 });
  }
  const { access_token } = (await res.json()) as { access_token: string };
  // Names Barnabas should hear correctly: the congregation, the leader's pronunciation list, unusual Bible books.
  const profile = await getProfile(leader);
  const people = (await churchData().listPeople()).map((p) => p.name);
  const keyterms = [...new Set([...profile.pronunciations.map((p) => p.word), ...people, ...SCRIPTURE_TERMS])].slice(0, 80);
  return NextResponse.json({ token: access_token, keyterms });
}
