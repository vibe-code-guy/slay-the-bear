"use client";
// Simulation mode: the same rules engine the contract was tested against, running in the
// browser with a local test beacon (same BLS scheme as drand, different key), four villagers
// and a keeper. Nothing touches the network. The screen renders the engine's views in the
// contract's exact JSON format, so what you see here is what the chain would show.

import {
  BPS,
  DEMO_CONFIG,
  Game,
  GameError,
  NS,
  Tactic,
  cloneConfig,
  effectiveHealth,
  feedJson,
  idsJson,
  listingsJson,
  makeTestBeacon,
  participantsJson,
  playerJson,
  roundJson,
  roundTime,
  roundsJson,
  statusJson,
  treasuryReward,
  villagerHit,
  type Personality,
  type RecipeId,
} from "@slay/rules";
import { claimableShare, type Action, type ActionResult, type Backend, type Snapshot } from "./types";

const CONTRACT = "sim.slaythebear.testnet";
const VILLAGERS: { id: string; personality: Personality }[] = [
  { id: `bjorn.${CONTRACT}`, personality: "brave" },
  { id: `fern.${CONTRACT}`, personality: "follower" },
  { id: `sid.${CONTRACT}`, personality: "sniper" },
  { id: `sara.${CONTRACT}`, personality: "saver" },
];
const KEEPER = `keeper.${CONTRACT}`;
/** 15 s, as KEEPER_GRACE_MS in packages/agents/src/keeper.ts */
const KEEPER_GRACE = 15n * NS;
const ME = `you.${CONTRACT}`;

export function createSimBackend(roundSecs = 300n): Backend {
  const beacon = makeTestBeacon("51ab");
  const config = cloneConfig(DEMO_CONFIG, { roundSecs, randomness: { ...DEMO_CONFIG.randomness, publicKey: beacon.publicKey } });
  const game = new Game(config, CONTRACT);
  let offsetMs = 0;
  let joined = false;
  const nowMs = () => Date.now() + offsetMs;
  const nowNs = () => BigInt(nowMs()) * 1_000_000n;
  let simLast = nowNs();
  let idleSince = nowNs();
  const hitsThisRound = new Map<string, number>();

  for (const v of VILLAGERS) game.claimPouch(v.id, nowNs());

  function run(fn: () => unknown): ActionResult {
    try {
      fn();
      return { ok: true };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.code };
      throw e;
    }
  }

  /** Villagers, the keeper and the clock, stepped 5 simulated seconds at a time up to now. */
  function advance() {
    const target = nowNs();
    const step = 5n * NS;
    let t = simLast;
    while (t < target) {
      const next = t + step < target ? t + step : target;
      stepAt(next, Number(next - t) / 1e9);
      t = next;
    }
    simLast = target;
  }

  function stepAt(now: bigint, elapsedSec: number) {
    const cur = game.currentRound();

    if (cur && now >= cur.deadline) {
      // The keeper settles once the beacon round is out and the raiders have had a while to spin
      // the wheel themselves (and earn the tip), as the live keeper does (KEEPER_GRACE_MS).
      const beaconAt = roundTime(cur.targetDrandRound, config.randomness.genesisTime, config.randomness.period) * NS;
      if (now >= beaconAt + KEEPER_GRACE) {
        const b = beacon.sign(cur.targetDrandRound);
        run(() => game.settle(KEEPER, cur.id, { round: b.round, signature: b.signature }, now));
        hitsThisRound.clear();
        idleSince = now;
        for (const v of VILLAGERS) run(() => game.claim(v.id, cur.id, now));
      }
      return;
    }
    if (!cur) {
      // A villager rings the bell when the town has been quiet for a while.
      if (joined && now - idleSince > 15n * NS) run(() => game.openRound(VILLAGERS[0]!.id, now));
      return;
    }
    const roundLen = Number(cur.deadline - cur.openedAt) / 1e9;
    for (const v of VILLAGERS) {
      if ((hitsThisRound.get(v.id) ?? 0) >= 2) continue;
      // Each villager looks at the raid about six times a round.
      if (Math.random() > Math.min(1, (6 * elapsedSec) / roundLen)) continue;
      const elapsedBps = ((now - cur.openedAt) * BPS) / (cur.deadline - cur.openedAt);
      const d = villagerHit(v.personality, {
        balance: game.bal(v.id),
        worstHealth: effectiveHealth(cur.health, Tactic.Armor),
        damageSoFar: cur.totalEarly + cur.totalLate,
        elapsedBps: elapsedBps > BPS ? BPS : elapsedBps,
        rewardEstimate: game.bal(game.ids.bear) + treasuryReward(config, game.bal(game.ids.treasury), cur.baseHealth),
        minHit: config.minHit,
        maxHit: config.maxHit,
      });
      if (!d) continue;
      const weapon = game.itemBal(v.id, "sword") > 0n ? "sword" : game.itemBal(v.id, "club") > 0n ? "club" : null;
      if (run(() => game.hit(v.id, d.value, weapon, now)).ok) hitsThisRound.set(v.id, (hitsThisRound.get(v.id) ?? 0) + 1);
    }
  }

  return {
    mode: "sim",
    contractId: CONTRACT,
    config,
    ids: idsJson(game),
    account: () => (joined ? ME : null),

    async join() {
      if (joined) return { ok: true };
      joined = true;
      advance();
      idleSince = nowNs() - 10n * NS;
      return run(() => game.claimPouch(ME, nowNs()));
    },

    async snapshot(): Promise<Snapshot> {
      advance();
      const now = nowNs();
      const cur = game.currentRound() ?? game.rounds.get(game.nextRoundId - 1) ?? null;
      const mine = cur && joined ? participantsJson(cur).find((p) => p.account === ME) ?? null : null;
      const history = roundsJson(game, undefined, 12);
      const claimable: Snapshot["claimable"] = [];
      if (joined) {
        for (const r of history.slice(0, 6)) {
          const p = participantsJson(game.rounds.get(r.id)!).find((x) => x.account === ME) ?? null;
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
        player: joined ? playerJson(game, ME) : null,
        me: mine,
        claimable,
        nowMs: nowMs(),
      };
    },

    async act(a: Action): Promise<ActionResult> {
      if (!joined) return { ok: false, error: "Join the town first." };
      advance();
      const now = nowNs();
      switch (a.method) {
        case "claim_pouch":
          return run(() => game.claimPouch(ME, now));
        case "open_round":
          return run(() => game.openRound(ME, now));
        case "hit": {
          let damage = 0n;
          const res = run(() => {
            damage = game.hit(ME, a.amount, a.weapon, now).damage;
          });
          return res.ok ? { ...res, damage: damage.toString() } : res;
        }
        case "settle": {
          const r = game.rounds.get(a.roundId);
          if (!r) return { ok: false, error: "no_round" };
          const b = beacon.sign(r.targetDrandRound);
          const res = run(() => game.settle(ME, a.roundId, { round: b.round, signature: b.signature }, now));
          if (res.ok) {
            hitsThisRound.clear();
            idleSince = now;
            for (const v of VILLAGERS) run(() => game.claim(v.id, a.roundId, now));
          }
          return res;
        }
        case "claim": {
          let amount = 0n;
          const res = run(() => {
            amount = game.claim(ME, a.roundId, now);
          });
          return res.ok ? { ...res, amount: amount.toString() } : res;
        }
        case "craft":
          return run(() => game.craft(ME, a.recipe as RecipeId, a.trophy, now));
        case "buy_from_smith":
          return run(() => game.buyFromSmith(ME, a.qty, now));
        case "sell_to_smith":
          return run(() => game.sellToSmith(ME, a.token, a.qty, now));
        case "list":
          return run(() => game.list(ME, a.token, a.qty, a.price, now));
        case "buy":
          return run(() => game.buy(ME, a.listingId, a.qty, now));
        case "cancel":
          return run(() => game.cancel(ME, a.listingId, now));
      }
    },

    async participants(roundId: number) {
      const r = game.rounds.get(roundId);
      return r ? participantsJson(r) : [];
    },

    async rounds(beforeId: number, limit: number) {
      return roundsJson(game, beforeId, limit);
    },

    async player(account: string) {
      return playerJson(game, account);
    },

    async itemSupply(tokenId: string) {
      return game.itemSupply.get(tokenId) ?? null;
    },

    skip(seconds: number) {
      offsetMs += seconds * 1000;
    },
  };
}
