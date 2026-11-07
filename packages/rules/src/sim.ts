// The simulator: plays many rounds of the real engine with simulated players and the real NPC
// rules, so the parameters can be chosen before launch and judges can watch a week in a minute.

import { NS, ONE, type GameConfig } from "./config";
import { makeTestBeacon, type TestBeacon } from "./drand";
import { Game, GameError } from "./engine";
import { chooseBearTactic, smithRestock, villagerHit, raidView, type Personality } from "./npc";
import { tacticCommitment } from "./math";
import { beBytes, sha256, toHex } from "./bytes";

/** Small deterministic PRNG (mulberry32), so every simulation run can be repeated exactly. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Scenario {
  name: string;
  description: string;
  /** Players by personality at the start. */
  start: Partial<Record<Personality, number>>;
  /** New players joining each day, spread over personalities in this mix. */
  joinPerDay: number;
  joinMix: Personality[];
  /** Chance that a player shows up in a given round. */
  activity: number;
  /** Extra $SLAY one whale starts with (bought elsewhere); 0 for none. */
  whale: bigint;
}

export const SCENARIOS: Scenario[] = [
  {
    name: "coordinated",
    description: "An active community: most players hit early or join once the raid is going.",
    start: { brave: 12, follower: 12, sniper: 4, saver: 4 },
    joinPerDay: 4,
    joinMix: ["brave", "follower", "follower", "sniper"],
    activity: 0.85,
    whale: 0n,
  },
  {
    name: "free-riders",
    description: "Most players wait for others to commit first; few hit early.",
    start: { brave: 3, follower: 6, sniper: 14, saver: 9 },
    joinPerDay: 4,
    joinMix: ["sniper", "saver", "follower"],
    activity: 0.7,
    whale: 0n,
  },
  {
    name: "whale",
    description: "A small town with one large holder who hits early every round.",
    start: { brave: 4, follower: 4, sniper: 2, saver: 2 },
    joinPerDay: 2,
    joinMix: ["follower", "sniper"],
    activity: 0.8,
    whale: 200_000n * ONE,
  },
  {
    name: "ghost-town",
    description: "Few players who rarely show up.",
    start: { brave: 2, follower: 2, sniper: 1, saver: 1 },
    joinPerDay: 0,
    joinMix: [],
    activity: 0.3,
    whale: 0n,
  },
];

export interface RoundStat {
  round: number;
  day: number;
  outcome: "win" | "loss";
  tactic: number;
  health: bigint;
  damage: bigint;
  raiders: number;
  reward: bigint;
  steal: bigint;
  playerSupply: bigint;
  treasury: bigint;
  hoard: bigint;
  burned: bigint;
  totalSupply: bigint;
  players: number;
}

export interface SimResult {
  scenario: string;
  rounds: RoundStat[];
  game: Game;
}

interface SimPlayer {
  id: string;
  personality: Personality;
  whale: boolean;
}

/** Plays `days` days of rounds and returns one stat row per settled round. */
export function simulate(
  config: GameConfig,
  scenario: Scenario,
  days: number,
  seed = 1,
  beacon: TestBeacon = makeTestBeacon("5a"),
): SimResult {
  const cfg: GameConfig = { ...config, randomness: { ...config.randomness, mode: "drand", publicKey: beacon.publicKey } };
  const game = new Game(cfg, "sim.testnet");
  const rand = rng(seed);
  const roundNs = cfg.roundSecs * NS;
  const start = (cfg.randomness.genesisTime + 1_000_000n) * NS;
  let now = start;
  const players: SimPlayer[] = [];
  let joined = 0;

  const addPlayer = (personality: Personality, whale = false) => {
    const id = `p${joined++}.sim.testnet`;
    try {
      game.claimPouch(id, now);
      players.push({ id, personality, whale });
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
    }
  };
  for (const [p, n] of Object.entries(scenario.start) as [Personality, number][]) for (let i = 0; i < n; i++) addPlayer(p);
  if (scenario.whale > 0n) {
    // The whale bought its coins elsewhere; the simulator hands them over from the reserve.
    addPlayer("brave", true);
    const w = players[players.length - 1]!;
    (game.balances as Map<string, bigint>).set(game.ids.reserve, game.bal(game.ids.reserve) - scenario.whale);
    (game.balances as Map<string, bigint>).set(w.id, game.bal(w.id) + scenario.whale);
  }

  const stats: RoundStat[] = [];
  const endNs = start + BigInt(days) * 86_400n * NS;
  let lastDay = 0;
  let salt = new Uint8Array(32);

  while (now < endNs) {
    const day = Number((now - start) / (86_400n * NS));
    if (day > lastDay) {
      for (let d = lastDay; d < day; d++) {
        for (let i = 0; i < scenario.joinPerDay; i++) {
          addPlayer(scenario.joinMix[Math.floor(rand() * scenario.joinMix.length)] ?? "follower");
        }
      }
      lastDay = day;
    }

    // The Bear commits before the round opens.
    const lastRound = game.rounds.get(game.nextRoundId - 1) ?? null;
    const decision = chooseBearTactic(lastRound);
    salt = sha256(beBytes(BigInt(game.nextRoundId), 8));
    game.bearCommit(game.ids.bear, game.nextRoundId, toHex(tacticCommitment(decision.value, salt)), now);

    const r = game.openRound(players[0]?.id ?? "nobody.sim.testnet", now);

    // Each present player checks the raid at three random moments.
    const checks: { t: bigint; p: SimPlayer }[] = [];
    for (const p of players) {
      if (rand() > scenario.activity) continue;
      for (let k = 0; k < 3; k++) checks.push({ t: now + BigInt(Math.floor(rand() * Number(roundNs - NS))), p });
    }
    checks.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    for (const { t, p } of checks) {
      const v = raidView(game, r, t, p.id);
      const d = villagerHit(p.whale ? "brave" : p.personality, p.whale ? { ...v, elapsedBps: 0n } : v);
      if (!d) continue;
      const weapon = game.itemBal(p.id, "sword") > 0n ? "sword" : game.itemBal(p.id, "club") > 0n ? "club" : null;
      try {
        game.hit(p.id, d.value, weapon, t);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
      }
    }

    // Deadline: the Bear reveals, then anyone settles with the drand round fixed at the open.
    now = r.deadline;
    game.bearReveal(game.ids.bear, r.id, decision.value, toHex(salt), now);
    const b = beacon.sign(r.targetDrandRound);
    const s = game.settle(players[0]?.id ?? "nobody.sim.testnet", r.id, { round: b.round, signature: b.signature }, now + 30n * NS);

    // Raiders claim; then they trade with the smith and craft.
    if (s.outcome === "win") for (const p of r.participants) game.claim(p.account, r.id, now + 60n * NS);
    for (const p of players) {
      try {
        const wood = game.itemBal(p.id, "wood");
        const iron = game.itemBal(p.id, "iron");
        if (wood >= 2n && iron >= 3n && game.bal(p.id) > 200n * ONE) game.craft(p.id, "sword", null, now + 90n * NS);
        else if (wood >= 4n) game.sellToSmith(p.id, "wood", wood - 2n, now + 90n * NS);
        if (game.itemBal(p.id, "club") === 0n && game.itemBal(p.id, "sword") === 0n && rand() < 0.3 && game.bal(p.id) > 100n * ONE) {
          game.buyFromSmith(p.id, 3n, now + 95n * NS);
        }
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
      }
    }
    const restock = smithRestock(game);
    if (restock.value > 0n) game.smithCraft(game.ids.smith, restock.value, now + 100n * NS);

    game.checkInvariants();
    stats.push({
      round: r.id,
      day,
      outcome: s.outcome,
      tactic: s.tactic,
      health: s.effectiveHealth,
      damage: s.totalWeight,
      raiders: r.participants.length,
      reward: s.reward,
      steal: s.steal,
      playerSupply: game.playerSupply(),
      treasury: game.bal(game.ids.treasury),
      hoard: game.bal(game.ids.bear),
      burned: game.burned,
      totalSupply: game.totalSupply,
      players: players.length,
    });
    now = r.deadline + 120n * NS;
  }
  return { scenario: scenario.name, rounds: stats, game };
}

export function summarize(res: SimResult) {
  const n = res.rounds.length;
  const wins = res.rounds.filter((r) => r.outcome === "win").length;
  const last = res.rounds[n - 1];
  let streak = 0;
  let longest = 0;
  for (const r of res.rounds) {
    streak = r.outcome === "loss" ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  const biggest = res.rounds.reduce((m, r) => (r.reward > m ? r.reward : m), 0n);
  return {
    scenario: res.scenario,
    rounds: n,
    winRate: n ? Math.round((wins / n) * 100) : 0,
    longestBearStreak: longest,
    biggestJackpot: biggest / ONE,
    playerSupply: (last?.playerSupply ?? 0n) / ONE,
    treasury: (last?.treasury ?? 0n) / ONE,
    hoard: (last?.hoard ?? 0n) / ONE,
    burned: (last?.burned ?? 0n) / ONE,
    players: last?.players ?? 0,
  };
}
