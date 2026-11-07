import { describe, expect, it } from "vitest";
import { DEMO_CONFIG, NS, ONE } from "../src/config";
import {
  Tactic,
  baseHealth,
  bearHealth,
  clubPrice,
  drandTargetRound,
  drawBytes,
  earlyBonusBps,
  effectiveHealth,
  hitDamage,
  isLateHit,
  lootShare,
  materialPrice,
  nextBaseTarget,
  readDraw,
  stealAmount,
  treasuryReward,
  weight,
  moodWeights,
  drawTactic,
  bearMood,
  smithForgeBundles,
} from "../src/math";
import { roundTime } from "../src/drand";
import { beBytes, sha256 } from "../src/bytes";

const c = DEMO_CONFIG;

describe("formulas", () => {
  it("early bonus falls from the max to 1x", () => {
    const o = 1_000n * NS;
    const d = o + 600n * NS;
    expect(earlyBonusBps(o, d, o, 15_000n)).toBe(15_000n);
    expect(earlyBonusBps(o, d, o + 300n * NS, 15_000n)).toBe(12_500n);
    expect(earlyBonusBps(o, d, d, 15_000n)).toBe(10_000n);
    expect(earlyBonusBps(o, d, d + NS, 15_000n)).toBe(10_000n);
  });

  it("late window is the last 10%", () => {
    const o = 0n;
    const d = 600n * NS;
    expect(isLateHit(o, d, 539n * NS, 1_000n)).toBe(false);
    expect(isLateHit(o, d, 540n * NS, 1_000n)).toBe(true);
  });

  it("damage rounds once", () => {
    expect(hitDamage(100n * ONE, 15_000n, 15_000n)).toBe(225n * ONE);
    expect(hitDamage(3n, 12_500n, 10_000n)).toBe(3n);
  });

  it("base health follows the difficulty target, within a floor and a cap", () => {
    const supply = 1_000_000n * ONE;
    const cap = (supply * c.healthBps) / 10_000n;
    expect(baseHealth(c, 0n, 0n)).toBe(c.minHealth);
    expect(baseHealth(c, supply, 10_000_000n * ONE)).toBe(cap);
    expect(baseHealth(c, supply, 1_200n * ONE)).toBe(1_200n * ONE);
    expect(nextBaseTarget(c, 1_000n * ONE, true)).toBe(1_100n * ONE);
    expect(nextBaseTarget(c, 1_000n * ONE, false)).toBe(850n * ONE);
    expect(nextBaseTarget(c, c.minHealth, false)).toBe(c.minHealth);
    // half the hoard adds to health, capped by the player supply and recent effort, never below the floor
    const big = 10_000_000n * ONE;
    expect(bearHealth(c, 1_000n * ONE, 400n * ONE, supply, big)).toBe(1_200n * ONE);
    expect(bearHealth(c, 1_000n * ONE, big, supply, big)).toBe(cap);
    expect(bearHealth(c, 1_000n * ONE, big, supply, 3_000n * ONE)).toBe(6_000n * ONE);
    expect(bearHealth(c, 1_000n * ONE, 400n * ONE, 0n, big)).toBe(c.minHealth);
    expect(bearHealth(c, 1_000n * ONE, 400n * ONE, supply, 0n)).toBe(c.minHealth);
  });

  it("tactics change health and weights", () => {
    expect(effectiveHealth(1000n, Tactic.Armor)).toBe(1200n);
    expect(effectiveHealth(1000n, Tactic.Rage)).toBe(1000n);
    expect(weight(100n, 51n, Tactic.Feint)).toBe(125n);
    expect(weight(100n, 51n, Tactic.None)).toBe(151n);
  });

  it("reward and theft are capped by the treasury", () => {
    expect(treasuryReward(c, 1_000_000n, 1_000n)).toBe(1_500n);
    expect(treasuryReward(c, 100_000n, 1_000n)).toBe(500n);
    expect(stealAmount(c, 1_000_000n, 1_000n, Tactic.None)).toBe(500n);
    expect(stealAmount(c, 1_000_000n, 1_000n, Tactic.Rage)).toBe(750n);
    expect(stealAmount(c, 10_000n, 1_000n, Tactic.Rage)).toBe(150n);
  });

  it("loot shares never exceed the pool", () => {
    const pool = 1_000_003n;
    const shares = [lootShare(1n, 3n, pool), lootShare(1n, 3n, pool), lootShare(1n, 3n, pool)];
    expect(shares.reduce((a, b) => a + b, 0n)).toBeLessThanOrEqual(pool);
    expect(lootShare(5n, 0n, pool)).toBe(0n);
  });

  it("smith prices follow stock", () => {
    expect(clubPrice(c, c.smith.clubTargetStock, false)).toBe(c.smith.clubPrice);
    expect(clubPrice(c, 0n, false)).toBe(2n * c.smith.clubPrice);
    expect(clubPrice(c, c.smith.clubTargetStock, true)).toBe((c.smith.clubPrice * 12_000n) / 10_000n);
    expect(materialPrice(c, "wood", 0n)).toBe(c.smith.woodPrice);
    expect(materialPrice(c, "wood", c.smith.materialTargetStock)).toBe(c.smith.woodPrice / 2n);
  });

  it("draws are deterministic and in range", () => {
    const rnd = new Uint8Array(32).fill(7);
    const a = drawBytes(rnd, 5, 0);
    const b = drawBytes(rnd, 5, 0);
    const z = drawBytes(rnd, 5, 1);
    expect(a).toEqual(b);
    expect(a).not.toEqual(z);
    const { target, roll } = readDraw(a, 1000n);
    expect(target < 1000n && roll >= 0 && roll < 100).toBe(true);
  });

  it("mood weights favour the mood and sum to 100%", () => {
    for (const mood of [Tactic.None, Tactic.Armor, Tactic.Rage, Tactic.Feint]) {
      const w = moodWeights(mood, c.moodBps);
      expect(w.reduce((a, b) => a + b, 0n)).toBe(10_000n);
      expect(w[mood]).toBe(c.moodBps);
    }
  });

  it("tactic draws follow the mood weights", () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) counts[drawTactic(sha256(beBytes(BigInt(i), 8)), 1, Tactic.Feint, c.moodBps).tactic]! += 1;
    expect(counts[Tactic.Feint]! / 4000).toBeGreaterThan(0.52);
    expect(counts[Tactic.Feint]! / 4000).toBeLessThan(0.58);
    for (const t of [Tactic.None, Tactic.Armor, Tactic.Rage]) expect(counts[t]! / 4000).toBeGreaterThan(0.12);
  });

  it("the Bear's mood follows the last round", () => {
    const base = { totalEarly: 1000n, totalLate: 0n, townWon: true, totalWeight: 2000n, effectiveHealth: 1000n };
    expect(bearMood(null)).toBe(Tactic.Armor);
    expect(bearMood({ ...base, totalEarly: 650n, totalLate: 350n })).toBe(Tactic.Feint);
    expect(bearMood({ ...base, totalEarly: 651n, totalLate: 349n })).toBe(Tactic.Rage);
    expect(bearMood({ ...base, townWon: false })).toBe(Tactic.Rage);
    expect(bearMood({ ...base, totalWeight: 1249n })).toBe(Tactic.Armor);
    expect(bearMood({ ...base, totalWeight: 1250n })).toBe(Tactic.Rage);
  });

  it("the smith forges only when stock is below half the target", () => {
    expect(smithForgeBundles(c, 100n, 50n, 1_000n * ONE)).toBe(0n);
    expect(smithForgeBundles(c, 99n, 50n, 1_000n * ONE)).toBe(11n);
    expect(smithForgeBundles(c, 0n, 7n, 1_000n * ONE)).toBe(3n);
    expect(smithForgeBundles(c, 0n, 50n, 25n * ONE)).toBe(2n);
  });

  it("the deciding drand round is published after the deadline", () => {
    const deadlineNs = (c.randomness.genesisTime + 10_000n) * NS + 1n;
    const t = drandTargetRound(c, deadlineNs);
    expect(roundTime(t - c.randomness.marginRounds) * NS).toBeGreaterThanOrEqual(deadlineNs);
  });
});
