// Numbers a client derives from the contract's views, always with the published rules: the
// phase of a raid, the win chance per tactic, the loot pool, a hit's damage before it is sent.
// Used by the web app and the CLI.
import { BPS, type GameConfig } from "./config";
import type { ParticipantJson, RoundJson, StatusJson } from "./contract";
import { WEAPON_MULT_BPS, type WeaponId } from "./items";
import {
  Tactic,
  baseHealth,
  bearHealth,
  earlyBonusBps,
  effectiveHealth,
  hitDamage,
  isLateHit,
  lootShare,
  moodWeights,
  treasuryReward,
  weight,
} from "./math";

export type Phase = "idle" | "open" | "ended" | "settled";

const b = (v: string) => BigInt(v);
const msToNs = (ms: number) => BigInt(Math.floor(ms)) * 1_000_000n;

export function phaseOf(round: RoundJson | null, nowMs: number): Phase {
  if (!round) return "idle";
  if (round.settlement) return "settled";
  return msToNs(nowMs) < b(round.deadline) ? "open" : "ended";
}

/** The health the next Bear will have if a round opened now. */
export function nextHealth(c: GameConfig, s: StatusJson): bigint {
  const supply = b(s.player_supply);
  const base = baseHealth(c, supply, b(s.next_base));
  return bearHealth(c, base, b(s.hoard), supply, b(s.peak_recent_damage));
}

export interface TacticOutcome {
  tactic: Tactic;
  chanceBps: number;
  weight: bigint;
  health: bigint;
  win: boolean;
}

/** For each tactic the beacon could draw: would the town win if the raid ended now? */
export function outcomes(c: GameConfig, r: RoundJson): TacticOutcome[] {
  const w = moodWeights(r.mood as Tactic, c.moodBps);
  return [Tactic.None, Tactic.Armor, Tactic.Rage, Tactic.Feint].map((t) => {
    const tw = weight(b(r.total_early), b(r.total_late), t);
    const h = effectiveHealth(b(r.health), t);
    return { tactic: t, chanceBps: Number(w[t]), weight: tw, health: h, win: r.participants > 0 && tw > 0n && tw >= h };
  });
}

export function winChanceBps(c: GameConfig, r: RoundJson): number {
  return outcomes(c, r).reduce((t, o) => t + (o.win ? o.chanceBps : 0), 0);
}

export function lootPool(c: GameConfig, s: StatusJson, r: RoundJson): bigint {
  return b(s.hoard) + treasuryReward(c, b(s.treasury), b(r.base_health));
}

export interface HitPreview {
  damage: bigint;
  bonusBps: bigint;
  late: boolean;
}

export function previewHit(c: GameConfig, r: RoundJson | null, nowMs: number, amount: bigint, weapon: string | null): HitPreview {
  const now = msToNs(nowMs);
  const opened = r && !r.settlement ? b(r.opened_at) : now;
  const deadline = r && !r.settlement ? b(r.deadline) : now + c.roundSecs * 1_000_000_000n;
  const bonus = earlyBonusBps(opened, deadline, now, c.earlyBonusMaxBps);
  const mult = weapon ? WEAPON_MULT_BPS[weapon as WeaponId] ?? BPS : BPS;
  return { damage: hitDamage(amount, mult, bonus), bonusBps: bonus, late: isLateHit(opened, deadline, now, c.lateWindowBps) };
}

/** Each raider's loot share if the round were won with the given tactic. */
export function shares(parts: ParticipantJson[], tactic: Tactic, pool: bigint): Map<string, bigint> {
  const ws = parts.map((p) => [p.account, weight(b(p.early), b(p.late), tactic)] as const);
  const total = ws.reduce((t, [, w]) => t + w, 0n);
  return new Map(ws.map(([a, w]) => [a, lootShare(w, total, pool)]));
}

export function lateStartsAtMs(c: GameConfig, r: RoundJson): number {
  const opened = Number(b(r.opened_at) / 1_000_000n);
  const deadline = Number(b(r.deadline) / 1_000_000n);
  return deadline - ((deadline - opened) * Number(c.lateWindowBps)) / 10_000;
}
