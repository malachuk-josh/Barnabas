import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

// API routes read the signed-in leader from the session cookie; tests choose who is signed in.
const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { GET, PUT } from "@/app/api/admin/ai/route";
import { resolvedAi } from "@/lib/ai/settings";
import { modelFor, turnParams } from "@/lib/engine/claude";
import { recordSignIn } from "@/lib/team";
import { freshStore } from "./helpers";

const admin: Leader = { churchId: "demo", leaderId: "adm1", name: "Pastor Admin", email: "admin@example.org", role: "" };
const plain: Leader = { churchId: "demo", leaderId: "lee1", name: "Lee", email: "lee@example.org", role: "" };
const put = (body: unknown) => PUT(new Request("http://x/api/admin/ai", { method: "PUT", body: JSON.stringify(body) }));

describe("Settings → Barnabas AI", () => {
  beforeEach(async () => {
    freshStore();
    vi.stubEnv("BARNABAS_ADMIN_EMAILS", "admin@example.org");
    await recordSignIn(admin);
    await recordSignIn(plain);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is for admins only", async () => {
    session.current = plain;
    expect((await GET()).status).toBe(403);
    expect((await put({ textModel: "claude-haiku-5-5", voiceModel: null, textEffort: null })).status).toBe(403);
  });

  it("uses the defaults until an admin chooses, then the choice, for typed and spoken turns", async () => {
    session.current = admin;
    const before = await (await GET()).json();
    expect(before.textModel).toBe("claude-opus-5-5");
    expect(before.voiceModel).toBe("claude-sonnet-5-5");
    expect(before.chosen.textModel).toBe(false);

    expect(before.voiceEffort).toBe("low");
    const r = await put({ textModel: "claude-sonnet-5-5", voiceModel: "claude-opus-5-5", textEffort: "high", voiceEffort: "medium" });
    expect(r.status).toBe(200);
    const ai = await resolvedAi("demo");
    expect(ai).toEqual({ textModel: "claude-sonnet-5-5", voiceModel: "claude-opus-5-5", textEffort: "high", voiceEffort: "medium" });

    const meta = { id: "c1", context: "ctx", mode: "text" } as never;
    const typed = turnParams(meta, [{ role: "user", content: "hi" }], "text", ai);
    expect(typed.model).toBe("claude-sonnet-5-5");
    expect(typed.output_config?.effort).toBe("high");
    // Opus can't turn thinking off, so spoken turns on Opus use adaptive at low effort.
    expect(modelFor("voice", ai)).toMatchObject({ model: "claude-opus-5-5", thinking: { type: "adaptive" }, effort: "medium" });
    // Sonnet 5.5 keeps between_tools (no extended thinking), at the chosen effort.
    expect(modelFor("voice", { ...ai, voiceModel: "claude-sonnet-5-5", voiceEffort: "high" })).toMatchObject({ thinking: { type: "between_tools" }, effort: "high" });

    await put({ textModel: null, voiceModel: null, textEffort: null, voiceEffort: null });
    expect(await resolvedAi("demo")).toEqual({ textModel: "claude-opus-5-5", voiceModel: "claude-sonnet-5-5", textEffort: "low", voiceEffort: "low" });
  });

  it("only accepts models and levels from the list", async () => {
    session.current = admin;
    expect((await put({ textModel: "gpt-5", voiceModel: null, textEffort: null })).status).toBe(400);
    expect((await put({ textModel: null, voiceModel: null, textEffort: "max" })).status).toBe(400);
    expect((await put({ textModel: null, voiceModel: null, textEffort: null, voiceEffort: "max" })).status).toBe(400);
  });
});

describe("voice stability and style sliders", () => {
  beforeEach(async () => {
    freshStore();
    vi.stubEnv("BARNABAS_ADMIN_EMAILS", "admin@example.org");
    await recordSignIn(admin);
    await recordSignIn(plain);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("default to Vercel's values (or 0.42 / 0.3), and an admin's choice wins for every spoken sentence", async () => {
    const { voiceDelivery } = await import("@/lib/ai/settings");
    expect(await voiceDelivery("demo")).toMatchObject({ stability: 0.42, style: 0.3 });
    vi.stubEnv("ELEVENLABS_STYLE", "0.35");
    expect(await voiceDelivery("demo")).toMatchObject({ stability: 0.42, style: 0.35 });

    session.current = admin;
    const r = await put({ textModel: null, voiceModel: null, textEffort: null, voiceStability: 0.5, voiceStyle: 0.2 });
    expect(r.status).toBe(200);
    const view = await r.json();
    expect(view).toMatchObject({ voiceStability: 0.5, voiceStyle: 0.2, chosen: { voiceStability: true, voiceStyle: true } });
    expect(await voiceDelivery("demo")).toMatchObject({ stability: 0.5, style: 0.2, similarity_boost: 0.8 });

    // The TTS request carries them.
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "barnabasvoice01");
    const fetchMock = vi.fn(async () => new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/voice/tts/route");
    await POST(new Request("http://x/api/voice/tts", { method: "POST", body: JSON.stringify({ text: "Hello." }) }));
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.voice_settings).toMatchObject({ stability: 0.5, style: 0.2 });

    // "Use default" clears them.
    await put({ textModel: null, voiceModel: null, textEffort: null, voiceStability: null, voiceStyle: null });
    expect(await voiceDelivery("demo")).toMatchObject({ stability: 0.42, style: 0.35 });
  });

  it("are admin-only and must be between 0 and 1", async () => {
    session.current = plain;
    expect((await put({ textModel: null, voiceModel: null, textEffort: null, voiceStyle: 0.4 })).status).toBe(403);
    session.current = admin;
    expect((await put({ textModel: null, voiceModel: null, textEffort: null, voiceStyle: 1.4 })).status).toBe(400);
  });
});
