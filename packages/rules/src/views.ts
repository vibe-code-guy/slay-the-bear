// The contract's view JSON, produced from the TypeScript engine. The web app's simulation mode
// renders exactly what the live mode renders, and fixtures/vectors.json checks that these
// match the contract's own views field for field.

import { clubPrice, bearMood, materialPrice, moodWeights } from "./math";
import { BASE_ITEMS, isTrophy } from "./items";
import type { Game, Round } from "./engine";
import type {
  FeedItemJson,
  IdsJson,
  ListingJson,
  ParticipantJson,
  PlayerJson,
  RoundJson,
  SettlementJson,
  StatusJson,
} from "./contract";

const s = (v: bigint) => v.toString();

export function idsJson(g: Game): IdsJson {
  return { ...g.ids };
}

export function statusJson(g: Game, now: bigint): StatusJson {
  const i = g.ids;
  const smith = i.smith;
  const cur = g.currentRound();
  return {
    now: s(now),
    next_round_id: g.nextRoundId,
    current_round: cur ? cur.id : null,
    total_supply: s(g.totalSupply),
    burned: s(g.burned),
    player_supply: s(g.playerSupply()),
    treasury: s(g.bal(i.treasury)),
    reserve: s(g.bal(i.reserve)),
    hoard: s(g.bal(i.bear)),
    smith_balance: s(g.bal(smith)),
    loot: s(g.bal(i.loot)),
    bear_won_last: g.bearWonLast,
    next_base: s(g.nextBase),
    peak_recent_damage: s(g.peakRecentDamage()),
    recent_damage: g.recentDamage.map(s),
    next_mood: bearMood(g.lastMoodInput()),
    club_price: s(clubPrice(g.config, g.itemBal(smith, "club"), g.bearWonLast)),
    wood_price: s(materialPrice(g.config, "wood", g.itemBal(smith, "wood"))),
    iron_price: s(materialPrice(g.config, "iron", g.itemBal(smith, "iron"))),
    smith_clubs: s(g.itemBal(smith, "club")),
    smith_wood: s(g.itemBal(smith, "wood")),
    smith_iron: s(g.itemBal(smith, "iron")),
    pouches_today: g.pouchesToday,
    listings: g.listings.size,
  };
}

export function roundJson(g: Game, r: Round): RoundJson {
  const st = r.settlement;
  const settlement: SettlementJson | null = st
    ? {
        outcome: st.outcome,
        tactic: st.tactic,
        tactic_roll: st.tacticRoll,
        effective_health: s(st.effectiveHealth),
        total_weight: s(st.totalWeight),
        reward: s(st.reward),
        steal: s(st.steal),
        tip: s(st.tip),
        randomness: st.randomness,
        beacon_round: g.config.randomness.mode === "drand" && st.beaconRound !== null ? s(st.beaconRound) : null,
        beacon_signature: st.beaconSignature,
        drops: st.drops.map((d) => ({ account: d.account, token_id: d.tokenId, qty: s(d.qty), draw: d.draw })),
        settled_at: s(st.settledAt),
        settler: st.settler,
      }
    : null;
  return {
    id: r.id,
    opened_at: s(r.openedAt),
    deadline: s(r.deadline),
    target_drand_round: s(r.targetDrandRound),
    base_health: s(r.baseHealth),
    hoard_at_open: s(r.hoardAtOpen),
    supply_at_open: s(r.supplyAtOpen),
    health: s(r.health),
    mood: r.mood,
    mood_weights: moodWeights(r.mood, g.config.moodBps).map(Number),
    participants: r.participants.length,
    total_early: s(r.totalEarly),
    total_late: s(r.totalLate),
    hits: r.hits,
    hits_chain: r.hitsChain,
    loot_claimed: s(r.lootClaimed),
    settlement,
  };
}

/** Newest first, like get_rounds. */
export function roundsJson(g: Game, beforeId?: number, limit = 10): RoundJson[] {
  const start = Math.min(beforeId ?? g.nextRoundId, g.nextRoundId);
  const out: RoundJson[] = [];
  for (let id = start - 1; id >= 1 && out.length < Math.min(limit, 50); id--) {
    const r = g.rounds.get(id);
    if (r) out.push(roundJson(g, r));
  }
  return out;
}

export function participantsJson(r: Round): ParticipantJson[] {
  return r.participants.map((p, index) => ({
    index,
    account: p.account,
    early: s(p.early),
    late: s(p.late),
    hits: p.hits,
    claimed: r.claimed.has(p.account),
  }));
}

export function playerJson(g: Game, account: string): PlayerJson {
  const owned = g.items.get(account);
  const items: [string, string][] = BASE_ITEMS.map((t) => [t, s(g.itemBal(account, t))] as [string, string]).filter(([, q]) => q !== "0");
  const trophies = [...(owned?.entries() ?? [])].filter(([t, q]) => isTrophy(t) && q > 0n).map(([t]) => t);
  return {
    account,
    registered: g.balances.has(account),
    balance: s(g.bal(account)),
    pouch_claimed: g.pouchClaimed.has(account),
    items,
    trophies,
  };
}

export function listingsJson(g: Game): ListingJson[] {
  return [...g.listings.values()].map((l) => ({ id: l.id, seller: l.seller, token_id: l.tokenId, qty: s(l.qty), price: s(l.price) }));
}

/** The town feed from the engine's event log, newest first, like get_feed. */
export function feedJson(g: Game, limit = 20): FeedItemJson[] {
  const out: FeedItemJson[] = [];
  let seq = 0;
  const items: FeedItemJson[] = [];
  const push = (kind: string, account: string, round: number | null, amount: bigint, value: bigint, detail: string | null, at: bigint) =>
    items.push({ seq: seq++, at: s(at), kind, account, round, amount: s(amount), value: s(value), detail });
  for (const e of g.events) {
    const d = e as Record<string, unknown> & { at: bigint };
    const big = (k: string) => (d[k] as bigint | undefined) ?? 0n;
    switch (e.event) {
      case "pouch":
        push("pouch", d.account as string, null, big("amount"), 0n, null, d.at);
        break;
      case "hit": {
        const w = d.weapon as string | null;
        const late = d.late as boolean;
        push("hit", d.account as string, d.round as number, big("amount"), big("damage"), w && late ? `${w},late` : w ?? (late ? "late" : null), d.at);
        break;
      }
      case "claim":
        push("claim", d.account as string, d.round as number, big("amount"), 0n, null, d.at);
        break;
      case "craft":
        push("craft", d.account as string, null, big("fee"), big("charges"), d.recipe as string, d.at);
        break;
      case "list":
        push("list", d.seller as string, null, big("price"), big("qty"), d.tokenId as string, d.at);
        break;
      case "buy":
        push("buy", d.buyer as string, null, big("cost"), big("qty"), d.tokenId as string, d.at);
        break;
      case "smith_sell":
        push("smith_sell", d.account as string, null, big("cost"), big("qty"), "club", d.at);
        break;
      case "smith_buy":
        push("smith_buy", d.account as string, null, big("paid"), big("qty"), d.tokenId as string, d.at);
        break;
      case "smith_craft":
        push("smith_forge", g.ids.smith, d.round as number, big("fee"), big("charges"), null, d.at);
        break;
      case "round_open":
        push("open", d.opener as string, d.round as number, big("health"), BigInt(d.mood as number), null, d.at);
        break;
      case "settle": {
        const win = d.outcome === "win";
        push("settle", d.settler as string, d.round as number, win ? big("reward") : big("steal"), BigInt(d.tactic as number), d.outcome as string, d.at);
        break;
      }
    }
  }
  for (let i = items.length - 1; i >= 0 && out.length < limit; i--) out.push(items[i]!);
  return out;
}
