// Server-side helpers for the API routes: the relayer account, guest creation, delegate
// validation and rate limits. Secrets come from environment variables only.

import { Account, JsonRpcProvider, PublicKey, SCHEMA, actions, nearToYocto, type KeyPairString } from "near-api-js";
import { deserialize } from "borsh";

export const GAME_ID = process.env.NEXT_PUBLIC_GAME_ID ?? "town.slaythebear.testnet";
export const ROOT = process.env.NEXT_PUBLIC_ROOT_ACCOUNT ?? "slaythebear.testnet";
export const RELAYER_READY = !!(process.env.RELAYER_ACCOUNT_ID && process.env.RELAYER_PRIVATE_KEY);
const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.fastnear.com";

export const provider = new JsonRpcProvider({ url: RPC });

/** Methods a guest may call through the relayer. Transfers are not relayed. */
export const RELAYABLE = new Set([
  "claim_pouch",
  "open_round",
  "hit",
  "claim",
  "craft",
  "list",
  "buy",
  "cancel",
  "buy_from_smith",
  "sell_to_smith",
  "settle",
]);
const MAX_GAS = 200n * 10n ** 12n;
const GUEST_RE = new RegExp(`^p-[a-z0-9]{8}\\.${ROOT.replace(/\./g, "\\.")}$`);

export function relayer(): Account {
  const id = process.env.RELAYER_ACCOUNT_ID;
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!id || !key) throw new Error("relayer is not configured");
  return new Account(id, provider, key as KeyPairString);
}

export function accountFromEnv(id: string | undefined, key: string | undefined): Account | undefined {
  return id && key ? new Account(id, provider, key as KeyPairString) : undefined;
}

// ---------- rate limits (per server instance; good enough for a testnet demo) ----------

const hits = new Map<string, number[]>();

/** True if `key` made fewer than `max` calls in the last `windowMs`; records this call. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 10_000) hits.clear();
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

// ---------- guests ----------

export function newGuestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const name = [...bytes].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  return `p-${name}.${ROOT}`;
}

/** Creates a guest account whose only key is the browser's key, limited to the game contract. */
export async function createGuest(publicKey: string): Promise<{ accountId: string; txHash?: string }> {
  const pk = PublicKey.fromString(publicKey);
  if (pk.keyType !== 0) throw new Error("only ed25519 keys");
  const accountId = newGuestId();
  const res = await relayer().signAndSendTransaction({
    receiverId: accountId,
    actions: [
      actions.createAccount(),
      actions.transfer(nearToYocto((process.env.GUEST_FUND_NEAR ?? "0.01") as `${number}`)),
      actions.addFunctionCallAccessKey(pk, GAME_ID, []),
    ],
  });
  return { accountId, txHash: (res as { transaction?: { hash?: string } }).transaction?.hash };
}

// ---------- delegate actions ----------

interface DecodedDelegate {
  delegateAction: {
    senderId: string;
    receiverId: string;
    actions: { functionCall?: { methodName: string; args: Uint8Array; gas: bigint; deposit: bigint } }[];
    nonce: bigint;
    maxBlockHeight: bigint;
    publicKey: unknown;
  };
  signature: unknown;
}

export function decodeDelegate(b64: string): DecodedDelegate {
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  if (bytes.length > 4096) throw new Error("delegate too large");
  return deserialize(SCHEMA.SignedDelegate, bytes) as unknown as DecodedDelegate;
}

/** Throws unless the delegate is a zero-deposit call to an allowed game method by a guest. */
export function checkDelegate(d: DecodedDelegate): string[] {
  const a = d.delegateAction;
  if (a.receiverId !== GAME_ID) throw new Error("only the game contract");
  if (!GUEST_RE.test(a.senderId)) throw new Error("only guest accounts are relayed");
  if (a.actions.length < 1 || a.actions.length > 2) throw new Error("one or two actions");
  return a.actions.map((x) => {
    const fc = x.functionCall;
    if (!fc) throw new Error("function calls only");
    if (!RELAYABLE.has(fc.methodName)) throw new Error(`method ${fc.methodName} is not relayed`);
    if (BigInt(fc.deposit) !== 0n) throw new Error("no deposits");
    if (BigInt(fc.gas) > MAX_GAS) throw new Error("too much gas");
    return fc.methodName;
  });
}

export async function relay(d: DecodedDelegate): Promise<{ ok: boolean; txHash?: string; error?: string }> {
  const res = await relayer().signAndSendTransaction({
    receiverId: d.delegateAction.senderId,
    actions: [actions.signedDelegate(d as never)],
    throwOnFailure: false,
  });
  const txHash = (res as { transaction?: { hash?: string } }).transaction?.hash;
  const text = JSON.stringify(res, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  const panic = text.match(/Smart contract panicked: ([a-z_]+)/)?.[1];
  const failure = (res as { status?: { Failure?: unknown } }).status?.Failure;
  if (panic || failure) {
    const other = text.match(/"(DelegateAction[A-Za-z]+|InvalidNonce|Expired)"/)?.[1];
    return { ok: false, txHash, error: panic ?? other ?? "transaction failed" };
  }
  return { ok: true, txHash };
}
