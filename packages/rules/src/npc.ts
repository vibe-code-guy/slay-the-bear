// NPC rules: the one readable file behind every NPC decision.
//
// The Bear and the smith hold no keys. Their rules run inside the contract (bear_mood and
// smith_forge_bundles in contracts/game/src/rules.rs, bearMood and smithForgeBundles in
// math.ts); this file only explains them in words for the UI tooltips.
// Villagers are ordinary player accounts run by packages/agents. They can only make the moves
// any player can make, and the contract checks every one. villagerHit decides which move.

import { BPS, ONE, type GameConfig } from "./config";
import type { Game, Round } from "./engine";
import { RECIPES, type RecipeId } from "./items";
import {
  Tactic,
  TACTIC_NAMES,
  bearMood,
  effectiveHealth,
  max,
  min,
  moodWeights,
  smithForgeBundles,
  treasuryReward,
  type MoodInput,
} from "./math";

export interface Decision<T> {
  value: T;
  reason: string;
}

const pct = (num: bigint, den: bigint) => (den === 0n ? 0 : Number((num * 1000n) / den) / 10);

/** The Bear's mood for a round and why, in the Bear's words. */
export function explainBearMood(last: MoodInput | null): Decision<Tactic> {
  const mood = bearMood(last);
  if (!last) return { value: mood, reason: "First raid of the season. I feel like wearing my armor." };
  const raw = last.totalEarly + last.totalLate;
  const lateShare = pct(last.totalLate, raw);
  if (mood === Tactic.Feint) {
    return { value: mood, reason: `${lateShare}% of the damage last round came in the final minutes. I feel like a feint: late hits would count half.` };
  }
  if (!last.townWon) {
    return { value: mood, reason: "I won last round and I am hungry. I feel like raging: if I win again, I steal 50% more." };
  }
  const margin = pct(last.totalWeight, last.effectiveHealth);
  if (mood === Tactic.Armor) {
    return { value: mood, reason: `The town beat me by only ${(margin - 100).toFixed(1)}%. I feel like wearing armor: 20% more health.` };
  }
  return { value: mood, reason: `The town won easily (${margin}% of my health). I feel like raging, in case they get lazy.` };
}

/** "Armor 55%, None 15%, ..." for a mood. */
export function describeMood(mood: Tactic, c: GameConfig): { tactic: Tactic; name: string; chanceBps: number }[] {
  return moodWeights(mood, c.moodBps)
    .map((w, t) => ({ tactic: t as Tactic, name: TACTIC_NAMES[t as Tactic], chanceBps: Number(w) }))
    .sort((a, b) => b.chanceBps - a.chanceBps || a.tactic - b.tactic);
}

/** What the smith will do at the next round open, and why. */
export function smithRestock(game: Game): Decision<bigint> {
  const c = game.config;
  const smith = game.ids.smith;
  const stock = game.itemBal(smith, "club");
  const wood = game.itemBal(smith, "wood");
  const bundles = smithForgeBundles(c, stock, wood, game.bal(smith));
  const rec = RECIPES.club;
  if (stock * 2n >= c.smith.clubTargetStock) {
    return { value: 0n, reason: `I have ${stock} club charges. No need to forge.` };
  }
  if (bundles <= 0n) {
    return { value: 0n, reason: `Stock is low (${stock}) but I have only ${wood} wood. Sell me wood!` };
  }
  return { value: bundles, reason: `Stock is low (${stock}). At the next raid I forge ${bundles * rec.charges} club charges from ${bundles * rec.wood} wood.` };
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
  /** Health the town must beat if the Bear draws Armor: the worst case. */
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

// ---------- villagers between hits: forging, selling trophies, selling spare wood ----------

export type TradeMove =
  | { kind: "craft"; recipe: RecipeId; trophy: string | null }
  | { kind: "list"; token: string; qty: bigint; price: bigint }
  | { kind: "sell_to_smith"; token: "wood" | "iron"; qty: bigint };

export interface TradeView {
  balance: bigint;
  /** materials and weapon charges held, by token id */
  items: Map<string, bigint>;
  /** trophies held (a listed trophy sits with the market, not here) */
  trophies: string[];
}

/** What each villager asks for a Bear trophy at the market. */
export const TROPHY_PRICE: Record<Personality, bigint> = {
  brave: 350n * ONE,
  follower: 250n * ONE,
  sniper: 300n * ONE,
  saver: 400n * ONE,
};

export const TRADE_STYLE: Record<Personality, string> = {
  brave: "Forges every Bear trophy into a Bear-slayer once it has the iron; sells the spares.",
  follower: "Forges a sword or a club when its charges run out; sells its trophies.",
  sniper: "Forges a sword or a club when its charges run out; sells its trophies.",
  saver: "Sells its trophies at a high price and spare materials to the smith.",
};

/**
 * One move a villager makes with its loot, if any. It spends at most a fifth of its purse on a
 * forging fee, and only forges a weapon when the charges it has are nearly gone.
 */
export function villagerTrade(p: Personality, v: TradeView): Decision<TradeMove> | null {
  const have = (t: string) => v.items.get(t) ?? 0n;
  const affords = (fee: bigint) => fee * 5n <= v.balance;
  const low = (w: string) => have(w) <= 2n;
  const can = (id: RecipeId) => have("wood") >= RECIPES[id].wood && have("iron") >= RECIPES[id].iron && affords(RECIPES[id].fee);

  if (p === "brave" && v.trophies.length > 0 && low("slayer") && can("slayer")) {
    return { value: { kind: "craft", recipe: "slayer", trophy: v.trophies[0]! }, reason: "A Bear trophy and five iron: forging a Bear-slayer (×2 damage)." };
  }
  // the brave one keeps a trophy for its next Bear-slayer; everyone else sells theirs
  if (v.trophies.length > (p === "brave" ? 1 : 0)) {
    const price = TROPHY_PRICE[p];
    return { value: { kind: "list", token: v.trophies[v.trophies.length - 1]!, qty: 1n, price }, reason: `Selling a Bear trophy at the market for ${price / ONE} $SLAY.` };
  }
  if (p !== "saver" && low("slayer") && low("sword") && can("sword")) {
    return { value: { kind: "craft", recipe: "sword", trophy: null }, reason: "Out of charges: forging 10 sword charges (×1.5 damage)." };
  }
  if (p !== "saver" && low("slayer") && low("sword") && low("club") && can("club")) {
    return { value: { kind: "craft", recipe: "club", trophy: null }, reason: "Out of charges: forging 10 club charges (×1.25 damage)." };
  }
  // spare materials go to the smith, which forges clubs from wood
  if (have("wood") > 8n) return { value: { kind: "sell_to_smith", token: "wood", qty: have("wood") - 4n }, reason: "Selling spare wood to the smith." };
  if (have("iron") > 12n) return { value: { kind: "sell_to_smith", token: "iron", qty: have("iron") - 6n }, reason: "Selling spare iron to the smith." };
  return null;
}
