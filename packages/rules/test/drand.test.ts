import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BLS_P,
  QUICKNET,
  hashToFieldG1,
  makeTestBeacon,
  randomnessFromSignature,
  roundAt,
  roundMessage,
  roundTime,
  targetRound,
  verifyBeacon,
} from "../src/drand";

const fixtures = JSON.parse(readFileSync(new URL("../../../fixtures/drand-quicknet.json", import.meta.url), "utf8")) as {
  publicKey: string;
  rounds: { round: string; signature: string; randomness: string; message: string; u0: string; u1: string }[];
};

describe("drand quicknet", () => {
  it("fixtures use the quicknet public key", () => {
    expect(fixtures.publicKey).toBe(QUICKNET.publicKey);
  });

  for (const f of fixtures.rounds) {
    it(`verifies real round ${f.round}`, () => {
      const r = BigInt(f.round);
      expect(verifyBeacon(r, f.signature)).toBe(true);
      expect(randomnessFromSignature(f.signature)).toBe(f.randomness);
      const [u0, u1] = hashToFieldG1(roundMessage(r));
      expect(u0.toString(16).padStart(96, "0")).toBe(f.u0);
      expect(u1.toString(16).padStart(96, "0")).toBe(f.u1);
      expect(u0 < BLS_P && u1 < BLS_P).toBe(true);
    });
  }

  it("rejects a signature for another round", () => {
    const [a, b] = fixtures.rounds;
    expect(verifyBeacon(BigInt(a!.round), b!.signature)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const f = fixtures.rounds[1]!;
    const bad = f.signature.slice(0, -2) + (f.signature.endsWith("00") ? "01" : "00");
    expect(verifyBeacon(BigInt(f.round), bad)).toBe(false);
  });

  it("maps time to rounds and back", () => {
    expect(roundTime(1n)).toBe(QUICKNET.genesisTime);
    expect(roundAt(QUICKNET.genesisTime)).toBe(1n);
    expect(roundAt(QUICKNET.genesisTime + 2n)).toBe(1n);
    expect(roundAt(QUICKNET.genesisTime + 3n)).toBe(2n);
    const deadline = QUICKNET.genesisTime + 3000n + 1n;
    const t = targetRound(deadline, 0n);
    expect(roundTime(t)).toBeGreaterThanOrEqual(deadline);
    expect(roundTime(t - 1n)).toBeLessThan(deadline);
    expect(targetRound(deadline, 2n)).toBe(t + 2n);
  });

  it("test beacon signs rounds that verify only against its own key", () => {
    const tb = makeTestBeacon("01");
    const b = tb.sign(42n);
    expect(verifyBeacon(42n, b.signature, tb.publicKey)).toBe(true);
    expect(verifyBeacon(42n, b.signature)).toBe(false);
  });
});
