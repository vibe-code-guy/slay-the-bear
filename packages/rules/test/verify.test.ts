import { describe, expect, it } from "vitest";
import { DEMO_CONFIG, SCENARIOS, makeTestBeacon, participantsJson, roundJson, simulate, verifyRound, type RoundJson } from "../src/index";

const beacon = makeTestBeacon("5a");
const res = simulate(DEMO_CONFIG, SCENARIOS[0]!, 1, 3, beacon);
const g = res.game;
const cfg = g.config;
const all: RoundJson[] = [...g.rounds.values()].map((r) => roundJson(g, r));

function verify(id: number, patch?: (r: RoundJson) => RoundJson) {
  const r = g.rounds.get(id)!;
  const history = all.filter((x) => x.id < id).reverse();
  const json = patch ? patch(structuredClone(all[id - 1]!)) : all[id - 1]!;
  return verifyRound(cfg, json, participantsJson(r), history);
}

describe("verifier", () => {
  it("accepts every round of a simulated day", () => {
    expect(all.length).toBeGreaterThan(100);
    for (const r of all) {
      const v = verify(r.id);
      expect(v.checks.filter((c) => !c.ok)).toEqual([]);
      expect(v.ok).toBe(true);
    }
  });

  it("pays out exactly the reward, rounding down", () => {
    const won = all.find((r) => r.settlement?.outcome === "win" && r.participants > 2)!;
    const v = verify(won.id);
    const paid = v.shares.reduce((t, s) => t + s.share, 0n);
    expect(paid).toBeLessThanOrEqual(BigInt(won.settlement!.reward));
    expect(BigInt(won.settlement!.reward) - paid).toBeLessThan(BigInt(v.shares.length));
  });

  it("catches a swapped tactic, a forged beacon and a wrong outcome", () => {
    const id = all.find((r) => r.settlement?.outcome === "win")!.id;
    const failed = (v: ReturnType<typeof verify>) => v.checks.filter((c) => !c.ok).map((c) => c.name);
    expect(failed(verify(id, (r) => ({ ...r, settlement: { ...r.settlement!, tactic: (r.settlement!.tactic + 1) % 4 } })))).toContain(
      "Tactic drawn from the beacon",
    );
    const other = makeTestBeacon("99").sign(BigInt(all[id - 1]!.target_drand_round)).signature;
    expect(failed(verify(id, (r) => ({ ...r, settlement: { ...r.settlement!, beacon_signature: other } })))).toContain(
      "drand signature is valid",
    );
    expect(failed(verify(id, (r) => ({ ...r, settlement: { ...r.settlement!, outcome: "loss" } })))).toContain("Outcome");
    expect(failed(verify(id, (r) => ({ ...r, health: (BigInt(r.health) + 1n).toString() })))).toContain("Bear's health follows the rules");
  });
});
