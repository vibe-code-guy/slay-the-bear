"use client";
// Background music, off until you turn it on: a short folk loop made in the browser with WebAudio
// (no audio files), a plucked lute over a drone in D dorian, with drums while a raid is on. The
// sound-effects mute silences it too.
import { isMuted, onMuteChange } from "./sfx";

type Mood = "town" | "raid";

const KEY_ON = "slay-music";
const KEY_VOL = "slay-music-volume";
const hasWindow = typeof window !== "undefined";
let on = hasWindow && localStorage.getItem(KEY_ON) === "1";
let volume = hasWindow ? Number(localStorage.getItem(KEY_VOL) ?? "0.5") || 0.5 : 0.5;
let mood: Mood = "town";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let drone: { stop: () => void } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextAt = 0;
let noise: AudioBuffer | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function musicState() {
  return { on, volume };
}

export function onMusicChange(f: () => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** Turn the music on or off (call from a click, so the browser lets it play). */
export function setMusic(next: boolean) {
  on = next;
  localStorage.setItem(KEY_ON, on ? "1" : "0");
  if (on) start();
  else stop();
  emit();
}

export function setMusicVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  localStorage.setItem(KEY_VOL, String(volume));
  applyGain();
  emit();
}

/** Drums come in while a raid is on. */
export function setMusicMood(m: Mood) {
  mood = m;
}

const level = () => (isMuted() ? 0 : volume * 0.22);

function applyGain() {
  if (ctx && master) master.gain.setTargetAtTime(on ? level() : 0, ctx.currentTime, 0.15);
}

if (hasWindow) {
  onMuteChange(applyGain);
  // music left on last time starts with the first click or key press (browsers need a gesture)
  if (on) {
    const kick = () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
      if (on) start();
    };
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
  }
}

function start() {
  if (timer) return;
  ctx ??= new AudioContext();
  void ctx.resume();
  if (!master) {
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  applyGain();
  drone = startDrone(ctx, master);
  nextAt = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 40);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  applyGain();
  const d = drone;
  drone = null;
  setTimeout(() => d?.stop(), 600);
}

// ---------- the tune ----------

const BPM = 96;
const EIGHTH = 60 / BPM / 2;
const N: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
  A3: 220.0, D3: 146.83, F3: 174.61, G3: 196.0, C3: 130.81,
};
// eight bars of eighths: the melody ("-" holds), then the bass note of each bar
const MELODY = [
  "D4 - F4 A4 G4 - F4 E4", "D4 - A3 - D4 E4 F4 -", "G4 - A4 C5 B4 - A4 G4", "A4 - - - E4 F4 G4 -",
  "D5 - C5 A4 B4 - G4 A4", "F4 - G4 A4 E4 - D4 C4", "D4 E4 F4 G4 A4 - C5 B4", "A4 - G4 E4 D4 - - -",
].flatMap((bar) => bar.split(" "));
const BASS = ["D3", "D3", "G3", "A3", "D3", "F3", "C3", "D3"];

function schedule() {
  if (!ctx || !master) return;
  while (nextAt < ctx.currentTime + 0.2) {
    const s = step % MELODY.length;
    const note = MELODY[s]!;
    if (note !== "-") pluck(ctx, master, N[note]!, nextAt, 0.16);
    if (s % 8 === 0) pluck(ctx, master, N[BASS[s / 8]!]!, nextAt, 0.2, 1.4);
    if (s % 8 === 4) pluck(ctx, master, N[BASS[(s - 4) / 8]!]! * 1.5, nextAt, 0.09, 0.9);
    if (mood === "raid") {
      if (s % 4 === 0) thump(ctx, master, nextAt);
      if (s % 4 === 2) tick(ctx, master, nextAt);
    }
    step += 1;
    nextAt += EIGHTH;
  }
}

/** A lute-like pluck: two detuned voices through a soft filter, a fast attack and a long tail. */
function pluck(c: AudioContext, out: AudioNode, f: number, at: number, gain: number, decay = 0.9) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2600, at);
  lp.frequency.exponentialRampToValueAtTime(700, at + decay * 0.6);
  lp.connect(g).connect(out);
  for (const [type, detune, amp] of [
    ["triangle", 0, 1],
    ["sawtooth", 7, 0.25],
  ] as const) {
    const o = c.createOscillator();
    const v = c.createGain();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    v.gain.value = amp;
    o.connect(v).connect(lp);
    o.start(at);
    o.stop(at + decay + 0.05);
  }
}

/** A low drum: a sine falling in pitch. */
function thump(c: AudioContext, out: AudioNode, at: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(110, at);
  o.frequency.exponentialRampToValueAtTime(45, at + 0.16);
  g.gain.setValueAtTime(0.5, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + 0.25);
}

/** A brushed tick between the drums: a burst of filtered noise. */
function tick(c: AudioContext, out: AudioNode, at: number) {
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.1), c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noise;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.12, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  s.connect(hp).connect(g).connect(out);
  s.start(at);
  s.stop(at + 0.08);
}

/** A quiet drone on D and A that breathes slowly. */
function startDrone(c: AudioContext, out: AudioNode) {
  const g = c.createGain();
  g.gain.value = 0.06;
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = 0.12;
  depth.gain.value = 0.025;
  lfo.connect(depth).connect(g.gain);
  g.connect(out);
  const oscs = [73.42, 110].map((f) => {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(g);
    o.start();
    return o;
  });
  lfo.start();
  return {
    stop() {
      oscs.forEach((o) => o.stop());
      lfo.stop();
      g.disconnect();
    },
  };
}
