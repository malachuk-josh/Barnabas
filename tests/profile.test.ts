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
