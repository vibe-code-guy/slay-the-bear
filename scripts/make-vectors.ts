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
  Tactic,
  cloneConfig,
  makeTestBeacon,
  sha256,
  snapshot,
  tacticCommitment,
  toContractConfig,
  toHex,
  utf8,
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

const salt = (n: number) => sha256(utf8(`salt-${n}`));
const commit = (round: number, tactic: Tactic, now: bigint) =>
  step(g.ids.bear, "bear_commit", { round_id: round, commitment: toHex(tacticCommitment(tactic, salt(round))) }, now, null, () =>
    g.bearCommit(g.ids.bear, round, toHex(tacticCommitment(tactic, salt(round))), now),
  );
const reveal = (round: number, tactic: Tactic, now: bigint) =>
  step(g.ids.bear, "bear_reveal", { round_id: round, tactic, salt: toHex(salt(round)) }, now, round, () =>
    g.bearReveal(g.ids.bear, round, tactic, toHex(salt(round)), now),
  );
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
  step(who, "settle", { round_id: round, beacon_round: b.round.toString(), signature: b.signature }, now, round, () =>
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

// Round 1: Armor, an early hit, a late club hit, a win.
commit(1, Tactic.Armor, t + NS);
hit("alice.testnet", 300n, null, t + 10n * NS);
hit("bob.testnet", 250n, null, t + 100n * NS);
step("carol.testnet", "buy_from_smith", { qty: "3" }, t + 120n * NS, null, () => g.buyFromSmith("carol.testnet", 3n, t + 120n * NS));
hit("carol.testnet", 200n, "club", t + 580n * NS);
hit("dave.testnet", 1n, null, t + 590n * NS);
let r = g.rounds.get(1)!;
reveal(1, Tactic.Armor, r.deadline + NS);
settle("dave.testnet", 1, r.deadline + 5n * NS);
claimAll(1, r.deadline + 10n * NS);

// Round 2: Rage, a weak raid, the Bear steals.
t = r.deadline + 20n * NS;
commit(2, Tactic.Rage, t);
hit("alice.testnet", 5n, null, t + NS);
r = g.rounds.get(2)!;
reveal(2, Tactic.Rage, r.deadline);
settle("bob.testnet", 2, r.deadline + 3n * NS);

// Market: carol lists clubs, bob buys one, carol cancels the rest.
t = r.deadline + 10n * NS;
step("carol.testnet", "list", { token_id: "club", qty: "2", price: (5n * ONE).toString() }, t, null, () =>
  g.list("carol.testnet", "club", 2n, 5n * ONE, t),
);
step("bob.testnet", "buy", { listing_id: 1, qty: "1" }, t + NS, null, () => g.buy("bob.testnet", 1, 1n, t + NS));
step("carol.testnet", "cancel", { listing_id: 1 }, t + 2n * NS, null, () => g.cancel("carol.testnet", 1, t + 2n * NS));

// Round 3: Feint, a big early raid with a late club, a win and drops.
t += 10n * NS;
commit(3, Tactic.Feint, t);
hit("alice.testnet", 400n, null, t + NS);
hit("bob.testnet", 400n, "club", t + 2n * NS);
hit("carol.testnet", 300n, null, t + 595n * NS);
r = g.rounds.get(3)!;
reveal(3, Tactic.Feint, r.deadline);
settle("carol.testnet", 3, r.deadline + NS);
claimAll(3, r.deadline + 2n * NS);

// Spend the drops: sell wood to the smith, craft if possible, let the smith forge.
t = r.deadline + 5n * NS;
for (const p of players) {
  const wood = g.itemBal(p, "wood");
  const iron = g.itemBal(p, "iron");
  if (wood >= 2n && iron >= 3n && g.bal(p) >= 50n * ONE) {
    step(p, "craft", { recipe_id: "sword" }, t, null, () => g.craft(p, "sword", null, t));
  } else if (wood >= 2n && g.bal(p) >= 10n * ONE) {
    step(p, "craft", { recipe_id: "club" }, t, null, () => g.craft(p, "club", null, t));
  }
  if (g.itemBal(p, "wood") > 0n) {
    const q = g.itemBal(p, "wood");
    step(p, "sell_to_smith", { token_id: "wood", qty: q.toString() }, t, null, () => g.sellToSmith(p, "wood", q, t));
  }
  if (g.itemBal(p, "iron") > 0n) {
    const q = g.itemBal(p, "iron");
    step(p, "sell_to_smith", { token_id: "iron", qty: q.toString() }, t, null, () => g.sellToSmith(p, "iron", q, t));
  }
}
if (g.itemBal(g.ids.smith, "wood") >= 2n) {
  step(g.ids.smith, "smith_craft", { bundles: "1" }, t, null, () => g.smithCraft(g.ids.smith, 1n, t));
}

// Round 4: the Bear commits but never reveals; settled after the reveal window, with a penalty.
t += 10n * NS;
commit(4, Tactic.Armor, t);
hit("dave.testnet", 20n, null, t + NS);
r = g.rounds.get(4)!;
settle("alice.testnet", 4, r.deadline + cfg.revealWindowSecs * NS);

// Round 5: opened explicitly, no commitment, nobody hits; the Bear takes its slice.
t = r.deadline + cfg.revealWindowSecs * NS + 5n * NS;
step("bob.testnet", "open_round", {}, t, 5, () => g.openRound("bob.testnet", t));
r = g.rounds.get(5)!;
settle("bob.testnet", 5, r.deadline);

const out = {
  description: "One scripted Slay the Bear game played by packages/rules; replayed by contracts/game/src/tests.rs.",
  start: start.toString(),
  beaconPublicKey: beacon.publicKey,
  config: toContractConfig(cfg),
  initial: snapshot(new Game(cfg, "slay.testnet"), players, null),
  steps,
};
writeFileSync(new URL("../fixtures/vectors.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
const outcomes = [1, 2, 3, 4, 5].map((i) => `${i}:${g.rounds.get(i)?.settlement?.outcome}`).join(" ");
console.log(`wrote fixtures/vectors.json: ${steps.length} steps, rounds ${outcomes}`);
