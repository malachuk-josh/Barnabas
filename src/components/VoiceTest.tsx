"use client";

import { useRef, useState } from "react";
import { SentenceChunker } from "@/lib/speech/chunker";
import { CloudSpeaker, silentWav, type Speaker } from "@/lib/voice/client";

type Lang = "en-US" | "es-US" | "ko-KR";
type Way = "A" | "B" | "C";

const SAMPLE =
  "Good morning! It sounds like this week is going to be full, but you've got a great team around you. Want me to look at who's serving Sunday?";

const WAYS: { id: Way; title: string; about: string }[] = [
  { id: "A", title: "A · Today's voice", about: "One request per sentence, played in order, with today's full voice settings." },
  { id: "B", title: "B · Live connection, all at once", about: "One v4 Turbo connection, the whole reply sent together, stability only." },
  { id: "C", title: "C · Live connection, word by word", about: "The same connection, fed 2–4 words every 60 ms like Claude's stream, flushed only at the end." },
];

type Result = { firstAudio?: number; total?: number; server?: string; error?: string; running?: boolean };

const secs = (ms?: number) => (ms === undefined ? "–" : `${(ms / 1000).toFixed(2)}s`);

export function VoiceTest({
  pronunciations,
  lang,
  rate,
  configured,
  model,
}: {
  pronunciations: { word: string; sayAs: string }[];
  lang: Lang;
  rate: number;
  configured: boolean;
  model: string;
}) {
  const [text, setText] = useState(SAMPLE);
  const [results, setResults] = useState<Partial<Record<Way, Result>>>({});
  const audio = useRef<HTMLAudioElement | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const run = useRef(0);

  const set = (way: Way, r: Result) => setResults((all) => ({ ...all, [way]: r }));

  function stopAll() {
    run.current++;
    speaker.current?.stop();
    if (audio.current) {
      audio.current.pause();
      audio.current.removeAttribute("src");
    }
  }

  function playA(id: number) {
    // Exactly today's path: CloudSpeaker fetching /api/voice/tts sentence by sentence.
    const start = performance.now();
    let first: number | undefined;
    let failed = false;
    const s = new CloudSpeaker({
      lang,
      rate,
      pronunciations,
      onStart: () => {
        if (first === undefined) first = performance.now() - start;
        if (run.current === id) set("A", { firstAudio: first, running: true });
      },
      onIdle: () => {
        if (run.current === id) set("A", { firstAudio: first, total: performance.now() - start, error: failed ? "A sentence didn't load (see the server log)." : undefined });
      },
      onError: () => {
        failed = true;
      },
    });
    speaker.current = s;
    s.unlock();
    const chunker = new SentenceChunker();
    [...chunker.push(text), ...chunker.flush()].forEach((sentence) => s.speak(sentence));
  }

  async function playLive(way: "B" | "C", id: number) {
    // Unlock this element inside the tap, then reuse it once the audio arrives (iPhone needs this).
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    a.src = silentWav();
    a.play().catch(() => {});
    const start = performance.now();
    try {
      const res = await fetch("/api/voice/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode: way === "B" ? "whole" : "chunked", lang: lang.slice(0, 2) }),
      });
      if (run.current !== id) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; detail?: string | null; model?: string };
        const why = [body.code, body.detail].filter(Boolean).join(": ");
        set(way, { error: `${body.error ?? `Failed (${res.status}).`}${why ? ` ElevenLabs said ${why}.` : ""}${body.model ? ` Model ${body.model}.` : ""}` });
        return;
      }
      const h = (k: string) => res.headers.get(k) ?? "-";
      const server = `server: connected ${h("X-Connect-Ms")}ms, first audio chunk ${h("X-First-Audio-Ms")}ms, done ${h("X-Total-Ms")}ms, ${h("X-Chunks")} chunks`;
      const url = URL.createObjectURL(await res.blob());
      if (run.current !== id) return URL.revokeObjectURL(url);
      a.src = url;
      a.playbackRate = rate;
      a.onended = a.onerror = () => {
        URL.revokeObjectURL(url);
        if (run.current === id) setResults((all) => ({ ...all, [way]: { ...all[way], total: performance.now() - start, running: false } }));
      };
      const firstAudio = performance.now() - start;
      set(way, { firstAudio, server, running: true });
      await a.play().catch(() => set(way, { firstAudio, server, error: "The browser wouldn't play it. Tap the button again." }));
    } catch {
      if (run.current === id) set(way, { error: "Couldn't reach the server." });
    }
  }

  function onPlay(way: Way) {
    stopAll();
    const id = run.current;
    set(way, { running: true });
    if (way === "A") playA(id);
    else void playLive(way, id);
  }

  return (
    <div className="stack voice-test" style={{ gap: 16, maxWidth: 640 }}>
      {!configured && (
        <div className="notice notice-danger" role="alert">
          Barnabas's voice isn't set up on this server (ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID).
        </div>
      )}
      <label className="stack" style={{ gap: 6 }}>
        <span style={{ fontWeight: 600 }}>What Barnabas says</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={1500}
          style={{ fontFamily: "inherit", fontSize: "1rem", minHeight: 120, width: "100%" }}
        />
      </label>
      {WAYS.map((w) => {
        const r = results[w.id];
        return (
          <div key={w.id} className="card stack" style={{ gap: 8, padding: 16 }} data-way={w.id}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <strong>{w.title}</strong>
              <button type="button" className="btn btn-primary" onClick={() => onPlay(w.id)} disabled={!text.trim()}>
                Play {w.id}
              </button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>{w.about}</p>
            {r && (
              <p className="small" style={{ margin: 0 }} aria-live="polite" data-result={w.id}>
                {r.error ? (
                  <span style={{ color: "var(--danger)", fontWeight: 600 }}>{r.error}</span>
                ) : (
                  <>
                    First audio <strong>{secs(r.firstAudio)}</strong> · total <strong>{r.total === undefined && r.running ? "playing…" : secs(r.total)}</strong>
                    {r.server && <span className="muted" style={{ display: "block" }}>{r.server}</span>}
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
      <button type="button" className="btn" onClick={stopAll} style={{ justifySelf: "start" }}>
        Stop
      </button>
      <p className="small muted" style={{ margin: 0 }}>
        Times are from your tap. &ldquo;First audio&rdquo; is when playback starts: for B and C that is after the whole clip has arrived,
        since this test doesn&rsquo;t stream playback; the server line shows when the first chunk arrived from ElevenLabs. Live model: {model}.
        A sends stability, style, similarity and speaker boost; B and C can send only stability.
      </p>
    </div>
  );
}
