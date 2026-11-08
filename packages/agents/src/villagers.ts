// Villagers: NPC raiders with ordinary player accounts. Each follows one personality from
// packages/rules/src/npc.ts (villagerHit), so a quiet town still has someone fighting. They
// claim a starter pouch like anyone, hit with their own $SLAY, and claim their own loot.

import { teraToGas, type Account } from "near-api-js";
import {
  BPS,
  ONE,
  Tactic,
  effectiveHealth,
  min,
  treasuryReward,
  villagerHit,
  type Personality,
  type PlayerJson,
  type RaidView,
} from "@slay/rules";
import { errorCode, nsToMs, type GameClient } from "./client";
import { txHashOf, type TickLog } from "./keeper";

export interface Villager {
  name: string;
  personality: Personality;
  account: Account;
}

/** The four villagers of the demo town and the personality each one plays. */
export const VILLAGERS: { prefix: string; name: string; personality: Personality }[] = [
  { prefix: "bjorn", name: "Bjorn the Brave", personality: "brave" },
  { prefix: "fern", name: "Fern the Follower", personality: "follower" },
  { prefix: "sid", name: "Sid the Sniper", personality: "sniper" },
  { prefix: "sara", name: "Sara the Saver", personality: "saver" },
];

/** Hits per villager per round, to keep a quiet town cheap. */
const MAX_HITS_PER_ROUND = 2;

async function call(v: Villager, client: GameClient, methodName: string, args: Record<string, unknown>) {
  return v.account.callFunctionRaw({ contractId: client.contractId, methodName, args, gas: teraToGas(30) });
}

export async function villagerTick(
  client: GameClient,
  villagers: Villager[],
  opts: { openIfIdle?: boolean; nowMs?: number } = {},
): Promise<TickLog[]> {
  const logs: TickLog[] = [];
  const nowMs = opts.nowMs ?? Date.now();
  const config = await client.config();
  const status = await client.status();

  // Claim pouches and any unclaimed loot from the last won round. The raiders of that round come
  // in one read rather than one per villager (public RPCs rate-limit bursts of reads).
  const last = status.current_round === null ? status.next_round_id - 1 : status.current_round - 1;
  const lastRound = last >= 1 ? await client.round(last) : null;
  const lastParts = lastRound?.settlement?.outcome === "win" ? new Map((await client.participants(lastRound.id)).map((p) => [p.account, p])) : null;
  /** Balances still current after this loop, to reuse when deciding the hits. */
  const players = new Map<string, PlayerJson>();
  for (const v of villagers) {
    const id = v.account.accountId;
    const p = await client.player(id);
    let moved = false;
    if (!p.pouch_claimed) {
      try {
        const res = await call(v, client, "claim_pouch", {});
        moved = true;
        logs.push({ agent: v.name, message: "claimed a starter pouch", tx: txHashOf(res) });
      } catch (e) {
        logs.push({ agent: v.name, message: `no pouch: ${errorCode(e)}` });
      }
    }
    const part = lastRound && lastParts?.get(id);
    if (lastRound && part && !part.claimed) {
      try {
        const res = await call(v, client, "claim", { round_id: lastRound.id });
        moved = true;
        logs.push({ agent: v.name, message: `claimed loot from round ${lastRound.id}`, tx: txHashOf(res) });
      } catch (e) {
        logs.push({ agent: v.name, message: `claim failed: ${errorCode(e)}` });
      }
    }
    if (!moved) players.set(id, p);
  }

  if (status.current_round === null) {
    if (opts.openIfIdle && villagers[0]) {
      try {
        const res = await call(villagers[0], client, "open_round", {});
        logs.push({ agent: villagers[0].name, message: `rang the bell: round ${status.next_round_id} is open`, tx: txHashOf(res) });
      } catch (e) {
        logs.push({ agent: villagers[0].name, message: `could not open a round: ${errorCode(e)}` });
      }
    }
    return logs;
  }

  const r = await client.round(status.current_round);
  if (!r || r.settlement) return logs;
  const opened = nsToMs(r.opened_at);
  const deadline = nsToMs(r.deadline);
  if (nowMs >= deadline) return logs;
  const elapsedBps = min(BigInt(Math.floor(((nowMs - opened) * 10_000) / (deadline - opened))), BPS);
  const health = BigInt(r.health);
  let damageSoFar = BigInt(r.total_early) + BigInt(r.total_late);
  const reward = BigInt(status.hoard) + treasuryReward(config, BigInt(status.treasury), BigInt(r.base_health));
  const parts = new Map((await client.participants(r.id)).map((p) => [p.account, p]));

  for (const v of villagers) {
    const id = v.account.accountId;
    const part = parts.get(id);
    if ((part?.hits ?? 0) >= MAX_HITS_PER_ROUND) continue;
    const p = players.get(id) ?? (await client.player(id));
    const view: RaidView = {
      balance: BigInt(p.balance),
      worstHealth: effectiveHealth(health, Tactic.Armor),
      damageSoFar,
      elapsedBps,
      rewardEstimate: reward,
      minHit: config.minHit,
      maxHit: config.maxHit,
    };
    const d = villagerHit(v.personality, view);
    if (!d) continue;
    const items = new Map(p.items.map(([t, q]) => [t, BigInt(q)]));
    const weapon = (["slayer", "sword", "club"] as const).find((w) => (items.get(w) ?? 0n) > 0n) ?? null;
    try {
      const args: Record<string, unknown> = { amount: d.value.toString() };
      if (weapon) args.weapon = weapon;
      const res = await call(v, client, "hit", args);
      damageSoFar += d.value;
      logs.push({ agent: v.name, message: `hit for ${d.value / ONE} $SLAY${weapon ? ` with a ${weapon}` : ""}. ${d.reason}`, tx: txHashOf(res) });
    } catch (e) {
      logs.push({ agent: v.name, message: `hit failed: ${errorCode(e)}` });
    }
  }
  return logs;
}
