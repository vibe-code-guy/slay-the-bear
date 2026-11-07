// Plays one scripted game with the TypeScript engine and writes fixtures/vectors.json: every
// step with its arguments and the exact state expected afterwards. The contract's unit test
// `replays_typescript_vectors` replays the same steps and must reach the same states.
// Usage: npm run vectors

import { writeFileSync } from "node:fs";
import {
  DEMO_CONFIG,
  Game,
  NS,
  ONE,
  TACTIC_NAMES,
  bearMood,
  cloneConfig,
  drawTactic,
  makeTestBeacon,
  sha256,
  smithForgeBundles,
  snapshot,
  toContractConfig,
  toHex,
  utf8,
  type Tactic,
} from "../packages/rules/src/index";

const beacon = makeTestBeacon("76656374");
const cfg = cloneConfig(DEMO_CONFIG, { randomness: { ...DEMO_CONFIG.randomness, publicKey: beacon.publicKey } });
const g = new Game(cfg, "slay.testnet");
const start = (cfg.randomness.genesisTime + 100_000_000n) * NS;
const players = ["alice.testnet", "bob.testnet", "carol.testnet", "dave.testnet"];
const steps: unknown[] = [];

type Args = Record<string, unknown>;
function step(actor: string, method: string, args: Args, now: bigint, roundId: number | null, run: () => unknown) {
  run();
  g.checkInvariants();
  steps.push({ actor, method, args, now: now.toString(), expect: snapshot(g, players, roundId) });
}

const hit = (who: string, slay: bigint, weapon: string | null, now: bigint) => {
  const args: Args = { amount: (slay * ONE).toString() };
  if (weapon) args.weapon = weapon;
  let round = 0;
  step(who, "hit", args, now, null, () => {
    round = g.hit(who, slay * ONE, weapon, now).round;
  });
  (steps[steps.length - 1] as { expect: unknown }).expect = snapshot(g, players, round);
};
const settle = (who: string, round: number, now: bigint) => {
  const r = g.rounds.get(round)!;
  const b = beacon.sign(r.targetDrandRound);
  step(who, "settle", { round_id: round, beacon_round: Number(b.round), signature: b.signature }, now, round, () =>
    g.settle(who, round, { round: b.round, signature: b.signature }, now),
  );
};
const claimAll = (round: number, now: bigint) => {
  const r = g.rounds.get(round)!;
  if (r.settlement?.outcome !== "win") return;
  for (const p of r.participants) step(p.account, "claim", { round_id: round }, now, round, () => g.claim(p.account, round, now));
};

let t = start;
for (const p of players) step(p, "claim_pouch", {}, t, null, () => g.claimPouch(p, t));

// Round 1: an early hit, a late club hit, a win. The Bear's first mood is Armor.
hit("alice.testnet", 300n, null, t + 10n * NS);
hit("bob.testnet", 250n, null, t + 100n * NS);
step("carol.testnet", "buy_from_smith", { qty: "3" }, t + 120n * NS, null, () => g.buyFromSmith("carol.testnet", 3n, t + 120n * NS));
hit("carol.testnet", 200n, "club", t + 580n * NS);
hit("dave.testnet", 1n, null, t + 590n * NS);
let r = g.rounds.get(1)!;
settle("dave.testnet", 1, r.deadline + 5n * NS);
claimAll(1, r.deadline + 10n * NS);

// Round 2: a weak raid, the Bear steals.
t = r.deadline + 20n * NS;
hit("alice.testnet", 5n, null, t + NS);
r = g.rounds.get(2)!;
settle("bob.testnet", 2, r.deadline + 3n * NS);

// Market: carol lists clubs, bob buys one, carol cancels the rest.
t = r.deadline + 10n * NS;
step("carol.testnet", "list", { token_id: "club", qty: "2", price: (5n * ONE).toString() }, t, null, () =>
  g.list("carol.testnet", "club", 2n, 5n * ONE, t),
);
step("bob.testnet", "buy", { listing_id: 1, qty: "1" }, t + NS, null, () => g.buy("bob.testnet", 1, 1n, t + NS));
step("carol.testnet", "cancel", { listing_id: 1 }, t + 2n * NS, null, () => g.cancel("carol.testnet", 1, t + 2n * NS));

// Round 3: a big early raid with a late club, a win and drops.
t += 10n * NS;
hit("alice.testnet", 400n, null, t + NS);
hit("bob.testnet", 400n, "club", t + 2n * NS);
hit("carol.testnet", 300n, null, t + 595n * NS);
r = g.rounds.get(3)!;
settle("carol.testnet", 3, r.deadline + NS);
claimAll(3, r.deadline + 2n * NS);

// Spend the drops: craft if possible, sell the rest to the smith.
t = r.deadline + 5n * NS;
for (const p of players) {
  const wood = g.itemBal(p, "wood");
  const iron = g.itemBal(p, "iron");
  if (wood >= 2n && iron >= 3n && g.bal(p) >= 50n * ONE) {
    step(p, "craft", { recipe_id: "sword" }, t, null, () => g.craft(p, "sword", null, t));
  } else if (wood >= 5n && g.bal(p) >= 10n * ONE) {
    step(p, "craft", { recipe_id: "club" }, t, null, () => g.craft(p, "club", null, t));
  }
  for (const m of ["wood", "iron"] as const) {
    const q = g.itemBal(p, m);
    if (q > 0n) step(p, "sell_to_smith", { token_id: m, qty: q.toString() }, t, null, () => g.sellToSmith(p, m, q, t));
  }
}
// dave buys most of the smith's clubs, so the smith forges at the next open.
step("dave.testnet", "buy_from_smith", { qty: "105" }, t + NS, null, () => g.buyFromSmith("dave.testnet", 105n, t + NS));

// Round 4: bob opens it, which lets the smith forge; dave's lone late raid loses.
t += 10n * NS;
step("bob.testnet", "open_round", {}, t, 4, () => g.openRound("bob.testnet", t));
hit("dave.testnet", 20n, null, t + 595n * NS);
r = g.rounds.get(4)!;
settle("alice.testnet", 4, r.deadline);

// Round 5: all of round 4's damage came late, so the Bear's mood is Feint. A late hit, a loss.
t = r.deadline + 5n * NS;
step("bob.testnet", "open_round", {}, t, 5, () => g.openRound("bob.testnet", t));
hit("carol.testnet", 3n, null, t + 590n * NS);
r = g.rounds.get(5)!;
settle("bob.testnet", 5, r.deadline);

// Formula vectors for the NPC rules that run inside the contract.
const tacticDraws = Array.from({ length: 24 }, (_, i) => {
  const randomness = sha256(utf8(`randomness-${i}`));
  const mood = (i % 4) as Tactic;
  const d = drawTactic(randomness, i + 1, mood, cfg.moodBps);
  return { randomness: toHex(randomness), round_id: i + 1, mood, tactic: d.tactic, roll: d.roll };
});
const moodCases: { early: bigint; late: bigint; won: boolean; weight: bigint; health: bigint }[] = [
  { early: 0n, late: 0n, won: false, weight: 0n, health: 500n },
  { early: 650n, late: 350n, won: true, weight: 1000n, health: 500n },
  { early: 651n, late: 349n, won: true, weight: 1000n, health: 500n },
  { early: 100n, late: 0n, won: false, weight: 100n, health: 500n },
  { early: 1000n, late: 0n, won: true, weight: 1249n, health: 1000n },
  { early: 1000n, late: 0n, won: true, weight: 1250n, health: 1000n },
  { early: 0n, late: 10n, won: false, weight: 10n, health: 500n },
];
const moods = [
  { last: null, mood: bearMood(null) },
  ...moodCases.map((m) => {
    const input = { totalEarly: m.early, totalLate: m.late, townWon: m.won, totalWeight: m.weight, effectiveHealth: m.health };
    return {
      last: { total_early: m.early.toString(), total_late: m.late.toString(), town_won: m.won, total_weight: m.weight.toString(), effective_health: m.health.toString() },
      mood: bearMood(input),
    };
  }),
];
const forge = [
  [200n, 0n, 0n],
  [100n, 50n, 1_000n * ONE],
  [99n, 50n, 1_000n * ONE],
  [0n, 50n, 1_000n * ONE],
  [0n, 7n, 1_000n * ONE],
  [0n, 50n, 25n * ONE],
  [95n, 3n, 9n * ONE],
].map(([stock, wood, balance]) => ({
  stock: stock!.toString(),
  wood: wood!.toString(),
  balance: balance!.toString(),
  bundles: smithForgeBundles(cfg, stock!, wood!, balance!).toString(),
}));

const out = {
  description: "One scripted Slay the Bear game played by packages/rules; replayed by contracts/game/src/tests.rs.",
  start: start.toString(),
  beaconPublicKey: beacon.publicKey,
  config: toContractConfig(cfg),
  initial: snapshot(new Game(cfg, "slay.testnet"), players, null),
  steps,
  formulas: { tacticDraws, moods, forge },
};
writeFileSync(new URL("../fixtures/vectors.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
const rounds = [1, 2, 3, 4, 5].map((i) => {
  const rr = g.rounds.get(i)!;
  const s = rr.settlement!;
  return `${i}:${s.outcome} mood ${TACTIC_NAMES[rr.mood]} drew ${TACTIC_NAMES[s.tactic]} (roll ${s.tacticRoll}) drops ${s.drops.length}`;
});
const forged = g.events.filter((e) => e.event === "smith_craft").map((e) => `round ${e.round}: ${e.charges} charges`);
console.log(`wrote fixtures/vectors.json: ${steps.length} steps`);
for (const line of rounds) console.log("  " + line);
console.log(`  smith forged: ${forged.join(", ") || "never"}`);
