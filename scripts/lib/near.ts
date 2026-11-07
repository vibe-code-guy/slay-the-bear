// Small helpers shared by the testnet scripts. Keys live in the legacy
// near-cli keychain (~/.near-credentials/<network>/<account>.json), never in
// the repo.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, baseEncode, type KeyPairString } from "near-api-js";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const NETWORK = process.env.NEAR_NETWORK ?? "testnet";
export const RPC_URL =
  process.env.NEAR_RPC_URL ?? (NETWORK === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://rpc.testnet.fastnear.com");
export const FAUCET_URL = "https://helper.nearprotocol.com/account";

if (NETWORK !== "testnet") {
  // The project only runs on testnet. Refuse anything else so a stray env var
  // can't spend real funds.
  throw new Error(`Scripts are testnet-only (NEAR_NETWORK=${NETWORK})`);
}

export const provider = new JsonRpcProvider({ url: RPC_URL });

export function credentialsDir(): string {
  return join(homedir(), ".near-credentials", NETWORK);
}

export function credentialsPath(accountId: string): string {
  return join(credentialsDir(), `${accountId}.json`);
}

export function saveKey(accountId: string, keyPair: KeyPair): string {
  const dir = credentialsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = credentialsPath(accountId);
  if (existsSync(path)) throw new Error(`Refusing to overwrite existing key file ${path}`);
  const body = {
    account_id: accountId,
    public_key: keyPair.getPublicKey().toString(),
    private_key: keyPair.toString(),
  };
  writeFileSync(path, JSON.stringify(body, null, 2), { mode: 0o600 });
  return path;
}

export function hasKey(accountId: string): boolean {
  return existsSync(credentialsPath(accountId));
}

export function loadKey(accountId: string): KeyPair {
  const path = credentialsPath(accountId);
  if (!existsSync(path)) throw new Error(`No key for ${accountId} at ${path}`);
  const body = JSON.parse(readFileSync(path, "utf8")) as { private_key?: string; secret_key?: string };
  const secret = body.private_key ?? body.secret_key;
  if (!secret) throw new Error(`Key file ${path} has no private key`);
  return KeyPair.fromString(secret as KeyPairString);
}

export function account(accountId: string): Account {
  return new Account(accountId, provider, loadKey(accountId).toString() as KeyPairString);
}

export async function accountExists(accountId: string): Promise<boolean> {
  try {
    await provider.viewAccount({ accountId });
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/does not exist|UNKNOWN_ACCOUNT/i.test(msg)) return false;
    throw e;
  }
}

export async function balanceNear(accountId: string): Promise<number> {
  const view = (await provider.viewAccount({ accountId })) as unknown as { amount: string | bigint };
  return Number(BigInt(view.amount) / 10n ** 21n) / 1000;
}

export async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as T;
}

/** NEAR's code hash: base58(sha256(wasm)). Matches view_account.code_hash. */
export function codeHash(wasm: Uint8Array): string {
  return baseEncode(createHash("sha256").update(wasm).digest());
}

export function deploymentPath(contractId: string): string {
  return join(REPO_ROOT, "deployments", `${contractId}.json`);
}

export interface Deployment {
  contractId: string;
  network: string;
  preset: string;
  codeHash: string;
  wasmBytes: number;
  deployedAt: string;
  deployer: string;
  txs: Record<string, string>;
  locked: boolean;
  lockedAt?: string;
  note?: string;
}

export function readDeployment(contractId: string): Deployment {
  return JSON.parse(readFileSync(deploymentPath(contractId), "utf8")) as Deployment;
}

export function writeDeployment(d: Deployment) {
  const dir = join(REPO_ROOT, "deployments");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(deploymentPath(d.contractId), JSON.stringify(d, null, 2) + "\n");
}

/** The transaction hash of a send result. */
export function txHash(res: unknown): string {
  const r = res as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
  return r.transaction?.hash ?? r.transaction_outcome?.id ?? "unknown";
}

/** Total gas burnt by a transaction and all its receipts, in TGas. */
export function gasBurntTgas(res: unknown): number {
  const r = res as { transaction_outcome?: { outcome?: { gas_burnt?: number } }; receipts_outcome?: { outcome?: { gas_burnt?: number } }[] };
  let total = r.transaction_outcome?.outcome?.gas_burnt ?? 0;
  for (const o of r.receipts_outcome ?? []) total += o.outcome?.gas_burnt ?? 0;
  return Math.round(total / 1e9) / 1000;
}

/** Logs (EVENT_JSON lines included) of every receipt of a transaction. */
export function txLogs(res: unknown): string[] {
  const r = res as { receipts_outcome?: { outcome?: { logs?: string[] } }[] };
  return (r.receipts_outcome ?? []).flatMap((o) => o.outcome?.logs ?? []);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
