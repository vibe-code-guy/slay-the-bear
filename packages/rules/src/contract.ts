// Conversions between the TypeScript rules and the contract's JSON interface.

import type { GameConfig } from "./config";
import type { Game } from "./engine";
import { BASE_ITEMS } from "./items";

/** The `config` argument of the contract's `new()`. */
export function toContractConfig(c: GameConfig) {
  const s = (v: bigint) => v.toString();
  return {
    round_secs: Number(c.roundSecs),
    reveal_window_secs: Number(c.revealWindowSecs),
    total_supply: s(c.totalSupply),
    treasury_init: s(c.treasuryInit),
    reserve_init: s(c.reserveInit),
    min_health: s(c.minHealth),
    health_bps: Number(c.healthBps),
    win_growth_bps: Number(c.winGrowthBps),
    loss_shrink_bps: Number(c.lossShrinkBps),
    hoard_health_bps: Number(c.hoardHealthBps),
    effort_window: c.effortWindow,
    effort_cap_bps: Number(c.effortCapBps),
    reward_mult_bps: Number(c.rewardMultBps),
    win_cap_bps: Number(c.winCapBps),
    steal_mult_bps: Number(c.stealMultBps),
    steal_cap_bps: Number(c.stealCapBps),
    early_bonus_max_bps: Number(c.earlyBonusMaxBps),
    late_window_bps: Number(c.lateWindowBps),
    min_hit: s(c.minHit),
    max_hit: s(c.maxHit),
    max_participants: c.maxParticipants,
    max_hits_per_account: c.maxHitsPerAccount,
    settle_tip: s(c.settleTip),
    pouch_amount: s(c.pouchAmount),
    pouches_per_day: c.pouchesPerDay,
    drop_draws: c.dropDraws,
    no_reveal_penalty_bps: Number(c.noRevealPenaltyBps),
    market_fee_bps: Number(c.marketFeeBps),
    smith: {
      club_price: s(c.smith.clubPrice),
      club_target_stock: s(c.smith.clubTargetStock),
      wood_price: s(c.smith.woodPrice),
      iron_price: s(c.smith.ironPrice),
      material_target_stock: s(c.smith.materialTargetStock),
      fear_bps: Number(c.smith.fearBps),
      burn_share_bps: Number(c.smith.burnShareBps),
      initial_clubs: s(c.smith.initialClubs),
      initial_float: s(c.smith.initialFloat),
    },
    randomness: {
      mode: c.randomness.mode === "drand" ? "Drand" : "NearSeed",
      public_key: c.randomness.publicKey,
      genesis_time: Number(c.randomness.genesisTime),
      period: Number(c.randomness.period),
      margin_rounds: Number(c.randomness.marginRounds),
    },
  };
}

export type ContractConfig = ReturnType<typeof toContractConfig>;

/** Reads a contract config (from `get_config`) back into a GameConfig. */
export function fromContractConfig(j: ContractConfig): GameConfig {
  const b = (v: string | number) => BigInt(v);
  return {
    roundSecs: b(j.round_secs),
    revealWindowSecs: b(j.reveal_window_secs),
    totalSupply: b(j.total_supply),
    treasuryInit: b(j.treasury_init),
    reserveInit: b(j.reserve_init),
    minHealth: b(j.min_health),
    healthBps: b(j.health_bps),
    winGrowthBps: b(j.win_growth_bps),
    lossShrinkBps: b(j.loss_shrink_bps),
    hoardHealthBps: b(j.hoard_health_bps),
    effortWindow: j.effort_window,
    effortCapBps: b(j.effort_cap_bps),
    rewardMultBps: b(j.reward_mult_bps),
    winCapBps: b(j.win_cap_bps),
    stealMultBps: b(j.steal_mult_bps),
    stealCapBps: b(j.steal_cap_bps),
    earlyBonusMaxBps: b(j.early_bonus_max_bps),
    lateWindowBps: b(j.late_window_bps),
    minHit: b(j.min_hit),
    maxHit: b(j.max_hit),
    maxParticipants: j.max_participants,
    maxHitsPerAccount: j.max_hits_per_account,
    settleTip: b(j.settle_tip),
    pouchAmount: b(j.pouch_amount),
    pouchesPerDay: j.pouches_per_day,
    dropDraws: j.drop_draws,
    noRevealPenaltyBps: b(j.no_reveal_penalty_bps),
    marketFeeBps: b(j.market_fee_bps),
    smith: {
      clubPrice: b(j.smith.club_price),
      clubTargetStock: b(j.smith.club_target_stock),
      woodPrice: b(j.smith.wood_price),
      ironPrice: b(j.smith.iron_price),
      materialTargetStock: b(j.smith.material_target_stock),
      fearBps: b(j.smith.fear_bps),
      burnShareBps: b(j.smith.burn_share_bps),
      initialClubs: b(j.smith.initial_clubs),
      initialFloat: b(j.smith.initial_float),
    },
    randomness: {
      mode: j.randomness.mode === "Drand" ? "drand" : "near-seed",
      publicKey: j.randomness.public_key,
      genesisTime: b(j.randomness.genesis_time),
      period: b(j.randomness.period),
      marginRounds: b(j.randomness.margin_rounds),
    },
  };
}

/** The state snapshot the Rust replay test compares after every step. */
export function snapshot(g: Game, accounts: string[], roundId: number | null) {
  const balances: Record<string, string> = {};
  const items: Record<string, string> = {};
  for (const a of [...Object.values(g.ids), ...accounts]) {
    balances[a] = g.bal(a).toString();
    const owned = new Set<string>([...BASE_ITEMS, ...(g.items.get(a)?.keys() ?? [])]);
    for (const t of owned) items[`${a}|${t}`] = g.itemBal(a, t).toString();
  }
  const out: Record<string, unknown> = {
    total_supply: g.totalSupply.toString(),
    burned: g.burned.toString(),
    next_base: g.nextBase.toString(),
    balances,
    items,
  };
  const r = roundId !== null ? g.rounds.get(roundId) : undefined;
  if (r) {
    out.round = {
      id: r.id,
      health: r.health.toString(),
      total_early: r.totalEarly.toString(),
      total_late: r.totalLate.toString(),
      hits_chain: r.hitsChain,
      target_drand_round: r.targetDrandRound.toString(),
      settlement: r.settlement
        ? {
            outcome: r.settlement.outcome,
            tactic: r.settlement.tactic,
            reward: r.settlement.reward.toString(),
            steal: r.settlement.steal.toString(),
            penalty: r.settlement.penalty.toString(),
            total_weight: r.settlement.totalWeight.toString(),
            randomness: r.settlement.randomness,
            drops: r.settlement.drops.map((d) => `${d.account}:${d.tokenId}:${d.qty}`),
          }
        : null,
    };
  }
  return out;
}
