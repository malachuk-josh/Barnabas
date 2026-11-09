import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startFakeElevenLabs } from "../scripts/fake-elevenlabs-ws.mjs";
import { DialogueError, dialogueUrl, splitIntoPieces, synthesizeDialogue } from "@/lib/voice/dialogue";

let fake: Awaited<ReturnType<typeof startFakeElevenLabs>>;
const SAMPLE = "Good morning! It sounds like this week is going to be full, but you've got a great team around you. Want me to look at who's serving Sunday?";

beforeAll(async () => {
  fake = await startFakeElevenLabs();
});
afterAll(() => fake.close());

function env(overrides: Record<string, string | undefined> = {}) {
  vi.stubEnv("ELEVENLABS_WS_URL", fake.url);
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key-123");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "barnabasvoice01");
  vi.stubEnv("ELEVENLABS_MODEL", undefined);
  vi.stubEnv("ELEVENLABS_STABILITY", undefined);
  for (const [k, v] of Object.entries(overrides)) vi.stubEnv(k, v);
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const last = () => fake.connections[fake.connections.length - 1];

describe("splitIntoPieces", () => {
  it("cuts 2, 3, then 4 words and joins back to the same text", () => {
    const pieces = splitIntoPieces("one two three four five six seven eight nine ten");
    expect(pieces).toEqual(["one two ", "three four five ", "six seven eight nine ", "ten "]);
    expect(pieces.join("").trim()).toBe("one two three four five six seven eight nine ten");
    expect(splitIntoPieces("  ")).toEqual([]);
  });
});

describe("dialogueUrl", () => {
  it("uses the override host, eleven_v4_turbo, MP3 output and the language hint", () => {
    env();
    const url = new URL(dialogueUrl("es"));
    expect(url.origin).toBe(fake.url.replace(/^ws/, "ws"));
    expect(url.pathname).toBe("/v1/text-to-dialogue/stream-input");
    expect(url.searchParams.get("model_id")).toBe("eleven_v4_turbo");
    expect(url.searchParams.get("output_format")).toBe("mp3_44100_128");
    expect(url.searchParams.get("language_code")).toBe("es");
    // The key never goes in the URL.
    expect(url.toString()).not.toContain("test-key-123");
  });

  it("defaults to the real ElevenLabs host", () => {
    env({ ELEVENLABS_WS_URL: undefined });
    expect(dialogueUrl()).toMatch(/^wss:\/\/api\.elevenlabs\.io\/v1\/text-to-dialogue\/stream-input\?/);
  });
});

describe("synthesizeDialogue", () => {
  it("whole: registers the voice with stability only, sends the text once, flushes and closes", async () => {
    env();
    const r = await synthesizeDialogue({ text: SAMPLE, mode: "whole", lang: "en" });
    const conn = last();
    expect(conn.messages[0]).toEqual({ voices: ["barnabasvoice01"], voice_settings: { stability: 0.35 }, xi_api_key: "test-key-123" });
    expect(conn.messages.slice(1)).toEqual([{ inputs: [{ text: SAMPLE, voice_id: "barnabasvoice01" }] }, { flush: true }, { close_socket: true }]);
    expect(r.chunks).toBeGreaterThan(1);
    expect(r.audio.length).toBeGreaterThan(0);
    // The audio is the concatenated MP3 frames.
    expect(r.audio.readUInt32BE(0)).toBe(0xfffb9064);
    expect(r.contentType).toBe("audio/mpeg");
    expect(r.firstAudioMs).not.toBeNull();
    expect(r.firstAudioMs!).toBeLessThanOrEqual(r.totalMs);
    expect(r.connectMs).toBeLessThanOrEqual(r.firstAudioMs!);
  });

  it("follows ELEVENLABS_STABILITY", async () => {
    env({ ELEVENLABS_STABILITY: "0.6" });
    await synthesizeDialogue({ text: "Hello there, friend.", mode: "whole" });
    expect(last().messages[0].voice_settings).toEqual({ stability: 0.6 });
  });

  it("chunked: feeds 2-4 word pieces in order, one context, and flushes only at the end", async () => {
    env();
    const r = await synthesizeDialogue({ text: SAMPLE, mode: "chunked", intervalMs: 2 });
    const msgs = last().messages.slice(1);
    const inputs = msgs.filter((m) => "inputs" in m) as { inputs: { text: string; voice_id: string }[] }[];
    expect(inputs.length).toBe(splitIntoPieces(SAMPLE).length);
    expect(inputs.map((m) => m.inputs[0].text).join("").trim()).toBe(SAMPLE);
    for (const m of inputs) {
      expect(m.inputs).toHaveLength(1);
      expect(m.inputs[0].voice_id).toBe("barnabasvoice01");
      expect(m.inputs[0]).not.toHaveProperty("new_turn");
      expect(m.inputs[0].text.trim().split(" ").length).toBeLessThanOrEqual(4);
    }
    // No flush mid-reply: the only controls are the last two messages.
    const controlAt = msgs.map((m, i) => ("flush" in m || "close_socket" in m ? i : -1)).filter((i) => i >= 0);
    expect(controlAt).toEqual([msgs.length - 2, msgs.length - 1]);
    expect(msgs.at(-2)).toEqual({ flush: true });
    expect(msgs.at(-1)).toEqual({ close_socket: true });
    // The fake generates as text accumulates, so audio starts before the feed ends.
    expect(r.chunks).toBeGreaterThan(1);
    expect(r.sent).toBe(inputs.length + 2);
  });

  it("reports a rejected model with ElevenLabs' message", async () => {
    env({ ELEVENLABS_MODEL: "eleven_flash_v2_5" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await synthesizeDialogue({ text: "Hello there.", mode: "whole" }).catch((e) => e);
    expect(err).toBeInstanceOf(DialogueError);
    expect(err.code).toBe("invalid_model");
    expect(err.detail).toContain("eleven_v3 or eleven_v4");
  });

  it("reports rejected voice settings, and never logs the key", async () => {
    env({ ELEVENLABS_VOICE_ID: "rejectsettings0" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await synthesizeDialogue({ text: "Hello there.", mode: "whole" }).catch((e) => e);
    expect(err.code).toBe("invalid_voice_settings");
    expect(err.detail).toContain("voice_settings");
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("test-key-123");
  });

  it("fails when the connection drops before the final message", async () => {
    env({ ELEVENLABS_VOICE_ID: "dropconnection0" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await synthesizeDialogue({ text: SAMPLE, mode: "whole" }).catch((e) => e);
    expect(err).toBeInstanceOf(DialogueError);
    expect(err.code).toBe("closed_early");
    expect(err.detail).toContain("1011");
  });

  it("fails clearly when nothing is listening", async () => {
    env({ ELEVENLABS_WS_URL: "ws://127.0.0.1:1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await synthesizeDialogue({ text: "Hello.", mode: "whole" }).catch((e) => e);
    expect(err.code).toBe("connect_failed");
  });

  it("closes the socket when aborted mid-feed", async () => {
    env();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ac = new AbortController();
    const before = fake.connections.length;
    const p = synthesizeDialogue({ text: SAMPLE, mode: "chunked", intervalMs: 50, signal: ac.signal }).catch((e) => e);
    await new Promise((r) => setTimeout(r, 120));
    ac.abort();
    const err = await p;
    expect(err.code).toBe("aborted");
    await new Promise((r) => setTimeout(r, 50));
    const conn = fake.connections[before];
    expect(conn.closedByClient).toBe(true);
    expect(conn.messages.some((m) => "close_socket" in m)).toBe(false);
  });

  it("refuses without a key or voice", async () => {
    env({ ELEVENLABS_API_KEY: undefined });
    await expect(synthesizeDialogue({ text: "Hi.", mode: "whole" })).rejects.toMatchObject({ code: "not_configured" });
  });
});
