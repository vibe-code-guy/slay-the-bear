// Independent verification of a settled round from public data only: the contract's views and
// the drand beacon. Every check recomputes a value with the published rules and compares it to
// what the contract stored. The web app's /verify page and scripts/verify-game.ts use this.

import { BPS, type GameConfig } from "./config";
import { fromHex, sha256, toHex } from "./bytes";
import { roundTime, verifyBeacon } from "./drand";
import { dropForRoll } from "./items";
import {
  Tactic,
  TACTIC_NAMES,
  baseHealth,
  bearHealth,
  bearMood,
  drandTargetRound,
  drawBytes,
  drawTactic,
  effectiveHealth,
  lootShare,
  nextBaseTarget,
  nextHitsChain,
  readDraw,
  weight,
  type MoodInput,
} from "./math";
import type { ParticipantJson, RoundJson } from "./contract";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Share {
  account: string;
  weight: bigint;
  share: bigint;
}

export interface RoundVerification {
  round: number;
  ok: boolean;
  checks: Check[];
  shares: Share[];
}

/** One hit as logged in the contract's `hit` event, for replaying the hits chain. */
export interface HitEvent {
  account: string;
  amount: bigint;
  damage: bigint;
  weapon: string | null;
  atNs: bigint;
}

const b = (v: string) => BigInt(v);

export function moodInputOf(r: RoundJson): MoodInput | null {
  if (!r.settlement) return null;
  return {
    totalEarly: b(r.total_early),
    totalLate: b(r.total_late),
    townWon: r.settlement.outcome === "win",
    totalWeight: b(r.settlement.total_weight),
    effectiveHealth: b(r.settlement.effective_health),
  };
}

/**
 * Verifies one round.
 * @param history the settled rounds before this one, newest first (at least config.effortWindow
 *   of them, or all of them for an early round). Without it the mood and health checks are skipped.
 * @param hits the round's hit events in order, if known; enables the hits-chain check.
 */
export function verifyRound(
  config: GameConfig,
  round: RoundJson,
  participants: ParticipantJson[],
  history: RoundJson[] | null = null,
  hits: HitEvent[] | null = null,
): RoundVerification {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const deadlineNs = b(round.deadline);
  const target = b(round.target_drand_round);

  // The deciding beacon was fixed at the open and published only after the deadline.
  const expectTarget = drandTargetRound(config, deadlineNs);
  const publishedAt = roundTime(target, config.randomness.genesisTime, config.randomness.period);
  const firstAfter = roundTime(target - config.randomness.marginRounds, config.randomness.genesisTime, config.randomness.period);
  add(
    "Deciding drand round fixed at the open",
    target === expectTarget && firstAfter * 1_000_000_000n >= deadlineNs,
    `round ${target}, published ${Number(publishedAt - deadlineNs / 1_000_000_000n)} s after the deadline, so nobody could know it while hits were allowed`,
  );

  // Participants add up to the round totals.
  let early = 0n;
  let late = 0n;
  for (const p of participants) {
    early += b(p.early);
    late += b(p.late);
  }
  add(
    "Raiders' damage adds up",
    participants.length === round.participants && early === b(round.total_early) && late === b(round.total_late),
    `${participants.length} raiders, ${early} early + ${late} late damage (base units)`,
  );

  if (hits) {
    let chain = new Uint8Array(32);
    for (const h of hits) chain = nextHitsChain(chain, h.account, h.amount, h.damage, h.atNs, h.weapon) as Uint8Array<ArrayBuffer>;
    add("Hits chain matches the logged hits", toHex(chain) === round.hits_chain && hits.length === round.hits, `${hits.length} hits replayed`);
  }

  if (history) {
    const prev = history[0] ?? null;
    if (prev && prev.id !== round.id - 1) throw new Error("history must start with the previous round");
    const mood = bearMood(prev ? moodInputOf(prev) : null);
    add("Bear's mood follows the last round", mood === round.mood, `${TACTIC_NAMES[mood as Tactic]} by the published rule`);
    const target = prev ? nextBaseTarget(config, b(prev.base_health), prev.settlement?.outcome === "win") : config.minHealth;
    const base = baseHealth(config, b(round.supply_at_open), target);
    const window = history.slice(0, config.effortWindow);
    const peak = window.reduce((m, r) => {
      const d = b(r.total_early) + b(r.total_late);
      return d > m ? d : m;
    }, 0n);
    const enough = history.length >= Math.min(config.effortWindow, round.id - 1);
    const health = bearHealth(config, base, b(round.hoard_at_open), b(round.supply_at_open), peak);
    add(
      "Bear's health follows the rules",
      enough && base === b(round.base_health) && health === b(round.health),
      enough ? `base ${base}, health ${health}` : "not enough history to check",
    );
  }

  const s = round.settlement;
  if (!s) {
    add("Settled", false, "the round is not settled yet");
    return { round: round.id, ok: false, checks, shares: [] };
  }

  let randomness: Uint8Array;
  if (config.randomness.mode === "drand") {
    const sig = s.beacon_signature ?? "";
    add("Beacon is the one fixed at the open", s.beacon_round !== null && b(s.beacon_round) === target, `drand round ${s.beacon_round}`);
    add(
      "drand signature is valid",
      verifyBeacon(target, sig, config.randomness.publicKey),
      "BLS12-381 check against the quicknet group key, the same check the contract ran on-chain",
    );
    randomness = sha256(fromHex(sig));
    add("Randomness is sha256(signature)", toHex(randomness) === s.randomness, s.randomness);
  } else {
    randomness = fromHex(s.randomness);
    add("Randomness (NEAR seed fallback)", true, "derived from the settlement block's random seed; not independently checkable");
  }

  const drawn = drawTactic(randomness, round.id, round.mood as Tactic, config.moodBps);
  add(
    "Tactic drawn from the beacon",
    drawn.tactic === s.tactic && drawn.roll === s.tactic_roll,
    `roll ${drawn.roll} of 10000 against mood weights ${round.mood_weights.join("/")}: ${TACTIC_NAMES[drawn.tactic]}`,
  );
  const tactic = s.tactic as Tactic;

  const weights = participants.map((p) => ({ account: p.account, w: weight(b(p.early), b(p.late), tactic) }));
  const totalWeight = weights.reduce((t, x) => t + x.w, 0n);
  add("Total weight", totalWeight === b(s.total_weight), `${totalWeight}${tactic === Tactic.Feint ? " (late hits halved by Feint)" : ""}`);
  const eff = effectiveHealth(b(round.health), tactic);
  add("Effective health", eff === b(s.effective_health), `${eff}${tactic === Tactic.Armor ? " (Armor: +20%)" : ""}`);
  const win = participants.length > 0 && totalWeight > 0n && totalWeight >= eff;
  add("Outcome", (win ? "win" : "loss") === s.outcome, win ? "the town dealt at least the Bear's health" : "the town fell short");

  const shares: Share[] = [];
  if (win) {
    const fromTreasury = b(s.reward) - b(round.hoard_at_open);
    const max = (b(round.base_health) * config.rewardMultBps) / BPS;
    add("Reward", fromTreasury >= 0n && fromTreasury <= max, `hoard ${round.hoard_at_open} + ${fromTreasury} from the treasury (at most ${max})`);
    const drops = [];
    for (let i = 0; i < config.dropDraws; i++) {
      const { target: t, roll } = readDraw(drawBytes(randomness, round.id, i), totalWeight);
      let cum = 0n;
      let winner = weights[weights.length - 1]!.account;
      for (const x of weights) {
        cum += x.w;
        if (cum > t) {
          winner = x.account;
          break;
        }
      }
      const d = dropForRoll(roll, round.id, i);
      drops.push(`${winner}:${d.tokenId}:${d.qty}`);
    }
    const stored = s.drops.map((d) => `${d.account}:${d.token_id}:${d.qty}`);
    add("Drops", drops.join("|") === stored.join("|"), drops.join(", "));
    for (const x of weights) shares.push({ account: x.account, weight: x.w, share: lootShare(x.w, totalWeight, b(s.reward)) });
  } else {
    let max = (b(round.base_health) * config.stealMultBps) / BPS;
    if (tactic === Tactic.Rage) max = (max * 15_000n) / BPS;
    add("Bear's theft", b(s.steal) <= max, `${s.steal} (at most ${max}${tactic === Tactic.Rage ? ", Rage: +50%" : ""})`);
    add("No drops on a loss", s.drops.length === 0, "the Bear keeps its loot");
  }
  return { round: round.id, ok: checks.every((c) => c.ok), checks, shares };
}
