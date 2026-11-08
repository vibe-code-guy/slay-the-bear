// What a Bear trophy looks like. Each trophy is a 1-of-1 NEP-245 token, `trophy-<raid>-<drop>`,
// dropped by a raid's drand beacon. Its look comes from that same beacon: the traits below are
// read from sha256(randomness || "slay-trophy" || raid || drop), where `randomness` is the
// settlement's on-chain randomness (sha256 of drand's signature). Anyone can recompute them, and
// no one, the deployer included, could pick a trophy's look. The look is cosmetic: on-chain, all
// trophies are equal.
import { beBytes, concat, fromHex, sha256, utf8 } from "@slay/rules";

export const TROPHY_KINDS = ["Claw", "Fang", "Pelt", "Paw", "Skull"] as const;
export type TrophyKind = (typeof TROPHY_KINDS)[number];

/** Dark, main and light colour of each element. */
export const ELEMENTS = [
  { name: "Blood", dark: "#450a0a", main: "#ef4444", light: "#fecaca" },
  { name: "Frost", dark: "#082f49", main: "#38bdf8", light: "#e0f2fe" },
  { name: "Ember", dark: "#431407", main: "#f97316", light: "#ffedd5" },
  { name: "Storm", dark: "#2e1065", main: "#a855f7", light: "#f3e8ff" },
  { name: "Gilded", dark: "#422006", main: "#facc15", light: "#fef9c3" },
  { name: "Shadow", dark: "#030712", main: "#64748b", light: "#e2e8f0" },
  { name: "Moss", dark: "#052e16", main: "#22c55e", light: "#dcfce7" },
] as const;
export type Element = (typeof ELEMENTS)[number];

export type Grade = "Bronze" | "Silver" | "Gold" | "Mythic";
export const GRADE_COLOR: Record<Grade, string> = { Bronze: "#c2763a", Silver: "#cbd5e1", Gold: "#facc15", Mythic: "#f0abfc" };

export interface TrophyTraits {
  id: string;
  round: number;
  draw: number;
  kind: TrophyKind;
  element: Element;
  grade: Grade;
  pattern: "runes" | "stripes" | "gems";
  marks: number;
  tilt: number;
  name: string;
  /** "drand" when derived from the raid's randomness; "id" if that raid is not loaded yet. */
  source: "drand" | "id";
  /** The 32 bytes the traits were read from, hex. */
  seed: string;
}

export function parseTrophyId(id: string): { round: number; draw: number } | null {
  const m = id.match(/^trophy-(\d+)-(\d+)$/);
  return m ? { round: Number(m[1]), draw: Number(m[2]) } : null;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function trophyTraits(id: string, randomnessHex?: string | null): TrophyTraits {
  const p = parseTrophyId(id) ?? { round: 0, draw: 0 };
  const base = randomnessHex ? fromHex(randomnessHex) : utf8(id);
  const seed = sha256(concat(base, utf8("slay-trophy"), beBytes(BigInt(p.round), 4), beBytes(BigInt(p.draw), 4)));
  const kind = TROPHY_KINDS[seed[0]! % TROPHY_KINDS.length]!;
  const element = ELEMENTS[seed[1]! % ELEMENTS.length]!;
  // 50% bronze, 30% silver, 15% gold, 5% mythic
  const g = seed[2]!;
  const grade: Grade = g < 128 ? "Bronze" : g < 205 ? "Silver" : g < 243 ? "Gold" : "Mythic";
  const pattern = (["runes", "stripes", "gems"] as const)[seed[3]! % 3]!;
  const marks = 2 + (seed[4]! % 4);
  const tilt = ((seed[5]! / 255) * 2 - 1) * 14;
  const name = `${grade === "Mythic" ? "Ancient " : ""}${element.name} ${kind}`;
  return { id, ...p, kind, element, grade, pattern, marks, tilt, name, source: randomnessHex ? "drand" : "id", seed: toHex(seed) };
}
