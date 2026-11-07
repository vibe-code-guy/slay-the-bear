// Every number that shapes the game. A config is fixed when the contract is initialised and
// can never change afterwards: the contract account keeps no access keys.
// The starting values here were chosen with `npm run simulate` (see docs/GAME_DESIGN.md).

import { QUICKNET } from "./drand";

/** $SLAY has 18 decimals. */
export const DECIMALS = 18;
export const ONE = 10n ** 18n;
export const BPS = 10_000n;
export const NS = 1_000_000_000n;

export type RandomnessMode = "drand" | "near-seed";

export interface SmithConfig {
  /** Price of one club charge, in base units, when the smith's stock equals the target. */
  clubPrice: bigint;
  clubTargetStock: bigint;
  /** What the smith pays per material when its own stock is empty. */
  woodPrice: bigint;
  ironPrice: bigint;
  materialTargetStock: bigint;
  /** Price surcharge on clubs right after the Bear wins a round. */
  fearBps: bigint;
  /** Share of every club sale that is burned; the rest is the smith's income. */
  burnShareBps: bigint;
  /** Starting stock and float, moved from the treasury at launch. */
  initialClubs: bigint;
  initialFloat: bigint;
}

export interface RandomnessConfig {
  mode: RandomnessMode;
  /** drand group public key (G2, compressed hex). */
  publicKey: string;
  genesisTime: bigint;
  period: bigint;
  /** Extra drand rounds after the deadline before the deciding round. */
  marginRounds: bigint;
}

export interface GameConfig {
  roundSecs: bigint;
  totalSupply: bigint;
  treasuryInit: bigint;
  reserveInit: bigint;
  /**
   * Difficulty adjustment: after a town win the next Bear's base health is winGrowthBps of this
   * one, after a Bear win it is lossShrinkBps. It never goes below minHealth or above
   * healthBps of the player supply. With +10% / -15% the town wins about 63% of raids at
   * equilibrium.
   */
  minHealth: bigint;
  healthBps: bigint;
  winGrowthBps: bigint;
  lossShrinkBps: bigint;
  /**
   * Share of the hoard that adds to the Bear's health. Below 100%, a losing streak makes the
   * jackpot grow faster than the Bear, so the town is always pulled back into the fight.
   */
  hoardHealthBps: bigint;
  /**
   * The Bear's health never exceeds effortCapBps of the best raw damage of the last
   * effortWindow settled rounds. A town that stops fighting meets a weak Bear guarding a big
   * jackpot, so the game cannot deadlock. At 1.0x the Bear never outgrows what the town has
   * recently shown it can do; at 2.0x the simulation found Bear streaks of up to 95 raids.
   */
  effortWindow: number;
  effortCapBps: bigint;
  /** On a win the treasury adds min(winCapBps of the treasury, rewardMultBps of base health). */
  rewardMultBps: bigint;
  winCapBps: bigint;
  /** On a loss the Bear takes min(stealCapBps of the treasury, stealMultBps of base health). */
  stealMultBps: bigint;
  stealCapBps: bigint;
  /** Damage bonus for a hit at the very start of a round, falling to 1.0x at the deadline. */
  earlyBonusMaxBps: bigint;
  /** Hits in this last share of a round count as late (Feint halves them). */
  lateWindowBps: bigint;
  minHit: bigint;
  maxHit: bigint;
  maxParticipants: number;
  maxHitsPerAccount: number;
  settleTip: bigint;
  pouchAmount: bigint;
  pouchesPerDay: number;
  dropDraws: number;
  /**
   * The Bear's tactic is drawn from the round's drand beacon at settlement. Its mood (the
   * favourite tactic, set at the open from the last round) gets this chance; the other three
   * tactics share the rest equally. Nobody, the deployer included, knows the tactic before the
   * deadline.
   */
  moodBps: bigint;
  marketFeeBps: bigint;
  smith: SmithConfig;
  randomness: RandomnessConfig;
}

const SUPPLY = 1_000_000_000n * ONE;
const RESERVE = 200_000_000n * ONE;
const SMITH_FLOAT = 1_000_000n * ONE;

function base(roundSecs: bigint, minHealth: bigint): GameConfig {
  return {
    roundSecs,
    totalSupply: SUPPLY,
    treasuryInit: SUPPLY - RESERVE,
    reserveInit: RESERVE,
    minHealth,
    healthBps: 2_500n,
    winGrowthBps: 11_000n,
    lossShrinkBps: 8_500n,
    hoardHealthBps: 5_000n,
    effortWindow: 6,
    effortCapBps: 10_000n,
    rewardMultBps: 15_000n,
    winCapBps: 50n,
    stealMultBps: 5_000n,
    stealCapBps: 100n,
    earlyBonusMaxBps: 15_000n,
    lateWindowBps: 1_000n,
    minHit: 1n * ONE,
    maxHit: 1_000n * ONE,
    maxParticipants: 300,
    maxHitsPerAccount: 50,
    settleTip: 5n * ONE,
    pouchAmount: 1_000n * ONE,
    pouchesPerDay: 200,
    dropDraws: 3,
    moodBps: 5_500n,
    marketFeeBps: 200n,
    smith: {
      clubPrice: 3n * ONE,
      clubTargetStock: 200n,
      woodPrice: 4n * ONE,
      ironPrice: 8n * ONE,
      materialTargetStock: 100n,
      fearBps: 2_000n,
      burnShareBps: 5_000n,
      initialClubs: 200n,
      initialFloat: SMITH_FLOAT,
    },
    randomness: {
      mode: "drand",
      publicKey: QUICKNET.publicKey,
      genesisTime: QUICKNET.genesisTime,
      period: QUICKNET.period,
      marginRounds: 2n,
    },
  };
}

/** Demo instance: 10-minute rounds so a judge can watch a whole raid, and win one alone. */
export const DEMO_CONFIG: GameConfig = base(600n, 500n * ONE);
/** The public town: 5-minute raids, so a visitor sees a whole raid in one sitting. */
export const QUICK_CONFIG: GameConfig = base(300n, 500n * ONE);
/** Season instance: one raid a day. */
export const SEASON_CONFIG: GameConfig = base(86_400n, 2_000n * ONE);

export function cloneConfig(c: GameConfig, patch: Partial<GameConfig> = {}): GameConfig {
  return {
    ...c,
    ...patch,
    smith: { ...c.smith, ...(patch.smith ?? {}) },
    randomness: { ...c.randomness, ...(patch.randomness ?? {}) },
  };
}

/** Plain-language description of a config, used by /rules and the README. */
export function describeConfig(c: GameConfig): Record<string, string> {
  const slay = (v: bigint) => `${(v / ONE).toLocaleString("en-US")} $SLAY`;
  const pct = (bps: bigint) => `${Number(bps) / 100}%`;
  return {
    "Round length": c.roundSecs >= 3_600n ? `${c.roundSecs / 3_600n} hours` : `${c.roundSecs / 60n} minutes`,
    "Total supply": slay(c.totalSupply),
    "Bear base health": `starts at ${slay(c.minHealth)}; ${pct(c.winGrowthBps - BPS)} more after each town win, ${pct(BPS - c.lossShrinkBps)} less after each Bear win; at most ${pct(c.healthBps)} of the player supply`,
    "Hoard and health": `${pct(c.hoardHealthBps)} of the Bear's hoard adds to its health; all of it goes to the raiders`,
    "Health cap": `at most ${pct(c.healthBps)} of the player supply and ${c.effortCapBps === BPS ? "the" : `${Number(c.effortCapBps) / 10_000}x the`} best raid of the last ${c.effortWindow} rounds`,
    "Win reward from the treasury": `${pct(c.rewardMultBps)} of base health, at most ${pct(c.winCapBps)} of the treasury`,
    "Bear's theft on a loss": `${pct(c.stealMultBps)} of base health, at most ${pct(c.stealCapBps)} of the treasury`,
    "Early-hit bonus": `${Number(c.earlyBonusMaxBps) / 10_000}x at the start of a round, 1x at the deadline`,
    "Late hits": `the last ${pct(c.lateWindowBps)} of a round`,
    "Hit size": `${slay(c.minHit)} to ${slay(c.maxHit)}`,
    "Starter pouch": `${slay(c.pouchAmount)}, at most ${c.pouchesPerDay} per day`,
    "Drops per won round": `${c.dropDraws}`,
    "Bear tactic": `drawn from the drand beacon at settlement: ${pct(c.moodBps)} its mood, ${pct((BPS - c.moodBps) / 3n)} each other tactic`,
    "Smith": `forges clubs at each round open when its stock is below ${c.smith.clubTargetStock / 2n} charges and it has wood`,
    "Market fee (burned)": pct(c.marketFeeBps),
    Randomness:
      c.randomness.mode === "drand"
        ? `drand round ${c.randomness.marginRounds} rounds after the deadline, verified on-chain`
        : "NEAR random seed from the settlement block (fallback mode)",
  };
}
