import { beforeEach, describe, expect, it } from "vitest";
import { ensureProfile, getProfile, handsFreeOnSignIn, saveProfile } from "@/lib/profile";
import { freshStore, leader } from "./helpers";

describe("hands-free default", () => {
  beforeEach(() => freshStore());

  it("starts a new leader in hands-free mode", async () => {
    expect((await ensureProfile(leader)).voice.handsFree).toBe(true);
  });

  it("turns hands-free back on when a leader signs in again", async () => {
    const p = await ensureProfile(leader);
    await saveProfile(leader, { ...p, voice: { ...p.voice, handsFree: false, rate: 1.2 } });
    const signedIn = await handsFreeOnSignIn(leader, await ensureProfile(leader));
    expect(signedIn.voice.handsFree).toBe(true);
    const saved = await getProfile(leader);
    expect(saved.voice.handsFree).toBe(true);
    expect(saved.voice.rate).toBe(1.2);
  });
});

describe("Bible translation", () => {
  beforeEach(() => freshStore());

  it("defaults to the King James Version, including for profiles saved before the setting existed", async () => {
    const p = await ensureProfile(leader);
    expect(p.bibleTranslation).toBe("kjv");
    const { bibleTranslation: _drop, ...old } = p;
    await saveProfile(leader, old as typeof p);
    expect((await getProfile(leader)).bibleTranslation).toBe("kjv");
  });

  it("tells Barnabas which translation to quote", async () => {
    const { BARNABAS_SYSTEM } = await import("@/lib/engine/prompt");
    expect(BARNABAS_SYSTEM).toMatch(/King James Version \(KJV\) unless they chose another/);
    const { BIBLE_TRANSLATIONS } = await import("@/lib/profile");
    expect(BIBLE_TRANSLATIONS.kjv).toBe("King James Version (KJV)");
  });
});

describe("read typed replies aloud", () => {
  beforeEach(() => freshStore());

  it("is off by default, including for profiles saved before the setting existed", async () => {
    const p = await ensureProfile(leader);
    expect(p.voice.readTyped).toBe(false);
    const { readTyped: _drop, ...oldVoice } = p.voice;
    await saveProfile(leader, { ...p, voice: oldVoice as typeof p.voice });
    expect((await getProfile(leader)).voice.readTyped).toBe(false);
  });
});
