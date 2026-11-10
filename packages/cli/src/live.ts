// The live game on NEAR testnet for the CLI. Reads go straight to the contract over RPC. Moves
// are either relayed for a free guest account (the hosted site's /api/account and /api/relay,
// as the web app does: the key is made here and never leaves this machine) or signed and paid
// by your own testnet account from ~/.near-credentials.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, KeyPair, actions, encodeSignedDelegate, teraToGas, type KeyPairString } from "near-api-js";
import { GameClient, errorCode, patientProvider, txHashOf } from "@slay/agents";
import {
  claimableShare,
  contractCall,
  fetchBeacon,
  type ActionResult,
  type FeedItemJson,
  type GameConfig,
  type ParticipantJson,
  type RoundJson,
  type Snapshot,
  type TownAction,
} from "@slay/rules";
import { beaconAtMs, type Session } from "./session";

export const DEFAULT_GAME = "game.slaythebear.testnet";
export const DEFAULT_RPC = "https://rpc.testnet.fastnear.com";
/** The hosted site whose relayer makes guest accounts and pays their gas. */
export const DEFAULT_SITE = process.env.SLAY_SITE ?? null;

/** Settling reads every raider (up to 300); the rest are small. Unused gas is refunded. */
const GAS: Record<string, number> = { settle: 150 };

interface Identity {
  game: string;
  accountId: string;
  /** guest: a key made here, relayed by `site`; account: your own key in ~/.near-credentials */
  kind: "guest" | "account";
  privateKey?: string;
  site?: string;
  joinedAt: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The game's own events in a transaction's logs: the damage of a hit, the amount of a claim. */
function gameEvents(res: unknown): { damage?: string; amount?: string } {
  const out: { damage?: string; amount?: string } = {};
  const receipts = (res as { receipts_outcome?: { outcome?: { logs?: string[] } }[] }).receipts_outcome ?? [];
  for (const log of receipts.flatMap((r) => r.outcome?.logs ?? [])) {
    if (!log.startsWith("EVENT_JSON:")) continue;
    try {
      const ev = JSON.parse(log.slice(11)) as { standard?: string; event?: string; data?: { damage?: string; amount?: string }[] };
      if (ev.standard !== "slay") continue;
      if (ev.event === "hit") out.damage = ev.data?.[0]?.damage;
      if (ev.event === "claim") out.amount = ev.data?.[0]?.amount;
    } catch {
      /* not ours */
    }
  }
  return out;
}

function credentialsKey(accountId: string): string {
  const file = join(process.env.NEAR_CREDENTIALS_DIR ?? join(homedir(), ".near-credentials"), "testnet", `${accountId}.json`);
  if (!existsSync(file)) throw new Error(`no key for ${accountId} at ${file}`);
  const body = JSON.parse(readFileSync(file, "utf8")) as { private_key?: string; secret_key?: string };
  const key = body.private_key ?? body.secret_key;
  if (!key) throw new Error(`${file} holds no private_key`);
  return key;
}

export class LiveSession implements Session {
  readonly mode = "live" as const;
  private signer: Account | null = null;

  private constructor(
    private readonly home: string,
    readonly client: GameClient,
    readonly config: GameConfig,
    private identity: Identity | null,
  ) {}

  static async open(home: string, opts: { game?: string; rpc?: string }): Promise<LiveSession> {
    const game = opts.game ?? process.env.SLAY_GAME ?? DEFAULT_GAME;
    const provider = patientProvider(opts.rpc ?? process.env.SLAY_RPC ?? DEFAULT_RPC, { tries: 6, firstWaitMs: 500 });
    const client = new GameClient(provider, game);
    const config = await client.config();
    const file = LiveSession.path(home, game);
    const identity = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Identity) : null;
    return new LiveSession(home, client, config, identity);
  }

  static path(home: string, game: string) {
    return join(home, `live-${game}.json`);
  }

  get contractId() {
    return this.client.contractId;
  }

  get label() {
    return `${this.client.contractId} on NEAR testnet`;
  }

  get joinedAs(): Identity | null {
    return this.identity;
  }

  me() {
    return this.identity?.accountId ?? null;
  }

  nowMs() {
    return Date.now();
  }

  private save(id: Identity | null) {
    const file = LiveSession.path(this.home, this.client.contractId);
    if (!id) {
      rmSync(file, { force: true });
      return;
    }
    if (!existsSync(this.home)) mkdirSync(this.home, { recursive: true });
    writeFileSync(file, JSON.stringify(id, null, 2), { mode: 0o600 });
  }

  private account(): Account {
    if (!this.identity) throw new Error("join first: slay live join");
    if (!this.signer) {
      const key = this.identity.kind === "guest" ? this.identity.privateKey! : credentialsKey(this.identity.accountId);
      this.signer = new Account(this.identity.accountId, this.client.provider as never, key as KeyPairString);
    }
    return this.signer;
  }

  /**
   * Joins the live game: a new guest made by the site's relayer (no wallet, no gas), or your own
   * testnet account. Either way the account then claims its starter pouch.
   */
  async join(opts: { site?: string; account?: string; fresh?: boolean }): Promise<ActionResult & { accountId?: string; kind?: string; already?: boolean; pouch?: boolean }> {
    if (this.identity && !opts.fresh && !opts.account) return { ok: true, accountId: this.identity.accountId, kind: this.identity.kind, already: true };
    if (opts.account) {
      credentialsKey(opts.account); // fails early if there is no key
      this.identity = { game: this.contractId, accountId: opts.account, kind: "account", joinedAt: new Date().toISOString() };
    } else {
      const site = (opts.site ?? DEFAULT_SITE)?.replace(/\/+$/, "");
      if (!site) return { ok: false, error: "no_site" };
      const key = KeyPair.fromRandom("ed25519");
      const res = await fetch(`${site}/api/account`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicKey: key.getPublicKey().toString() }),
      });
      const body = (await res.json().catch(() => ({}))) as { accountId?: string; error?: string };
      if (!res.ok || !body.accountId) return { ok: false, error: body.error ?? `the site answered ${res.status}` };
      this.identity = { game: this.contractId, accountId: body.accountId, kind: "guest", privateKey: key.toString(), site, joinedAt: new Date().toISOString() };
      // the new key needs a moment before the RPC node knows it
      for (let i = 0; i < 15; i++) {
        try {
          await this.client.provider.viewAccessKey({ accountId: body.accountId, publicKey: key.getPublicKey().toString() });
          break;
        } catch {
          await sleep(1000);
        }
      }
    }
    this.signer = null;
    this.save(this.identity);
    const player = await this.client.player(this.identity.accountId);
    if (player.pouch_claimed) return { ok: true, accountId: this.identity.accountId, kind: this.identity.kind, pouch: false };
    const res = await this.send("claim_pouch", {});
    return { ...res, accountId: this.identity.accountId, kind: this.identity.kind, pouch: res.ok };
  }

  /** Forgets the local identity. The testnet account itself stays. */
  leave() {
    this.identity = null;
    this.signer = null;
    this.save(null);
  }

  private async send(method: string, args: Record<string, unknown>): Promise<ActionResult> {
    if (!this.identity) return { ok: false, error: "not_joined" };
    const gas = teraToGas(GAS[method] ?? 30);
    if (this.identity.kind === "account") {
      try {
        const res = await this.account().callFunctionRaw({ contractId: this.contractId, methodName: method, args, gas });
        return { ok: true, txHash: txHashOf(res), ...gameEvents(res) };
      } catch (e) {
        return { ok: false, error: errorCode(e) };
      }
    }
    const relay = async (): Promise<ActionResult> => {
      const { signedDelegate } = await this.account().createSignedMetaTransaction({
        receiverId: this.contractId,
        actions: [actions.functionCall(method, args, gas, 0n)],
        blockHeightTtl: 120,
      });
      const res = await fetch(`${this.identity!.site}/api/relay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedDelegate: Buffer.from(encodeSignedDelegate(signedDelegate)).toString("base64") }),
      });
      const body = (await res.json().catch(() => ({}))) as ActionResult;
      if (!res.ok && !body.error) return { ok: false, error: `the relayer answered ${res.status}` };
      return body;
    };
    const first = await relay();
    if (first.ok || !/nonce/i.test(first.error ?? "")) return first;
    // a stale nonce: read it again and try once more
    this.signer = null;
    await sleep(1500);
    return relay();
  }

  async act(a: TownAction): Promise<ActionResult> {
    const call = contractCall(a);
    if (a.method === "settle") {
      const r = await this.client.round(a.roundId);
      if (!r) return { ok: false, error: "no_round" };
      if (r.settlement) return { ok: false, error: "already_settled" };
      if (Date.now() < Number(BigInt(r.deadline) / 1_000_000n)) return { ok: false, error: "round_not_over" };
      if (Date.now() < beaconAtMs(this.config, r.target_drand_round)) return { ok: false, error: "beacon_not_out" };
      let signature: string;
      try {
        signature = (await fetchBeacon(BigInt(r.target_drand_round))).signature;
      } catch (e) {
        return { ok: false, error: `could not fetch drand round ${r.target_drand_round}: ${String((e as Error).message ?? e)}` };
      }
      call.args = { round_id: a.roundId, beacon_round: Number(r.target_drand_round), signature };
    }
    return this.send(call.method, call.args);
  }

  async snapshot(): Promise<Snapshot> {
    const c = this.client;
    const me = this.me();
    const status = await c.status();
    const roundId = status.current_round ?? (status.next_round_id > 1 ? status.next_round_id - 1 : null);
    const [round, participants, feed, history, listings, player] = await Promise.all([
      roundId ? c.round(roundId) : Promise.resolve(null),
      roundId ? c.participants(roundId) : Promise.resolve([] as ParticipantJson[]),
      c.feed(25),
      c.rounds(undefined, 12),
      c.listings(),
      me ? c.player(me) : Promise.resolve(null),
    ]);
    const claimable: Snapshot["claimable"] = [];
    if (me) {
      const won = history.filter((r) => r.settlement?.outcome === "win" && r.participants > 0).slice(0, 6);
      const parts = await Promise.all(won.map((r) => c.participant(r.id, me)));
      won.forEach((r, i) => {
        const share = claimableShare(r, parts[i] ?? null);
        if (share !== null) claimable.push({ roundId: r.id, share });
      });
    }
    return {
      status,
      round,
      participants,
      history,
      feed,
      listings,
      player,
      me: me ? (participants.find((p) => p.account === me) ?? null) : null,
      claimable,
      nowMs: Date.now(),
    };
  }

  async sleep(ms: number) {
    await sleep(ms);
  }

  async feedSince(seq: number): Promise<FeedItemJson[]> {
    return (await this.client.feed(100)).filter((f) => f.seq > seq).reverse();
  }

  async lastSeq() {
    return (await this.client.feed(1))[0]?.seq ?? -1;
  }

  round(id: number) {
    return this.client.round(id);
  }

  participants(id: number) {
    return this.client.participants(id);
  }

  rounds(beforeId: number, limit: number): Promise<RoundJson[]> {
    return this.client.rounds(beforeId, limit);
  }

  close() {
    /* nothing to save: the chain is the state */
  }
}
