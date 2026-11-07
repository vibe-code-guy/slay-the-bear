// The pure formulas of Slay the Bear. Each one has a twin in contracts/game/src/rules.rs and a
// row in fixtures/vectors.json, so the browser, the simulator, the verifier and the contract
// always agree to the last base unit. All math is integer, rounding down.

import { BPS, type GameConfig } from "./config";
import { beBytes, concat, readBe, sha256, utf8 } from "./bytes";
import { RECIPES } from "./items";

export enum Tactic {
  None = 0,
  Armor = 1,
  Rage = 2,
  Feint = 3,
}

export const TACTIC_NAMES: Record<Tactic, string> = {
  [Tactic.None]: "None",
  [Tactic.Armor]: "Armor",
  [Tactic.Rage]: "Rage",
  [Tactic.Feint]: "Feint",
};

export const TACTIC_EFFECTS: Record<Tactic, string> = {
  [Tactic.None]: "No trick this round.",
  [Tactic.Armor]: "The Bear has 20% more health this round.",
  [Tactic.Rage]: "If the Bear wins, it steals 50% more.",
  [Tactic.Feint]: "Late hits count half, for the kill and for the loot.",
};

export const min = (a: bigint, b: bigint) => (a < b ? a : b);
export const max = (a: bigint, b: bigint) => (a > b ? a : b);

/** Damage bonus in bps: earlyBonusMaxBps at the open, 10000 at the deadline. */
export function earlyBonusBps(openedAt: bigint, deadline: bigint, now: bigint, maxBps: bigint): bigint {
  if (now >= deadline) return BPS;
  const len = deadline - openedAt;
  if (len <= 0n) return BPS;
  const remaining = deadline - (now < openedAt ? openedAt : now);
  return BPS + ((maxBps - BPS) * remaining) / len;
}

/** A hit is late when it lands in the last `lateWindowBps` of the round. */
export function isLateHit(openedAt: bigint, deadline: bigint, now: bigint, lateWindowBps: bigint): boolean {
  const len = deadline - openedAt;
  return now >= deadline - (len * lateWindowBps) / BPS;
}

/** Damage of one hit: amount x weapon multiplier x early bonus, one rounding at the end. */
export function hitDamage(amount: bigint, weaponMultBps: bigint, bonusBps: bigint): bigint {
  return (amount * weaponMultBps * bonusBps) / (BPS * BPS);
}

/** Base health at the open: the adjusted target, capped by the player supply, never below the floor. */
export function baseHealth(c: GameConfig, playerSupply: bigint, target: bigint): bigint {
  return max(c.minHealth, min((playerSupply * c.healthBps) / BPS, target));
}

/** Difficulty adjustment applied at settlement. */
export function nextBaseTarget(c: GameConfig, base: bigint, townWon: boolean): bigint {
  return max(c.minHealth, (base * (townWon ? c.winGrowthBps : c.lossShrinkBps)) / BPS);
}

/**
 * Health at the open: base health plus a share of the hoard, capped by healthBps of the player
 * supply and by effortCapBps of the best recent raid, never below minHealth.
 */
export function bearHealth(c: GameConfig, base: bigint, hoard: bigint, playerSupply: bigint, peakRecentDamage: bigint): bigint {
  const raw = base + (hoard * c.hoardHealthBps) / BPS;
  const cap = min((playerSupply * c.healthBps) / BPS, (peakRecentDamage * c.effortCapBps) / BPS);
  return max(c.minHealth, min(raw, cap));
}

export function effectiveHealth(health: bigint, tactic: Tactic): bigint {
  return tactic === Tactic.Armor ? (health * 12_000n) / BPS : health;
}

/** Loot weight of a raider: early damage plus late damage (halved by Feint). */
export function weight(early: bigint, late: bigint, tactic: Tactic): bigint {
  return early + (tactic === Tactic.Feint ? late / 2n : late);
}

export function treasuryReward(c: GameConfig, treasury: bigint, base: bigint): bigint {
  return min((treasury * c.winCapBps) / BPS, (base * c.rewardMultBps) / BPS);
}

export function stealAmount(c: GameConfig, treasury: bigint, base: bigint, tactic: Tactic): bigint {
  let s = min((treasury * c.stealCapBps) / BPS, (base * c.stealMultBps) / BPS);
  if (tactic === Tactic.Rage) s = (s * 15_000n) / BPS;
  return min(s, treasury);
}

/** Share of a round's loot pool for one raider. */
export function lootShare(raiderWeight: bigint, totalWeight: bigint, pool: bigint): bigint {
  if (totalWeight === 0n) return 0n;
  return (raiderWeight * pool) / totalWeight;
}

export function marketFee(c: GameConfig, cost: bigint): bigint {
  return (cost * c.marketFeeBps) / BPS;
}

/** Price of one club charge from the smith. */
export function clubPrice(c: GameConfig, stock: bigint, bearWonLast: boolean): bigint {
  const t = c.smith.clubTargetStock;
  let p = (c.smith.clubPrice * 2n * t) / (stock + t);
  if (bearWonLast) p = (p * (BPS + c.smith.fearBps)) / BPS;
  return max(p, 1n);
}

/** What the smith pays for one unit of a material, falling as its own stock grows. */
export function materialPrice(c: GameConfig, tokenId: "wood" | "iron", stock: bigint): bigint {
  const basePrice = tokenId === "wood" ? c.smith.woodPrice : c.smith.ironPrice;
  const t = c.smith.materialTargetStock;
  return max((basePrice * t) / (stock + t), 1n);
}

/**
 * Club bundles the smith forges at a round open: none while its stock is at least half the
 * target, otherwise as many as its wood and $SLAY allow, up to the target.
 */
export function smithForgeBundles(c: GameConfig, stock: bigint, wood: bigint, balance: bigint): bigint {
  const t = c.smith.clubTargetStock;
  if (stock * 2n >= t) return 0n;
  const rec = RECIPES.club;
  const needed = (t - stock + rec.charges - 1n) / rec.charges;
  return min(min(wood / rec.wood, balance / rec.fee), needed);
}

// ---------- the Bear's mood and tactic ----------

/** What the Bear remembers of the last settled round. */
export interface MoodInput {
  totalEarly: bigint;
  totalLate: bigint;
  townWon: boolean;
  totalWeight: bigint;
  effectiveHealth: bigint;
}

/**
 * The Bear's favourite tactic for a round, fixed at the open from the last settled round:
 * Armor at the first raid; Feint if 35% or more of the last damage came late; Rage after a
 * Bear win; Armor after a narrow town win (less than 125% of its health); Rage otherwise.
 */
export function bearMood(last: MoodInput | null): Tactic {
  if (!last) return Tactic.Armor;
  const raw = last.totalEarly + last.totalLate;
  if (raw > 0n && (last.totalLate * 1000n) / raw >= 350n) return Tactic.Feint;
  if (!last.townWon) return Tactic.Rage;
  if (last.effectiveHealth === 0n || (last.totalWeight * 1000n) / last.effectiveHealth < 1250n) return Tactic.Armor;
  return Tactic.Rage;
}

/** Chance of each tactic [None, Armor, Rage, Feint] in bps; they always sum to 10000. */
export function moodWeights(mood: Tactic, moodBps: bigint): bigint[] {
  const other = (BPS - moodBps) / 3n;
  const w = [other, other, other, other];
  w[mood] = BPS - 3n * other;
  return w;
}

/** Draw index reserved for the tactic, so it never overlaps the item drops. */
export const TACTIC_DRAW = 0xffff_ffff;

/** The tactic drawn from the round randomness: a roll in [0, 10000) against the mood weights. */
export function drawTactic(randomness: Uint8Array, roundId: number, mood: Tactic, moodBps: bigint): { tactic: Tactic; roll: number } {
  const roll = readBe(drawBytes(randomness, roundId, TACTIC_DRAW), 0, 8) % BPS;
  const w = moodWeights(mood, moodBps);
  let cum = 0n;
  for (let t = 0; t < 4; t++) {
    cum += w[t]!;
    if (roll < cum) return { tactic: t as Tactic, roll: Number(roll) };
  }
  return { tactic: Tactic.Feint, roll: Number(roll) };
}

// ---------- hashes ----------

/**
 * Running hash of every hit in a round, in order. Layout (bytes):
 * prev(32) || account(utf8) || 0x00 || amount(16 BE) || damage(16 BE) || time ns(8 BE) || weapon(utf8)
 */
export function nextHitsChain(
  prev: Uint8Array,
  account: string,
  amount: bigint,
  damage: bigint,
  nowNs: bigint,
  weapon: string | null,
): Uint8Array {
  return sha256(
    concat(prev, utf8(account), new Uint8Array([0]), beBytes(amount, 16), beBytes(damage, 16), beBytes(nowNs, 8), utf8(weapon ?? "")),
  );
}

/** Round randomness in fallback mode: sha256(near seed || hits chain || round id). */
export function nearSeedRandomness(seed: Uint8Array, hitsChain: Uint8Array, roundId: number): Uint8Array {
  return sha256(concat(seed, hitsChain, beBytes(BigInt(roundId), 8)));
}

/** One independent draw from the round randomness. */
export function drawBytes(randomness: Uint8Array, roundId: number, index: number): Uint8Array {
  return sha256(concat(randomness, beBytes(BigInt(roundId), 8), beBytes(BigInt(index), 4)));
}

/** Maps a draw to a raider (weighted by loot weight) and an item roll in [0, 100). */
export function readDraw(draw: Uint8Array, totalWeight: bigint): { target: bigint; roll: number } {
  return { target: readBe(draw, 0, 16) % totalWeight, roll: Number(readBe(draw, 16, 8) % 100n) };
}

/** drand round that decides a game round whose deadline is `deadlineNs`. */
export function drandTargetRound(c: GameConfig, deadlineNs: bigint): bigint {
  const { genesisTime: g, period: p, marginRounds: m } = c.randomness;
  const deadlineSec = (deadlineNs + 999_999_999n) / 1_000_000_000n;
  const first = deadlineSec <= g ? 1n : (deadlineSec - g + p - 1n) / p + 1n;
  return first + m;
}
