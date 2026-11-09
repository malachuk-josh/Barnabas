import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/lib/auth/session";

const session = vi.hoisted(() => ({ current: null as Leader | null }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  currentLeader: async () => session.current,
}));

import { GET } from "@/app/api/voice/filler/[n]/route";
import { ensureProfile } from "@/lib/profile";
import { FILLERS } from "@/lib/voice/fillers";
import { freshStore, leader } from "./helpers";

const call = (n: string, lang = "en") => GET(new Request(`http://x/api/voice/filler/${n}?lang=${lang}`), { params: Promise.resolve({ n }) });

describe("filler sounds", () => {
  beforeEach(() => {
    freshStore();
    session.current = leader;
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "barnabasvoice01");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("are short and calm, never cheerful (they must fit a hard moment too)", () => {
    for (const list of Object.values(FILLERS)) {
      expect(list.length).toBeGreaterThan(3);
      for (const f of list) {
        expect(f.length).toBeLessThan(20);
        expect(f).not.toMatch(/great|awesome|!|love/i);
      }
    }
  });

  it("are generated once in Barnabas's voice, then served from storage", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const a = await call("1");
    expect(a.status).toBe(200);
    expect(new Uint8Array(await a.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.text).toBe(FILLERS.en[1]);
    const b = await call("1");
    expect(b.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached
    expect((await call("99")).status).toBe(404);
  });

  it("need a signed-in leader, and are on by default", async () => {
    session.current = null;
    expect((await call("0")).status).toBe(401);
    expect((await ensureProfile(leader)).voice.fillers).toBe(true);
  });
});
