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

    const r = await put({ textModel: "claude-sonnet-5-5", voiceModel: "claude-opus-5-5", textEffort: "high" });
    expect(r.status).toBe(200);
    const ai = await resolvedAi("demo");
    expect(ai).toEqual({ textModel: "claude-sonnet-5-5", voiceModel: "claude-opus-5-5", textEffort: "high" });

    const meta = { id: "c1", context: "ctx", mode: "text" } as never;
    const typed = turnParams(meta, [{ role: "user", content: "hi" }], "text", ai);
    expect(typed.model).toBe("claude-sonnet-5-5");
    expect(typed.output_config?.effort).toBe("high");
    // Opus can't turn thinking off, so spoken turns on Opus use adaptive at low effort.
    expect(modelFor("voice", ai)).toMatchObject({ model: "claude-opus-5-5", thinking: { type: "adaptive" }, effort: "low" });

    await put({ textModel: null, voiceModel: null, textEffort: null });
    expect(await resolvedAi("demo")).toEqual({ textModel: "claude-opus-5-5", voiceModel: "claude-sonnet-5-5", textEffort: "low" });
  });

  it("only accepts models and levels from the list", async () => {
    session.current = admin;
    expect((await put({ textModel: "gpt-5", voiceModel: null, textEffort: null })).status).toBe(400);
    expect((await put({ textModel: null, voiceModel: null, textEffort: "max" })).status).toBe(400);
  });
});
