import { describe, expect, it } from "vitest";
import { SEASON_CONFIG } from "../src/config";
import { SCENARIOS, simulate, summarize } from "../src/sim";

describe("simulator", () => {
  it("is deterministic and keeps every invariant", () => {
    const a = summarize(simulate(SEASON_CONFIG, SCENARIOS[0]!, 10, 7));
    const b = summarize(simulate(SEASON_CONFIG, SCENARIOS[0]!, 10, 7));
    expect(a).toEqual(b);
    expect(a.rounds).toBeGreaterThan(0);
  });

  it("runs every scenario", () => {
    for (const s of SCENARIOS) {
      const res = simulate(SEASON_CONFIG, s, 5, 3);
      expect(res.rounds.length).toBeGreaterThan(0);
      res.game.checkInvariants();
    }
  });
});
