// Fetches a few real quicknet rounds and stores them as fixtures for the TypeScript and Rust tests.
// Usage: npx tsx scripts/fetch-drand-fixtures.ts

import { writeFileSync } from "node:fs";
import { fetchBeacon, hashToFieldG1, roundMessage, QUICKNET } from "../packages/rules/src/drand";
import { toHex } from "../packages/rules/src/bytes";

const rounds = [1n, 1000n, 12345678n, 20000000n];
const out: unknown[] = [];
for (const r of rounds) {
  const b = await fetchBeacon(r);
  const [u0, u1] = hashToFieldG1(roundMessage(r));
  out.push({
    round: r.toString(),
    signature: b.signature,
    randomness: b.randomness,
    message: toHex(roundMessage(r)),
    u0: u0.toString(16).padStart(96, "0"),
    u1: u1.toString(16).padStart(96, "0"),
  });
  console.log(`round ${r}: ok`);
}
writeFileSync(
  new URL("../fixtures/drand-quicknet.json", import.meta.url),
  JSON.stringify({ chainHash: QUICKNET.chainHash, publicKey: QUICKNET.publicKey, rounds: out }, null, 2) + "\n",
);
console.log("wrote fixtures/drand-quicknet.json");
