"use client";
// Live mode: reads come straight from the contract over NEAR RPC; moves are signed in the
// browser with the guest's own function-call key and relayed by /api/relay, which pays the gas.
// The server never holds the guest's key, so it cannot make moves for anyone.

import { Account, KeyPair, actions, encodeSignedDelegate, teraToGas, type KeyPairString } from "near-api-js";
import { GameClient, patientProvider } from "@slay/agents";
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

// Settling reads every raider (up to 300); the rest are small. Unused gas is refunded.
const GAS: Record<string, number> = { settle: 150, hit: 30, claim: 30, craft: 30 };

export async function createLiveBackend(): Promise<Backend> {
  // The browser waits out a rate limit for up to about 15 s (0.5 + 1 + 2 + 4 + 8), so a settle
  // or a strike made during a busy moment goes through instead of failing.
  const provider = patientProvider(RPC_URL, { tries: 6, firstWaitMs: 500 });
  const client = new GameClient(provider, GAME_ID);
  const [config, ids] = await Promise.all([client.config(), client.ids()]);
  let guest = loadGuest();
  let busy: Promise<unknown> = Promise.resolve();
  // One Account per guest, so near-api-js tracks the key's nonce between moves.
  let guestAccount: Account | null = null;
  const signer = () => {
    if (!guest) return null;
    if (!guestAccount || guestAccount.accountId !== guest.accountId) {
      guestAccount = new Account(guest.accountId, provider, guest.privateKey as KeyPairString);
    }
    return guestAccount;
  };
  // Rounds, listings, the pouch and unclaimed loot change slowly (or because of the player's own
  // moves, which reset this): refresh them every third poll. The public RPC rate-limits per IP,
  // so every call saved here is one more a busy page can make when it matters (a settle).
  let slow: {
    at: number;
    history: Snapshot["history"];
    listings: Snapshot["listings"];
    player: Snapshot["player"];
    claimable: Snapshot["claimable"];
    /** The won rounds the claimable loot was worked out for. */
    wonKey: string;
  } | null = null;
  let movedSinceClaimCheck = true;

  async function relay(method: string, args: Record<string, unknown>): Promise<ActionResult> {
    const acc = signer();
    if (!acc) return { ok: false, error: "Join the town first." };
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

  /** Relays a move; if the key's nonce was stale, refetches it and tries once more. */
  async function relayWithRetry(method: string, args: Record<string, unknown>): Promise<ActionResult> {
    const first = await relay(method, args);
    if (first.ok || !/nonce/i.test(first.error ?? "")) return first;
    guestAccount = null;
    await new Promise((r) => setTimeout(r, 1500));
    return relay(method, args);
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
      // a new player: read their pouch on the next poll
      slow = null;
      movedSinceClaimCheck = true;
      // The new key needs a moment to be visible to the RPC node before it can sign.
      for (let i = 0; i < 10; i++) {
        try {
          await provider.viewAccessKey({ accountId: guest.accountId, publicKey: key.getPublicKey().toString() });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      return serial(() => relayWithRetry("claim_pouch", {}));
    },

    async snapshot(): Promise<Snapshot> {
      const status = await client.status();
      const roundId = status.current_round ?? (status.next_round_id > 1 ? status.next_round_id - 1 : null);
      const me = guest?.accountId ?? null;
      const settledCount = status.current_round === null ? status.next_round_id - 1 : status.current_round - 1;
      const stale = !slow || Date.now() - slow.at > 12_000 || (slow.history[0]?.id ?? 0) < settledCount;
      const [round, participants, feed] = await Promise.all([
        roundId ? client.round(roundId) : Promise.resolve(null),
        roundId ? client.participants(roundId) : Promise.resolve([]),
        client.feed(25),
      ]);
      // the player's own line is in the raid's participant list already
      const mine = me ? (participants.find((p) => p.account === me) ?? null) : null;
      if (stale) {
        const [history, listings, player] = await Promise.all([
          client.rounds(undefined, 12),
          client.listings(),
          me ? client.player(me) : Promise.resolve(null),
        ]);
        const won = me ? history.filter((r) => r.settlement?.outcome === "win" && r.participants > 0).slice(0, 3) : [];
        const wonKey = won.map((r) => r.id).join(",");
        let claimable: Snapshot["claimable"] = [];
        if (me && slow && !movedSinceClaimCheck && slow.wonKey === wonKey) {
          claimable = slow.claimable;
        } else if (me) {
          const parts = await Promise.all(won.map((r) => client.participant(r.id, me)));
          won.forEach((r, i) => {
            const share = claimableShare(r, parts[i] ?? null);
            if (share !== null) claimable.push({ roundId: r.id, share });
          });
          movedSinceClaimCheck = false;
        }
        slow = { at: Date.now(), history, listings, player, claimable, wonKey };
      }
      const s = slow!;
      return {
        status,
        round,
        participants,
        history: s.history,
        feed,
        listings: s.listings,
        player: s.player,
        me: mine,
        claimable: s.claimable,
        nowMs: Number(BigInt(status.now) / 1_000_000n),
      };
    },

    participants: (roundId) => client.participants(roundId),
    rounds: (beforeId, limit) => client.rounds(beforeId, limit),
    player: (account) => client.player(account),
    async itemSupply(tokenId) {
      const s = await client.view<string | null>("mt_supply", { token_id: tokenId });
      return s === null ? null : BigInt(s);
    },

    act(a: Action): Promise<ActionResult> {
      return serial(async () => {
        const call = toCall(a);
        if (a.method === "settle") {
          const r = await client.round(a.roundId);
          if (!r) return { ok: false, error: "no_round" };
          const beacon = await fetchBeacon(BigInt(r.target_drand_round));
          call.args = { round_id: a.roundId, beacon_round: Number(r.target_drand_round), signature: beacon.signature };
        }
        const res = await relayWithRetry(call.method, call.args);
        // A move changes balances, listings and loot: refresh everything on the next poll.
        slow = null;
        movedSinceClaimCheck = true;
        return res;
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
