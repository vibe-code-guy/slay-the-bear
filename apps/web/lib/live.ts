"use client";
// Live mode: reads come straight from the contract over NEAR RPC; moves are signed in the
// browser with the guest's own function-call key and relayed by /api/relay, which pays the gas.
// The server never holds the guest's key, so it cannot make moves for anyone.

import { Account, JsonRpcProvider, KeyPair, actions, encodeSignedDelegate, teraToGas, type KeyPairString } from "near-api-js";
import { GameClient } from "@slay/agents";
import { fetchBeacon } from "@slay/rules";
import { GAME_ID, RPC_URL } from "./env";
import { claimableShare, toCall, type Action, type ActionResult, type Backend, type Snapshot } from "./types";

interface Guest {
  accountId: string;
  privateKey: string;
  contractId: string;
}

const STORAGE_KEY = "slay-guest-v1";

function loadGuest(): Guest | null {
  try {
    const g = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Guest | null;
    return g && g.contractId === GAME_ID ? g : null;
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

const GAS: Record<string, number> = { settle: 80, hit: 30, claim: 30, craft: 30 };

export async function createLiveBackend(): Promise<Backend> {
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const client = new GameClient(provider, GAME_ID);
  const [config, ids] = await Promise.all([client.config(), client.ids()]);
  let guest = loadGuest();
  let busy: Promise<unknown> = Promise.resolve();

  async function relay(method: string, args: Record<string, unknown>): Promise<ActionResult> {
    if (!guest) return { ok: false, error: "Join the town first." };
    const acc = new Account(guest.accountId, provider, guest.privateKey as KeyPairString);
    const { signedDelegate } = await acc.createSignedMetaTransaction({
      receiverId: GAME_ID,
      actions: [actions.functionCall(method, args, teraToGas(GAS[method] ?? 30), 0n)],
      blockHeightTtl: 120,
    });
    const res = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedDelegate: toBase64(encodeSignedDelegate(signedDelegate)) }),
    });
    const body = (await res.json().catch(() => ({}))) as ActionResult;
    if (!res.ok && !body.error) return { ok: false, error: `relayer answered ${res.status}` };
    return body;
  }

  // One move at a time: each delegate action needs the next nonce of the guest's key.
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = busy.then(fn, fn);
    busy = run.catch(() => undefined);
    return run;
  }

  return {
    mode: "live",
    contractId: GAME_ID,
    config,
    ids,
    account: () => guest?.accountId ?? null,

    async join() {
      if (guest) return { ok: true };
      const key = KeyPair.fromRandom("ed25519");
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicKey: key.getPublicKey().toString() }),
      });
      const body = (await res.json().catch(() => ({}))) as { accountId?: string; error?: string; txHash?: string };
      if (!res.ok || !body.accountId) return { ok: false, error: body.error ?? `account service answered ${res.status}` };
      guest = { accountId: body.accountId, privateKey: key.toString(), contractId: GAME_ID };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
      // The new key needs a moment to be visible to the RPC node before it can sign.
      for (let i = 0; i < 10; i++) {
        try {
          await provider.viewAccessKey({ accountId: guest.accountId, publicKey: key.getPublicKey().toString() });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      return serial(() => relay("claim_pouch", {}));
    },

    async snapshot(): Promise<Snapshot> {
      const status = await client.status();
      const roundId = status.current_round ?? (status.next_round_id > 1 ? status.next_round_id - 1 : null);
      const me = guest?.accountId ?? null;
      const [round, participants, history, feed, listings, player, mine] = await Promise.all([
        roundId ? client.round(roundId) : Promise.resolve(null),
        roundId ? client.participants(roundId) : Promise.resolve([]),
        client.rounds(undefined, 12),
        client.feed(25),
        client.listings(),
        me ? client.player(me) : Promise.resolve(null),
        me && roundId ? client.participant(roundId, me) : Promise.resolve(null),
      ]);
      const claimable: Snapshot["claimable"] = [];
      if (me) {
        const won = history.filter((r) => r.settlement?.outcome === "win" && r.participants > 0).slice(0, 3);
        const parts = await Promise.all(won.map((r) => client.participant(r.id, me)));
        won.forEach((r, i) => {
          const share = claimableShare(r, parts[i] ?? null);
          if (share !== null) claimable.push({ roundId: r.id, share });
        });
      }
      return { status, round, participants, history, feed, listings, player, me: mine, claimable, nowMs: Number(BigInt(status.now) / 1_000_000n) };
    },

    participants: (roundId) => client.participants(roundId),
    rounds: (beforeId, limit) => client.rounds(beforeId, limit),

    act(a: Action): Promise<ActionResult> {
      return serial(async () => {
        const call = toCall(a);
        if (a.method === "settle") {
          const r = await client.round(a.roundId);
          if (!r) return { ok: false, error: "no_round" };
          const beacon = await fetchBeacon(BigInt(r.target_drand_round));
          call.args = { round_id: a.roundId, beacon_round: Number(r.target_drand_round), signature: beacon.signature };
        }
        return relay(call.method, call.args);
      });
    },
  };
}

export function forgetGuest() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportGuest(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}
