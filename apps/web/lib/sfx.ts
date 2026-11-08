"use client";
// Sound effects synthesised in the browser with ZzFX: no audio files. The library creates an
// AudioContext when it loads, so it is imported lazily on the first user gesture (browsers keep
// audio suspended until then anyway).

type Zzfx = typeof import("zzfx");

const SOUNDS = {
  swing: [0.5, 0.05, 420, 0.01, 0.03, 0.14, 4, 0, -24, , , , , 6, , , , 0.5, 0.04],
  hit: [1.3, 0.05, 160, 0.005, 0.03, 0.22, 4, 1.6, -3, , , , , 2.5, , 0.25, , 0.55, 0.06],
  crit: [1.6, 0.05, 110, 0.005, 0.06, 0.4, 4, 1.4, -2, , , , , 3, 2, 0.4, , 0.5, 0.08],
  coin: [0.8, 0.02, 1675, , 0.06, 0.24, 1, 1.82, , , 837, 0.06],
  bell: [1.2, 0, 880, 0.005, 0.25, 1.4, 0, 1, , , , , , , , , 0.18, 0.45, 0.12],
  drum: [1.4, 0, 62, 0.004, 0.01, 0.22, 0, 2, -2, , , , , 1, , , , 0.6, 0.02],
  roar: [1.6, 0.1, 85, 0.06, 0.45, 0.7, 2, 1.3, -0.6, , , , , 2.2, 6, 0.12, , 0.75, 0.12, 0.3],
  tick: [0.35, 0, 1900, , 0.004, 0.02, 1],
  blip: [0.25, 0, 440, , 0.02, 0.05, 1],
  miss: [0.6, 0, 220, 0.01, 0.05, 0.25, 2, 1, -6],
  lose: [1, 0, 330, 0.02, 0.25, 0.7, 2, 1, -3.5, , , , , , , 0.1, , 0.5],
} as const satisfies Record<string, readonly (number | undefined)[]>;

export type SoundName = keyof typeof SOUNDS | "fanfare" | "charge";

let lib: Zzfx | null = null;
let loading: Promise<Zzfx | null> | null = null;
let muted = typeof window !== "undefined" && localStorage.getItem("slay-muted") === "1";
const listeners = new Set<(m: boolean) => void>();

async function load(): Promise<Zzfx | null> {
  if (lib) return lib;
  loading ??= import("zzfx")
    .then((m) => {
      lib = m;
      m.ZZFX.volume = 0.28;
      return m;
    })
    .catch(() => null);
  return loading;
}

/** Call from a user gesture: loads the synth and wakes the audio context. */
export async function unlockAudio() {
  const m = await load();
  if (m && m.ZZFX.audioContext.state === "suspended") await m.ZZFX.audioContext.resume().catch(() => undefined);
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem("slay-muted", m ? "1" : "0");
  listeners.forEach((f) => f(m));
}

export function onMuteChange(f: (m: boolean) => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** Plays a sound if audio is unlocked and not muted. `pitch` scales the frequency. */
export function play(name: SoundName, pitch = 1) {
  if (muted || !lib || lib.ZZFX.audioContext.state !== "running") return;
  const z = lib.zzfx;
  if (name === "fanfare") {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => z(0.7, 0, f, 0.01, 0.12, 0.25, 1, 1.4), i * 130));
    setTimeout(() => z(...[0.8, 0, 1047, 0.01, 0.35, 0.6, 1, 1.2, , , , , , , , , 0.1, 0.6]), 4 * 130);
    return;
  }
  if (name === "charge") {
    z(0.18, 0, 300 * pitch, 0, 0.015, 0.04, 1);
    return;
  }
  const p = [...SOUNDS[name]] as (number | undefined)[];
  if (pitch !== 1) p[2] = (p[2] ?? 220) * pitch;
  z(...p);
}
