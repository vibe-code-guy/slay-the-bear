// drand quicknet: the public randomness beacon that decides every Slay the Bear drop.
//
// quicknet publishes one round every 3 seconds. Each round is a BLS signature (G1, 48 bytes
// compressed) over sha256(round number as 8 big-endian bytes), signed by a threshold of
// League of Entropy members. randomness = sha256(signature). Anyone holding the group public
// key (G2, 96 bytes compressed) can check a round. The game contract performs the same check
// on-chain with NEAR's BLS12-381 host functions (NEP-488).

import { bls12_381 } from "@noble/curves/bls12-381.js";
import { expand_message_xmd } from "@noble/curves/abstract/hash-to-curve.js";
import { beBytes, fromHex, readBe, sha256, toHex } from "./bytes";

export const QUICKNET = {
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  publicKey:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  genesisTime: 1692803367n,
  period: 3n,
  schemeId: "bls-unchained-g1-rfc9380",
  dst: "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
} as const;

/** BLS12-381 base field modulus. */
export const BLS_P =
  0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;

/** The message drand signs for an unchained round. */
export function roundMessage(round: bigint): Uint8Array {
  return sha256(beBytes(round, 8));
}

/** Time (unix seconds) at which a round is published. */
export function roundTime(round: bigint, genesis: bigint = QUICKNET.genesisTime, period: bigint = QUICKNET.period): bigint {
  if (round < 1n) throw new Error("drand rounds start at 1");
  return genesis + (round - 1n) * period;
}

/** The latest round published at or before `timeSec`. */
export function roundAt(timeSec: bigint, genesis: bigint = QUICKNET.genesisTime, period: bigint = QUICKNET.period): bigint {
  if (timeSec < genesis) return 0n;
  return (timeSec - genesis) / period + 1n;
}

/**
 * The drand round that decides a game round: the first round published at or after the
 * deadline, plus a safety margin. Nobody can know its value while hits are still allowed.
 * Mirrors `drand_target_round` in the contract.
 */
export function targetRound(
  deadlineSec: bigint,
  marginRounds: bigint,
  genesis: bigint = QUICKNET.genesisTime,
  period: bigint = QUICKNET.period,
): bigint {
  let first: bigint;
  if (deadlineSec <= genesis) first = 1n;
  else first = (deadlineSec - genesis + period - 1n) / period + 1n;
  return first + marginRounds;
}

/** RFC 9380 hash_to_field for G1 (two field elements), exposed for test vectors. */
export function hashToFieldG1(msg: Uint8Array, dst: string = QUICKNET.dst): [bigint, bigint] {
  const uniform = expand_message_xmd(msg, dst, 128, sha256);
  const u0 = readBe(uniform, 0, 64) % BLS_P;
  const u1 = readBe(uniform, 64, 64) % BLS_P;
  return [u0, u1];
}

/** Checks a quicknet beacon off-chain, exactly as the contract does on-chain. */
export function verifyBeacon(round: bigint, signatureHex: string, publicKeyHex: string = QUICKNET.publicKey): boolean {
  try {
    const sigs = bls12_381.shortSignatures;
    const msgPoint = sigs.hash(roundMessage(round), QUICKNET.dst);
    return sigs.verify(fromHex(signatureHex), msgPoint, fromHex(publicKeyHex));
  } catch {
    return false;
  }
}

export function randomnessFromSignature(signatureHex: string): string {
  return toHex(sha256(fromHex(signatureHex)));
}

export interface Beacon {
  round: bigint;
  signature: string;
  randomness: string;
}

const RELAYS = [
  "https://api.drand.sh",
  "https://drand.cloudflare.com",
  "https://api2.drand.sh",
  "https://api3.drand.sh",
];

/** Fetches a quicknet round from the public HTTP relays and checks it before returning it. */
export async function fetchBeacon(round: bigint, fetchImpl: typeof fetch = fetch): Promise<Beacon> {
  let lastError: unknown;
  for (const base of RELAYS) {
    try {
      const res = await fetchImpl(`${base}/${QUICKNET.chainHash}/public/${round}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`${base} answered ${res.status}`);
      const body = (await res.json()) as { round: number; signature: string; randomness: string };
      if (BigInt(body.round) !== round) throw new Error("relay returned another round");
      if (!verifyBeacon(round, body.signature)) throw new Error("relay returned a bad signature");
      return { round, signature: body.signature, randomness: randomnessFromSignature(body.signature) };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`could not fetch drand round ${round}: ${String(lastError)}`);
}

// ---------- test beacon (simulator only) ----------
// The simulator and offline demo cannot reach drand, so they run their own BLS beacon with the
// same scheme and a known test key. Rounds signed by it never verify against QUICKNET.publicKey.

export interface TestBeacon {
  publicKey: string;
  sign(round: bigint): Beacon;
}

export function makeTestBeacon(seedHex: string): TestBeacon {
  const sigs = bls12_381.shortSignatures;
  const secretKey = sha256(fromHex(seedHex));
  // reduce into the scalar field so any seed works
  const sk = bls12_381.fields.Fr.create(readBe(secretKey, 0, 32));
  const skBytes = beBytes(sk === 0n ? 1n : sk, 32);
  const publicKey = toHex(sigs.getPublicKey(skBytes).toBytes(true));
  return {
    publicKey,
    sign(round: bigint): Beacon {
      const msgPoint = sigs.hash(roundMessage(round), QUICKNET.dst);
      const signature = toHex(sigs.sign(msgPoint, skBytes).toBytes(true));
      return { round, signature, randomness: randomnessFromSignature(signature) };
    },
  };
}
