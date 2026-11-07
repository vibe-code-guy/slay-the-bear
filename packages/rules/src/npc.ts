// NPC rules: the one readable file behind every NPC decision.
//
// NPCs are NEAR accounts with their own balances. Their agents can only call the methods the
// contract allows each NPC (the Bear: commit and reveal; the smith: craft; villagers: the same
// moves as any player), and the contract checks every move. These functions decide *which*
// allowed move to make, and return a short reason that the UI shows in a tooltip.

import { BPS } from "./config";
import type { Game, Round } from "./engine";
import { Tactic, TACTIC_NAMES, effectiveHealth, max, min, treasuryReward } from "./math";
import { RECIPES } from "./items";

export interface Decision<T> {
  value: T;
  reason: string;
}

const pct = (num: bigint, den: bigint) => (den === 0n ? 0 : Number((num * 1000n) / den) / 10);

/** The Bear picks its tactic for the next round from what happened in the last one. */
export function chooseBearTactic(last: Round | null): Decision<Tactic> {
  if (!last || !last.settlement) {
    return { value: Tactic.Armor, reason: "First raid of the season. I put on my armor." };
  }
  const s = last.settlement;
  const raw = last.totalEarly + last.totalLate;
  const lateShare = pct(last.totalLate, raw);
  if (raw > 0n && lateShare >= 35) {
    return {
      value: Tactic.Feint,
      reason: `${lateShare}% of the damage last round came in the final minutes. Feint: late hits count half.`,
    };
  }
  if (s.outcome === "loss") {
    return { value: Tactic.Rage, reason: "I won last round and I am hungry. Rage: if I win again, I steal 50% more." };
  }
  const margin = pct(s.totalWeight, s.effectiveHealth);
  if (margin < 125) {
    return { value: Tactic.Armor, reason: `The town beat me by only ${(margin - 100).toFixed(1)}%. Armor: 20% more health.` };
  }
  return { value: Tactic.Rage, reason: `The town won easily (${margin}% of my health). Rage, in case they get lazy.` };
}

/** The smith restocks clubs when stock falls below half the target. */
export function smithRestock(game: Game): Decision<bigint> {
  const c = game.config.smith;
  const stock = game.itemBal(game.ids.smith, "club");
  if (stock * 2n >= c.clubTargetStock) {
    return { value: 0n, reason: `I have ${stock} club charges. No need to forge.` };
  }
  const wood = game.itemBal(game.ids.smith, "wood");
  const rec = RECIPES.club;
  const affordable = game.bal(game.ids.smith) / rec.fee;
  const needed = (c.clubTargetStock - stock + rec.charges - 1n) / rec.charges;
  const bundles = min(min(wood / rec.wood, affordable), needed);
  if (bundles <= 0n) {
    return { value: 0n, reason: `Stock is low (${stock}) but I have only ${wood} wood. I am buying wood.` };
  }
  return { value: bundles, reason: `Stock is low (${stock}). Forging ${bundles * rec.charges} club charges from ${bundles * rec.wood} wood.` };
}

export type Personality = "brave" | "follower" | "sniper" | "saver";

export const PERSONALITIES: Record<Personality, string> = {
  brave: "Hits early, when the reward is at least worth the Bear's health.",
  follower: "Joins once a third of the Bear's health is gone.",
  sniper: "Waits for the last tenth of the round, then finishes the Bear if it can.",
  saver: "Hits only when the reward is at least 1.4 times the Bear's health.",
};

export interface RaidView {
  balance: bigint;
  /** Health the town must beat if the Bear revealed Armor: the worst case. */
  worstHealth: bigint;
  damageSoFar: bigint;
  /** Share of the round elapsed, in bps. */
  elapsedBps: bigint;
  rewardEstimate: bigint;
  minHit: bigint;
  maxHit: bigint;
}

export function raidView(game: Game, r: Round, now: bigint, account: string): RaidView {
  const c = game.config;
  const elapsed = now <= r.openedAt ? 0n : ((now - r.openedAt) * BPS) / (r.deadline - r.openedAt);
  return {
    balance: game.bal(account),
    worstHealth: effectiveHealth(r.health, Tactic.Armor),
    damageSoFar: r.totalEarly + r.totalLate,
    elapsedBps: min(elapsed, BPS),
    rewardEstimate: game.bal(game.ids.bear) + treasuryReward(c, game.bal(game.ids.treasury), r.baseHealth),
    minHit: c.minHit,
    maxHit: c.maxHit,
  };
}

/** How much a villager (or simulated player) of a given personality hits right now, if at all. */
export function villagerHit(p: Personality, v: RaidView): Decision<bigint> | null {
  const roiBps = v.worstHealth === 0n ? 0n : (v.rewardEstimate * BPS) / v.worstHealth;
  const clamp = (x: bigint) => {
    const amt = min(min(x, v.maxHit), v.balance);
    return amt >= v.minHit ? amt : 0n;
  };
  // Nobody burns coins on a Bear that is already beaten, even with Armor.
  if (v.damageSoFar >= v.worstHealth) return null;
  // A big jackpot makes everyone bolder.
  const greed = roiBps >= 15_000n ? 2n : 1n;
  let amount = 0n;
  let reason = "";
  if (p === "brave" && v.elapsedBps < 3_000n && roiBps >= 10_000n) {
    amount = clamp((v.balance * 25n * greed) / 100n);
    reason = "Early hits earn up to 1.5x damage. Charging now.";
  } else if (p === "follower" && v.damageSoFar * 3n >= v.worstHealth && v.elapsedBps < 8_500n) {
    amount = clamp((v.balance * 25n * greed) / 100n);
    reason = "A third of the Bear's health is gone. Joining the raid.";
  } else if (p === "sniper" && v.elapsedBps >= 9_000n) {
    const left = max(v.worstHealth - v.damageSoFar, 0n);
    if (left > 0n && left <= (v.balance * 60n) / 100n) {
      amount = clamp(left);
      reason = "The Bear is nearly down. Finishing it.";
    }
  } else if (p === "saver" && roiBps >= 14_000n && v.elapsedBps < 6_000n) {
    amount = clamp((v.balance * 20n) / 100n);
    reason = `The reward is ${Number(roiBps) / 100}% of the Bear's health. Worth it.`;
  }
  return amount > 0n ? { value: amount, reason } : null;
}
