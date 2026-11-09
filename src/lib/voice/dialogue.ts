/**
 * Server-side client for ElevenLabs' Text to Dialogue WebSocket, the only live connection that
 * accepts eleven_v4_turbo. Used by the admin-only voice test (/voice-test) to compare it with
 * today's sentence-by-sentence path by ear. The API key goes in the first message and never
 * leaves the server; nothing here logs it.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-dialogue/ttd-websocket
 */
import { deliverySettings, elevenLabs, supportsLanguageCode } from "./server";

export type FeedMode = "whole" | "chunked";

export type DialogueRequest = {
  /** Already normalized for speech. */
  text: string;
  mode: FeedMode;
  lang?: "en" | "es" | "ko";
  signal?: AbortSignal;
  /** Chunked mode: pause between pieces, imitating Claude's stream. */
  intervalMs?: number;
};

export type DialogueResult = {
  audio: Buffer;
  contentType: string;
  /** From the start of the call until the socket opened. */
  connectMs: number;
  /** From the start of the call until the first audio chunk arrived. */
  firstAudioMs: number | null;
  totalMs: number;
  chunks: number;
  /** Messages sent after the first one (text pieces and controls), for the readout. */
  sent: number;
};

export class DialogueError extends Error {
  constructor(
    message: string,
    /** ElevenLabs' machine-readable error, e.g. "authentication_required", or our own reason. */
    readonly code: string,
    /** ElevenLabs' human-readable description or the socket's close reason, safe to show an admin. */
    readonly detail?: string,
  ) {
    super(message);
  }
}

export const OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_WS_BASE = "wss://api.elevenlabs.io";
const TIMEOUT_MS = 30_000;

/** The socket URL. ELEVENLABS_WS_URL replaces the host (only for local testing against a fake server). */
export function dialogueUrl(lang?: string) {
  const base = (process.env.ELEVENLABS_WS_URL || DEFAULT_WS_BASE).replace(/\/+$/, "");
  const model = elevenLabs.model();
  const q = new URLSearchParams({ model_id: model, output_format: OUTPUT_FORMAT });
  if (lang && supportsLanguageCode(model)) q.set("language_code", lang);
  return `${base}/v1/text-to-dialogue/stream-input?${q}`;
}

/**
 * Splits text into pieces of 2, 3 and 4 words in turn, each ending with the space that follows it,
 * so the pieces join back into the original text.
 */
export function splitIntoPieces(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const sizes = [2, 3, 4];
  const out: string[] = [];
  for (let i = 0, n = 0; i < words.length; n++) {
    const size = sizes[n % sizes.length];
    out.push(`${words.slice(i, i + size).join(" ")} `);
    i += size;
  }
  return out;
}

type ServerMessage = {
  audio?: string | null;
  is_final?: boolean;
  is_final_audio_for_turn?: boolean;
  error?: string;
  message?: string;
  code?: number;
};

/** Synthesizes `text` over one Text to Dialogue connection and returns all the audio. */
export async function synthesizeDialogue(req: DialogueRequest): Promise<DialogueResult> {
  const key = elevenLabs.key();
  const voice = elevenLabs.defaultVoice();
  if (!key || !voice) throw new DialogueError("Barnabas's voice isn't set up.", "not_configured");
  if (!req.text.trim()) throw new DialogueError("Nothing to say.", "empty");

  const started = Date.now();
  const ws = new WebSocket(dialogueUrl(req.lang));
  const chunks: Buffer[] = [];
  let connectMs = 0;
  let firstAudioMs: number | null = null;
  let sent = 0;
  let settled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const send = (msg: Record<string, unknown>) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  };

  return new Promise<DialogueResult>((resolve, reject) => {
    const finish = (err: DialogueError | null) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      req.signal?.removeEventListener("abort", onAbort);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close(1000);
        } catch {
          /* already closing */
        }
      }
      if (err) {
        console.error(`[barnabas] dialogue socket failed: ${err.code}${err.detail ? ` (${err.detail})` : ""}`);
        reject(err);
        return;
      }
      resolve({
        audio: Buffer.concat(chunks),
        contentType: "audio/mpeg",
        connectMs,
        firstAudioMs,
        totalMs: Date.now() - started,
        chunks: chunks.length,
        sent,
      });
    };
    const onAbort = () => finish(new DialogueError("Stopped.", "aborted"));
    if (req.signal?.aborted) return onAbort();
    req.signal?.addEventListener("abort", onAbort);
    timers.push(setTimeout(() => finish(new DialogueError("The voice took too long.", "timeout")), TIMEOUT_MS));

    ws.onopen = () => {
      connectMs = Date.now() - started;
      // The one voice and its settings. This route accepts only stability (and clone_strength for v4-tuned
      // professional clones), so the HTTP path's style, similarity and speaker boost can't be sent here.
      send({ voices: [voice], voice_settings: { stability: deliverySettings().stability }, xi_api_key: key });
      const input = (text: string) => {
        send({ inputs: [{ text, voice_id: voice }] });
        sent++;
      };
      const end = () => {
        // Flush only at the end, then ask the server to finish and close.
        send({ flush: true });
        send({ close_socket: true });
        sent += 2;
      };
      if (req.mode === "whole") {
        input(req.text);
        end();
        return;
      }
      const pieces = splitIntoPieces(req.text);
      const interval = req.intervalMs ?? 60;
      pieces.forEach((p, i) => timers.push(setTimeout(() => input(p), i * interval)));
      timers.push(setTimeout(end, pieces.length * interval));
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data as ArrayBuffer).toString("utf8"));
      } catch {
        return;
      }
      if (msg.error) {
        finish(new DialogueError("ElevenLabs refused the request.", msg.error, msg.message));
        return;
      }
      if (typeof msg.audio === "string" && msg.audio) {
        if (firstAudioMs === null) firstAudioMs = Date.now() - started;
        chunks.push(Buffer.from(msg.audio, "base64"));
      }
      if (msg.is_final) finish(null);
    };

    ws.onerror = () => {
      // Before opening: the handshake was refused (bad key, missing permission, unknown host); Node fires no
      // close event then. After opening: wait briefly for the close event, which carries the code and reason.
      if (!connectMs) return finish(new DialogueError("Couldn't connect to ElevenLabs.", "connect_failed", "the connection was refused"));
      timers.push(setTimeout(() => finish(new DialogueError("The connection to ElevenLabs failed.", "socket_error")), 1000));
    };

    ws.onclose = (event) => {
      if (settled) return;
      if (event.code === 1000 && chunks.length) return finish(null);
      const reason = event.reason ? `close ${event.code}: ${event.reason}` : `close ${event.code}`;
      if (!connectMs) return finish(new DialogueError("Couldn't connect to ElevenLabs.", "connect_failed", reason));
      finish(new DialogueError("ElevenLabs closed the connection before finishing.", "closed_early", reason));
    };
  });
}
