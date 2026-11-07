// Small byte helpers shared by the rules, the simulator and the verifier.
// Every encoding here has a twin in contracts/game/src, pinned by fixtures/vectors.json.

import { sha256 } from "@noble/hashes/sha2.js";

export { sha256 };

const HEX = "0123456789abcdef";

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += HEX[b >> 4]! + HEX[b & 15]!;
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error(`invalid hex: ${hex.slice(0, 16)}...`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Big-endian encoding of an unsigned integer in `len` bytes. */
export function beBytes(value: bigint, len: number): Uint8Array {
  if (value < 0n) throw new Error("negative value");
  const out = new Uint8Array(len);
  let v = value;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error(`value does not fit in ${len} bytes`);
  return out;
}

/** Reads `len` bytes at `offset` as a big-endian unsigned integer. */
export function readBe(bytes: Uint8Array, offset: number, len: number): bigint {
  let v = 0n;
  for (let i = 0; i < len; i++) v = (v << 8n) | BigInt(bytes[offset + i] ?? 0);
  return v;
}

export const sha256Hex = (data: Uint8Array): string => toHex(sha256(data));
