// The offline town: the rules engine with four villagers, a keeper and a local test beacon (the
// same BLS scheme as drand, a different key). Nothing touches the network. The web app's offline
// mode runs it on the real clock; the CLI runs it on a clock that moves only when told to, with
// seeded villagers, so a session can be replayed exactly. Its views are the contract's own JSON.
//
// Also here: the moves a player can make, as data, and how each maps to a contract call, so the
// web app and the CLI send the same calls live.

import { BPS, DEMO_CONFIG, NS, cloneConfig, type GameConfig } from "./config";
import type { FeedItemJson, ListingJson, ParticipantJson, PlayerJson, RoundJson, StatusJson } from "./contract";
import { makeTestBeacon, roundTime, type TestBeacon } from "./drand";
import { Game, GameError } from "./engine";
import type { RecipeId } from "./items";
import { Tactic, effectiveHealth, lootShare, treasuryReward, weight } from "./math";
import { villagerHit, villagerTrade, type Personality } from "./npc";
import { feedJson, listingsJson, participantsJson, playerJson, roundJson, roundsJson, statusJson } from "./views";

// ---------- moves ----------

/** A move a player can make. Amounts are base units (18 decimals). */
export type TownAction =
  | { method: "claim_pouch" }
  | { method: "open_round" }
  | { method: "hit"; amount: bigint; weapon: string | null }
  | { method: "settle"; roundId: number }
  | { method: "claim"; roundId: number }
  | { method: "craft"; recipe: string; trophy: string | null }
  | { method: "buy_from_smith"; qty: bigint }
  | { method: "sell_to_smith"; token: string; qty: bigint }
  | { method: "list"; token: string; qty: bigint; price: bigint }
  | { method: "buy"; listingId: number; qty: bigint }
  | { method: "cancel"; listingId: number };

export interface ActionResult {
  ok: boolean;
  error?: string;
  txHash?: string;
  /** Damage of a hit, as the contract computed it (base units). */
  damage?: string;
  /** Whether that hit fell in the late window (simulation only). */
  late?: boolean;
  /** The raid a hit landed in (simulation only). */
  round?: number;
  /** Amount paid by a claim (base units). */
  amount?: string;
  /** The new listing's id (simulation only). */
  listingId?: number;
}

/** Contract method and JSON args for a move (settle's beacon args are added by the sender). */
export function contractCall(a: TownAction): { method: string; args: Record<string, unknown> } {
  switch (a.method) {
    case "hit":
      return { method: "hit", args: a.weapon ? { amount: a.amount.toString(), weapon: a.weapon } : { amount: a.amount.toString() } };
    case "settle":
      return { method: "settle", args: { round_id: a.roundId } };
    case "claim":
      return { method: "claim", args: { round_id: a.roundId } };
    case "craft":
      return { method: "craft", args: a.trophy ? { recipe_id: a.recipe, trophy_id: a.trophy } : { recipe_id: a.recipe } };
    case "buy_from_smith":
      return { method: "buy_from_smith", args: { qty: a.qty.toString() } };
    case "sell_to_smith":
      return { method: "sell_to_smith", args: { token_id: a.token, qty: a.qty.toString() } };
    case "list":
      return { method: "list", args: { token_id: a.token, qty: a.qty.toString(), price: a.price.toString() } };
    case "buy":
      return { method: "buy", args: { listing_id: a.listingId, qty: a.qty.toString() } };
    case "cancel":
      return { method: "cancel", args: { listing_id: a.listingId } };
    default:
      return { method: a.method, args: {} };
  }
}

/** Player-facing explanations of the contract's error codes. */
export const ERRORS: Record<string, string> = {
  pouch_already_claimed: "You already claimed your starter pouch.",
  pouch_cap_reached: "Today's starter pouches are gone. Come back tomorrow.",
  reserve_empty: "The pouch chest is empty.",
  bad_hit_amount: "A hit must burn between the minimum and maximum hit size.",
  insufficient_balance: "Not enough $SLAY.",
  not_a_weapon: "That is not a weapon.",
  no_weapon_charge: "You have no charges of that weapon.",
  round_ended: "Time is up for this raid. Settle it to start the next one.",
  round_full: "This raid is full.",
  too_many_hits: "You have hit as often as one raider may this round.",
  not_settled: "The raid is not settled yet.",
  round_lost: "The Bear won that raid; there is no loot.",
  not_a_raider: "You did not hit the Bear in that raid.",
  already_claimed: "You already claimed your loot.",
  need_wood: "Not enough wood.",
  need_iron: "Not enough iron.",
  need_trophy: "You need a Bear trophy for that.",
  round_not_over: "The raid is still on.",
  already_settled: "Someone already settled this raid.",
  wrong_beacon_round: "That is not the deciding drand round.",
  bad_beacon: "The drand signature did not verify.",
  beacon_not_out: "The deciding drand round is not out yet.",
  smith_out_of_stock: "The smith is out of clubs.",
  smith_out_of_money: "The smith cannot afford that right now.",
  round_in_progress: "A raid is already on.",
  special_account: "NPC accounts cannot do that.",
  own_listing: "That is your own listing.",
  insufficient_items: "You do not have enough of that item.",
};

export const explain = (code?: string) => (code ? (ERRORS[code] ?? code) : "Something went wrong.");

// ---------- what a client shows ----------

/** Everything a town screen shows, in the contract's own view format. */
export interface Snapshot {
  status: StatusJson;
  /** The round in progress, or else the latest one. */
  round: RoundJson | null;
  participants: ParticipantJson[];
  /** Last rounds, newest first. */
  history: RoundJson[];
  feed: FeedItemJson[];
  listings: ListingJson[];
  player: PlayerJson | null;
  me: ParticipantJson | null;
  /** Won raids where the player still has loot to claim. */
  claimable: { roundId: number; share: bigint }[];
  nowMs: number;
}

/** A raider's unclaimed share of a won round. */
export function claimableShare(r: RoundJson, p: ParticipantJson | null): bigint | null {
  const s = r.settlement;
  if (!s || s.outcome !== "win" || !p || p.claimed) return null;
  return lootShare(weight(BigInt(p.early), BigInt(p.late), s.tactic as Tactic), BigInt(s.total_weight), BigInt(s.reward));
}

// ---------- the offline town ----------

export const SIM_CONTRACT = "sim.slaythebear.testnet";
export const SIM_PLAYER = `you.${SIM_CONTRACT}`;
export const SIM_KEEPER = `keeper.${SIM_CONTRACT}`;
export const SIM_VILLAGERS: { id: string; personality: Personality }[] = [
  { id: `bjorn.${SIM_CONTRACT}`, personality: "brave" },
  { id: `fern.${SIM_CONTRACT}`, personality: "follower" },
  { id: `sid.${SIM_CONTRACT}`, personality: "sniper" },
  { id: `sara.${SIM_CONTRACT}`, personality: "saver" },
];
/** Seed of the local test beacon's key. Its public key goes into the town's config. */
export const SIM_BEACON_SEED = "51ab";
/** 15 s, as KEEPER_GRACE_MS in packages/agents/src/keeper.ts */
const KEEPER_GRACE = 15n * NS;

export interface SimTownOptions {
  /** Raid length; 5 minutes by default, like the public game. */
  roundSecs?: bigint;
  /** When the town starts (ns). */
  startNs: bigint;
  /** The villagers' dice: Math.random by default, a seeded generator for a replayable town. */
  random?: () => number;
}

export class SimTown {
  readonly beacon: TestBeacon;
  readonly config: GameConfig;
  readonly game: Game;
  readonly contractId = SIM_CONTRACT;
  readonly player = SIM_PLAYER;
  joined = false;
  private last: bigint;
  private idleSince: bigint;
  private readonly hitsThisRound = new Map<string, number>();
  private readonly random: () => number;

  constructor(opts: SimTownOptions) {
    this.beacon = makeTestBeacon(SIM_BEACON_SEED);
    this.config = cloneConfig(DEMO_CONFIG, {
      roundSecs: opts.roundSecs ?? 300n,
      randomness: { ...DEMO_CONFIG.randomness, publicKey: this.beacon.publicKey },
    });
    this.game = new Game(this.config, SIM_CONTRACT);
    this.random = opts.random ?? Math.random;
    this.last = opts.startNs;
    this.idleSince = opts.startNs;
    for (const v of SIM_VILLAGERS) this.game.claimPouch(v.id, opts.startNs);
  }

  /** When the deciding beacon of a raid is published (ns). */
  beaconAt(targetDrandRound: bigint): bigint {
    return roundTime(targetDrandRound, this.config.randomness.genesisTime, this.config.randomness.period) * NS;
  }

  private run(fn: () => unknown): ActionResult {
    try {
      fn();
      return { ok: true };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.code };
      throw e;
    }
  }

  /** Villagers, the keeper and the clock, stepped 5 seconds at a time up to `target` (ns). */
  advanceTo(target: bigint) {
    const step = 5n * NS;
    let t = this.last;
    while (t < target) {
      const next = t + step < target ? t + step : target;
      this.stepAt(next, Number(next - t) / 1e9);
      t = next;
    }
    if (target > this.last) this.last = target;
  }

  private stepAt(now: bigint, elapsedSec: number) {
    const game = this.game;
    const cur = game.currentRound();

    if (cur && now >= cur.deadline) {
      // The keeper settles once the beacon round is out and the raiders have had a while to spin
      // the wheel themselves (and earn the tip), as the live keeper does (KEEPER_GRACE_MS).
      if (now >= this.beaconAt(cur.targetDrandRound) + KEEPER_GRACE) {
        const b = this.beacon.sign(cur.targetDrandRound);
        this.run(() => game.settle(SIM_KEEPER, cur.id, { round: b.round, signature: b.signature }, now));
        this.afterSettle(cur.id, now);
      }
      return;
    }
    if (!cur) {
      // A villager rings the bell when the town has been quiet for a while.
      if (this.joined && now - this.idleSince > 15n * NS) this.run(() => game.openRound(SIM_VILLAGERS[0]!.id, now));
      return;
    }
    const roundLen = Number(cur.deadline - cur.openedAt) / 1e9;
    for (const v of SIM_VILLAGERS) {
      if ((this.hitsThisRound.get(v.id) ?? 0) >= 2) continue;
      // Each villager looks at the raid about six times a round.
      if (this.random() > Math.min(1, (6 * elapsedSec) / roundLen)) continue;
      const elapsedBps = ((now - cur.openedAt) * BPS) / (cur.deadline - cur.openedAt);
      const d = villagerHit(v.personality, {
        balance: game.bal(v.id),
        worstHealth: effectiveHealth(cur.health, Tactic.Armor),
        damageSoFar: cur.totalEarly + cur.totalLate,
        elapsedBps: elapsedBps > BPS ? BPS : elapsedBps,
        rewardEstimate: game.bal(game.ids.bear) + treasuryReward(this.config, game.bal(game.ids.treasury), cur.baseHealth),
        minHit: this.config.minHit,
        maxHit: this.config.maxHit,
      });
      if (!d) continue;
      // the best weapon it holds, as the live villagers do
      const weapon = (["slayer", "sword", "club"] as const).find((w) => game.itemBal(v.id, w) > 0n) ?? null;
      if (this.run(() => game.hit(v.id, d.value, weapon, now)).ok) this.hitsThisRound.set(v.id, (this.hitsThisRound.get(v.id) ?? 0) + 1);
    }
  }

  /** After a raid: the villagers claim their loot, then each may forge, sell a trophy or sell wood. */
  private afterSettle(roundId: number, now: bigint) {
    const game = this.game;
    this.hitsThisRound.clear();
    this.idleSince = now;
    for (const v of SIM_VILLAGERS) this.run(() => game.claim(v.id, roundId, now));
    for (const v of SIM_VILLAGERS) {
      const p = playerJson(game, v.id);
      const d = villagerTrade(v.personality, { balance: BigInt(p.balance), items: new Map(p.items.map(([t, q]) => [t, BigInt(q)])), trophies: p.trophies });
      if (!d) continue;
      const m = d.value;
      if (m.kind === "craft") this.run(() => game.craft(v.id, m.recipe, m.trophy, now));
      else if (m.kind === "list") this.run(() => game.list(v.id, m.token, m.qty, m.price, now));
      else this.run(() => game.sellToSmith(v.id, m.token, m.qty, now));
    }
  }

  /** The player arrives and claims a starter pouch. */
  join(now: bigint): ActionResult {
    if (this.joined) return { ok: true };
    this.joined = true;
    this.advanceTo(now);
    this.idleSince = now - 10n * NS;
    return this.run(() => this.game.claimPouch(SIM_PLAYER, now));
  }

  /** One move by the player at `now` (ns); the town catches up to `now` first. */
  act(a: TownAction, now: bigint): ActionResult {
    if (!this.joined) return { ok: false, error: "Join the town first." };
    this.advanceTo(now);
    const game = this.game;
    const ME = SIM_PLAYER;
    switch (a.method) {
      case "claim_pouch":
        return this.run(() => game.claimPouch(ME, now));
      case "open_round":
        return this.run(() => game.openRound(ME, now));
      case "hit": {
        let hit: { round: number; damage: bigint; late: boolean } | null = null;
        const res = this.run(() => {
          hit = game.hit(ME, a.amount, a.weapon, now);
        });
        const h = hit as { round: number; damage: bigint; late: boolean } | null;
        return res.ok && h ? { ...res, damage: h.damage.toString(), late: h.late, round: h.round } : res;
      }
      case "settle": {
        const r = game.rounds.get(a.roundId);
        if (!r) return { ok: false, error: "no_round" };
        // as on testnet: nobody has the deciding beacon before drand publishes it
        if (!r.settlement && now >= r.deadline && now < this.beaconAt(r.targetDrandRound)) return { ok: false, error: "beacon_not_out" };
        const b = this.beacon.sign(r.targetDrandRound);
        const res = this.run(() => game.settle(ME, a.roundId, { round: b.round, signature: b.signature }, now));
        if (res.ok) this.afterSettle(a.roundId, now);
        return res;
      }
      case "claim": {
        let amount = 0n;
        const res = this.run(() => {
          amount = game.claim(ME, a.roundId, now);
        });
        return res.ok ? { ...res, amount: amount.toString() } : res;
      }
      case "craft":
        return this.run(() => game.craft(ME, a.recipe as RecipeId, a.trophy, now));
      case "buy_from_smith":
        return this.run(() => game.buyFromSmith(ME, a.qty, now));
      case "sell_to_smith":
        return this.run(() => game.sellToSmith(ME, a.token, a.qty, now));
      case "list": {
        let id = 0;
        const res = this.run(() => {
          id = game.list(ME, a.token, a.qty, a.price, now);
        });
        return res.ok ? { ...res, listingId: id } : res;
      }
      case "buy":
        return this.run(() => game.buy(ME, a.listingId, a.qty, now));
      case "cancel":
        return this.run(() => game.cancel(ME, a.listingId, now));
    }
  }

  /** What the player sees at `now` (ns); the town catches up to `now` first. */
  snapshot(now: bigint): Snapshot {
    this.advanceTo(now);
    const game = this.game;
    const cur = game.currentRound() ?? game.rounds.get(game.nextRoundId - 1) ?? null;
    const mine = cur && this.joined ? (participantsJson(cur).find((p) => p.account === SIM_PLAYER) ?? null) : null;
    const history = roundsJson(game, undefined, 12);
    const claimable: Snapshot["claimable"] = [];
    if (this.joined) {
      for (const r of history.slice(0, 6)) {
        const p = participantsJson(game.rounds.get(r.id)!).find((x) => x.account === SIM_PLAYER) ?? null;
        const share = claimableShare(r, p);
        if (share !== null) claimable.push({ roundId: r.id, share });
      }
    }
    return {
      status: statusJson(game, now),
      round: cur ? roundJson(game, cur) : null,
      participants: cur ? participantsJson(cur) : [],
      history,
      feed: feedJson(game, 25),
      listings: listingsJson(game),
      player: this.joined ? playerJson(game, SIM_PLAYER) : null,
      me: mine,
      claimable,
      nowMs: Number(now / 1_000_000n),
    };
  }
}
