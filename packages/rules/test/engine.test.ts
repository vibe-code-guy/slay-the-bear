import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_CONFIG, NS, ONE, cloneConfig } from "../src/config";
import { makeTestBeacon } from "../src/drand";
import { Game, GameError } from "../src/engine";
import { Tactic, drawTactic, effectiveHealth } from "../src/math";
import { fromHex } from "../src/bytes";

const beacon = makeTestBeacon("ab");
const cfg = cloneConfig(DEMO_CONFIG, { randomness: { ...DEMO_CONFIG.randomness, publicKey: beacon.publicKey } });
const T0 = (cfg.randomness.genesisTime + 100_000n) * NS;

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof GameError) return e.code;
    throw e;
  }
  return "ok";
}

describe("engine", () => {
  let g: Game;
  beforeEach(() => {
    g = new Game(cfg, "slay.testnet");
    for (const p of ["alice.testnet", "bob.testnet", "carol.testnet"]) g.claimPouch(p, T0);
  });

  const sign = (round: bigint) => {
    const b = beacon.sign(round);
    return { round: b.round, signature: b.signature };
  };

  it("starts with every coin accounted for", () => {
    g.checkInvariants();
    expect(g.playerSupply()).toBe(3_000n * ONE);
  });

  it("pays a won raid by damage and drops items", () => {
    g.hit("alice.testnet", 1_000n * ONE, null, T0);
    g.hit("bob.testnet", 1_000n * ONE, null, T0 + 300n * NS);
    const r = g.currentRound()!;
    expect(r.health).toBe(cfg.minHealth);
    const s = g.settle("carol.testnet", r.id, sign(r.targetDrandRound), r.deadline);
    expect(s.outcome).toBe("win");
    expect(s.drops).toHaveLength(cfg.dropDraws);
    const a = g.claim("alice.testnet", r.id, r.deadline);
    const b = g.claim("bob.testnet", r.id, r.deadline);
    expect(a).toBeGreaterThan(b); // alice hit earlier: bigger bonus, bigger share
    expect(a + b).toBeLessThanOrEqual(s.reward);
    expect(code(() => g.claim("alice.testnet", r.id, r.deadline))).toBe("already_claimed");
    expect(code(() => g.claim("carol.testnet", r.id, r.deadline))).toBe("not_a_raider");
    g.checkInvariants();
  });

  it("lets the Bear steal when the town falls short", () => {
    g.hit("alice.testnet", 100n * ONE, null, T0);
    const r = g.currentRound()!;
    const treasury = g.bal(g.ids.treasury);
    const s = g.settle("bob.testnet", r.id, sign(r.targetDrandRound), r.deadline);
    expect(s.outcome).toBe("loss");
    expect(g.bal(g.ids.bear)).toBe(s.steal);
    expect(g.bal(g.ids.treasury)).toBe(treasury - s.steal - s.tip);
    expect(code(() => g.claim("alice.testnet", r.id, r.deadline))).toBe("round_lost");
    // the next Bear guards the hoard, but its health is capped by recent effort (100 damage x 2)
    g.hit("alice.testnet", 1n * ONE, null, r.deadline + NS);
    expect(g.currentRound()!.hoardAtOpen).toBe(s.steal);
    expect(g.currentRound()!.health).toBe(cfg.minHealth);
    g.checkInvariants();
  });

  it("enforces round timing and limits", () => {
    expect(code(() => g.hit("alice.testnet", 0n, null, T0))).toBe("bad_hit_amount");
    expect(code(() => g.hit("alice.testnet", 2_000n * ONE, null, T0))).toBe("bad_hit_amount");
    g.hit("alice.testnet", 10n * ONE, null, T0);
    const r = g.currentRound()!;
    expect(code(() => g.settle("bob.testnet", r.id, sign(r.targetDrandRound), r.deadline - 1n))).toBe("round_not_over");
    expect(code(() => g.hit("bob.testnet", 10n * ONE, null, r.deadline))).toBe("round_ended");
    expect(code(() => g.settle("bob.testnet", r.id, sign(r.targetDrandRound + 1n), r.deadline))).toBe("wrong_beacon_round");
    const other = makeTestBeacon("cd").sign(r.targetDrandRound);
    expect(code(() => g.settle("bob.testnet", r.id, { round: other.round, signature: other.signature }, r.deadline))).toBe(
      "bad_beacon",
    );
    g.settle("bob.testnet", r.id, sign(r.targetDrandRound), r.deadline);
    expect(code(() => g.settle("bob.testnet", r.id, sign(r.targetDrandRound), r.deadline))).toBe("already_settled");
    expect(code(() => g.hit(g.ids.bear, 10n * ONE, null, r.deadline))).toBe("special_account");
  });

  it("draws the Bear's tactic from the beacon, whoever settles and whenever", () => {
    const play = (settler: string, delayNs: bigint) => {
      const game = new Game(cfg, "slay.testnet");
      for (const p of ["alice.testnet", "bob.testnet", "carol.testnet"]) game.claimPouch(p, T0);
      game.openRound("carol.testnet", T0);
      game.hit("alice.testnet", 400n * ONE, null, T0 + 590n * NS);
      game.hit("bob.testnet", 100n * ONE, null, T0 + 590n * NS);
      const r = game.currentRound()!;
      return { r, s: game.settle(settler, r.id, sign(r.targetDrandRound), r.deadline + delayNs) };
    };
    const a = play("carol.testnet", 0n);
    const b = play("bob.testnet", 3_600n * NS);
    expect(a.r.mood).toBe(Tactic.Armor); // the first raid of a season
    const want = drawTactic(fromHex(a.s.randomness), a.r.id, a.r.mood, cfg.moodBps);
    expect([a.s.tactic, a.s.tacticRoll]).toEqual([want.tactic, want.roll]);
    expect([b.s.tactic, b.s.tacticRoll, b.s.outcome]).toEqual([a.s.tactic, a.s.tacticRoll, a.s.outcome]);
    expect(a.s.effectiveHealth).toBe(effectiveHealth(a.r.health, a.s.tactic));
  });

  it("sets the Bear's mood from the last round", () => {
    // round 1: a weak raid, the Bear wins, so it rages next
    g.hit("alice.testnet", 10n * ONE, null, T0);
    let r = g.currentRound()!;
    g.settle("bob.testnet", r.id, sign(r.targetDrandRound), r.deadline);
    g.openRound("bob.testnet", r.deadline + NS);
    r = g.currentRound()!;
    expect(r.mood).toBe(Tactic.Rage);
    // round 2: every hit lands late, so the Bear plans a feint
    g.hit("alice.testnet", 10n * ONE, null, r.deadline - 10n * NS);
    g.settle("bob.testnet", r.id, sign(r.targetDrandRound), r.deadline);
    g.openRound("bob.testnet", r.deadline + NS);
    expect(g.currentRound()!.mood).toBe(Tactic.Feint);
    g.checkInvariants();
  });

  it("lets the smith forge at the open when its stock is low", () => {
    g.buyFromSmith("alice.testnet", 120n, T0);
    expect(g.itemBal(g.ids.smith, "club")).toBe(80n);
    // without wood the smith cannot forge
    g.openRound("bob.testnet", T0);
    expect(g.itemBal(g.ids.smith, "club")).toBe(80n);
    let r = g.currentRound()!;
    g.settle("bob.testnet", r.id, sign(r.targetDrandRound), r.deadline);
    // hand the smith 7 wood (as if players sold it): 3 bundles of 10 charges
    g["mintItem"](g.ids.smith, "wood", 7n);
    const burned = g.burned;
    g.openRound("bob.testnet", r.deadline + NS);
    expect(g.itemBal(g.ids.smith, "club")).toBe(110n);
    expect(g.itemBal(g.ids.smith, "wood")).toBe(1n);
    expect(g.burned - burned).toBe(30n * ONE);
    // stock is above half the target again: no forging at the next open
    r = g.currentRound()!;
    g.settle("bob.testnet", r.id, sign(r.targetDrandRound), r.deadline);
    g.openRound("bob.testnet", r.deadline + NS);
    expect(g.itemBal(g.ids.smith, "club")).toBe(110n);
    g.checkInvariants();
  });

  it("crafts, trades and deals with the smith", () => {
    // seed materials through a won raid's drops would be random; give them directly via the smith flow instead
    expect(code(() => g.craft("alice.testnet", "club", null, T0))).toBe("need_wood");
    const cost = g.buyFromSmith("alice.testnet", 5n, T0);
    expect(cost).toBe(5n * cfg.smith.clubPrice * 2n * cfg.smith.clubTargetStock / (cfg.smith.clubTargetStock + cfg.smith.initialClubs));
    expect(g.itemBal("alice.testnet", "club")).toBe(5n);
    g.hit("alice.testnet", 100n * ONE, "club", T0);
    expect(g.itemBal("alice.testnet", "club")).toBe(4n);
    const id = g.list("alice.testnet", "club", 2n, 4n * ONE, T0);
    expect(code(() => g.buy("alice.testnet", id, 1n, T0))).toBe("own_listing");
    const before = g.bal("alice.testnet");
    g.buy("bob.testnet", id, 2n, T0);
    expect(g.itemBal("bob.testnet", "club")).toBe(2n);
    expect(g.bal("alice.testnet") - before).toBe(8n * ONE - (8n * ONE * cfg.marketFeeBps) / 10_000n);
    expect(g.listings.has(id)).toBe(false);
    expect(code(() => g.sellToSmith("alice.testnet", "club", 1n, T0))).toBe("smith_only_buys_materials");
    g.checkInvariants();
  });

  it("caps starter pouches per day and per account", () => {
    expect(code(() => g.claimPouch("alice.testnet", T0))).toBe("pouch_already_claimed");
    const small = new Game(cloneConfig(cfg, { pouchesPerDay: 1 }));
    small.claimPouch("a.testnet", T0);
    expect(code(() => small.claimPouch("b.testnet", T0))).toBe("pouch_cap_reached");
    small.claimPouch("b.testnet", T0 + 86_400n * NS);
  });

  it("works in NEAR-seed fallback mode", () => {
    const fg = new Game(cloneConfig(cfg, { randomness: { ...cfg.randomness, mode: "near-seed" } }));
    fg.claimPouch("a.testnet", T0);
    fg.claimPouch("b.testnet", T0);
    fg.hit("a.testnet", 1_000n * ONE, null, T0);
    fg.hit("b.testnet", 1_000n * ONE, null, T0);
    const r = fg.currentRound()!;
    expect(code(() => fg.settle("a.testnet", r.id, null, r.deadline))).toBe("missing_seed");
    const s = fg.settle("a.testnet", r.id, null, r.deadline, new Uint8Array(32).fill(3));
    expect(s.outcome).toBe("win");
    fg.checkInvariants();
  });
});
