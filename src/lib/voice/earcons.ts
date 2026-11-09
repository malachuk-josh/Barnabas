"use client";

/**
 * Short chimes that tell the leader the microphone just turned on or off: two soft notes, rising for on
 * and falling for off. Synthesized with Web Audio (no sound files), on one shared AudioContext that a tap
 * unlocks, so they play on phones too.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx || ctx.state === "closed") ctx = new Ctor();
  return ctx;
}

/** Call from a tap, before anything async, so phones allow the chimes. */
export function unlockEarcons() {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

function note(c: AudioContext, freq: number, start: number, length: number, peak: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);
  // Soft attack and a gentle fade, so it's a chime rather than a beep.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** "on": the microphone is listening. "off": it stopped. */
export function playEarcon(kind: "on" | "off") {
  const c = context();
  if (!c) return;
  const play = () => {
    const t = c.currentTime + 0.01;
    const [first, second] = kind === "on" ? [659.25, 987.77] : [987.77, 659.25]; // E5 and B5
    note(c, first, t, 0.16, 0.16);
    note(c, second, t + 0.09, 0.22, 0.16);
  };
  if (c.state === "suspended") void c.resume().then(play, () => {});
  else play();
}
