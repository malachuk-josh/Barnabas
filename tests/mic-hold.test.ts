import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A stand-in for a microphone stream: tracks that can be disabled and stopped. */
function fakeStream() {
  const track = { enabled: true, readyState: "live" as "live" | "ended", stop() { this.readyState = "ended"; } };
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream };
}

describe("keeping the microphone between conversations", () => {
  let gum: ReturnType<typeof vi.fn>;
  const listeners: Record<string, () => void> = {};
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    gum = vi.fn(async () => fakeStream().stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: gum } });
    vi.stubGlobal("document", { hidden: false, addEventListener: (e: string, f: () => void) => (listeners[e] = f) });
    vi.stubGlobal("window", { addEventListener: (e: string, f: () => void) => (listeners[`w:${e}`] = f) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reuses the held microphone for the next conversation without asking again", async () => {
    const { holdMic, takeMic } = await import("@/lib/voice/client");
    const first = await takeMic({ audio: true });
    expect(gum).toHaveBeenCalledTimes(1);
    holdMic(first);
    expect(first.getAudioTracks()[0]!.enabled).toBe(false); // nothing captured while held
    const second = await takeMic({ audio: true });
    expect(second).toBe(first);
    expect(gum).toHaveBeenCalledTimes(1);
    expect(second.getAudioTracks()[0]!.enabled).toBe(true);
  });

  it("lets go after 20 quiet minutes", async () => {
    const { holdMic, takeMic, MIC_HOLD_MS } = await import("@/lib/voice/client");
    expect(MIC_HOLD_MS).toBe(20 * 60 * 1000);
    const s = await takeMic({ audio: true });
    holdMic(s);
    vi.advanceTimersByTime(MIC_HOLD_MS - 1000);
    expect(s.getAudioTracks()[0]!.readyState).toBe("live");
    vi.advanceTimersByTime(1000);
    expect(s.getAudioTracks()[0]!.readyState).toBe("ended");
    await takeMic({ audio: true });
    expect(gum).toHaveBeenCalledTimes(2);
  });

  it("lets go as soon as the leader leaves the app", async () => {
    const { holdMic, takeMic } = await import("@/lib/voice/client");
    const s = await takeMic({ audio: true });
    holdMic(s);
    (document as unknown as { hidden: boolean }).hidden = true;
    listeners.visibilitychange!();
    expect(s.getAudioTracks()[0]!.readyState).toBe("ended");
    // And a conversation ending while the app is in the background doesn't hold it at all.
    const t = await takeMic({ audio: true });
    holdMic(t);
    expect(t.getAudioTracks()[0]!.readyState).toBe("ended");
  });
});
