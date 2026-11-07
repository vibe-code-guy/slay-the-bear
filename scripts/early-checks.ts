// Testnet checks of the two claims everything else depends on:
//  1. the contract verifies a real drand quicknet beacon on-chain, rejects a tampered one, and
//     settles within the gas limit;
//  2. a guest account holding only a function-call key can play through a meta-transaction
//     relayer, paying no gas, while the contract sees the guest as the caller.
//
//   npx tsx scripts/early-checks.ts setup  --game dev.slaythebear.testnet
//   npx tsx scripts/early-checks.ts start  --game dev.slaythebear.testnet
//   npx tsx scripts/early-checks.ts relay  --game dev.slaythebear.testnet
//   npx tsx scripts/early-checks.ts settle --game dev.slaythebear.testnet
import { KeyPair, actions, nearToYocto, teraToGas, Account, type KeyPairString } from "near-api-js";
import { fetchBeacon } from "../packages/rules/src/index";
import {
  account,
  accountExists,
  arg,
  balanceNear,
  gasBurntTgas,
  hasKey,
  loadKey,
  provider,
  saveKey,
  sleep,
  txHash,
  txLogs,
  view,
} from "./lib/near";

const ONE = 10n ** 18n;
const root = arg("root", "slaythebear.testnet");
const game = arg("game", `dev.${root}`);
const tester = `tester.${root}`;
const guest = `guest-check.${root}`;

interface RoundView {
  id: number;
  deadline: string;
  target_drand_round: string;
  health: string;
  hits: number;
  settlement: null | { outcome: string; tactic: number; randomness: string; reward: string; steal: string };
}

async function setup() {
  const rootAcc = account(root);
  if (!(await accountExists(tester))) {
    const k = KeyPair.fromRandom("ed25519");
    saveKey(tester, k);
    await rootAcc.signAndSendTransaction({
      receiverId: tester,
      actions: [actions.createAccount(), actions.transfer(nearToYocto("0.5")), actions.addFullAccessKey(k.getPublicKey())],
    });
    console.log(`created ${tester} with a full-access key`);
  }
  if (!(await accountExists(guest))) {
    const k = KeyPair.fromRandom("ed25519");
    saveKey(guest, k);
    // The guest gets one key that can only call the game, and just enough NEAR for its own storage.
    const res = await rootAcc.signAndSendTransaction({
      receiverId: guest,
      actions: [
        actions.createAccount(),
        actions.transfer(nearToYocto("0.01")),
        actions.addFunctionCallAccessKey(k.getPublicKey(), game, []),
      ],
    });
    console.log(`created ${guest} with only a function-call key for ${game} (${txHash(res)}, ${gasBurntTgas(res)} TGas)`);
  }
  const keys = await new Account(guest, provider).getAccessKeyList();
  console.log(`${guest} keys:`, JSON.stringify(keys.keys.map((k) => k.access_key.permission)));
}

async function start() {
  const t = account(tester);
  const player = await view<{ pouch_claimed: boolean; balance: string }>(game, "get_player", { account_id: tester });
  if (!player.pouch_claimed) {
    const res = await t.callFunctionRaw({ contractId: game, methodName: "claim_pouch", args: {}, gas: teraToGas(30) });
    console.log(`claim_pouch ${txHash(res)} ${gasBurntTgas(res)} TGas`);
  }
  const res = await t.callFunctionRaw({
    contractId: game,
    methodName: "hit",
    args: { amount: (300n * ONE).toString() },
    gas: teraToGas(30),
  });
  console.log(`hit ${txHash(res)} ${gasBurntTgas(res)} TGas`);
  for (const l of txLogs(res)) if (l.includes('"event":"hit"') || l.includes("round_open")) console.log("  ", l);
  const status = await view<{ current_round: number | null }>(game, "get_status");
  const r = await view<RoundView>(game, "get_round", { round_id: status.current_round });
  console.log(`round ${r.id}: deadline ${new Date(Number(BigInt(r.deadline) / 1_000_000n)).toISOString()}, drand round ${r.target_drand_round}, health ${BigInt(r.health) / ONE} SLAY`);
}

async function relay() {
  const relayer = account(root);
  const guestKey = loadKey(guest);
  const g = new Account(guest, provider, guestKey.toString() as KeyPairString);
  const before = await balanceNear(guest);
  const status = await view<{ current_round: number | null }>(game, "get_status");
  const player = await view<{ pouch_claimed: boolean }>(game, "get_player", { account_id: guest });

  const calls = player.pouch_claimed ? [] : [actions.functionCall("claim_pouch", {}, teraToGas(30), 0n)];
  if (status.current_round !== null) calls.push(actions.functionCall("hit", { amount: (50n * ONE).toString() }, teraToGas(30), 0n));
  for (const call of calls) {
    // The guest signs a delegate action with its function-call key; the relayer wraps and pays.
    const { signedDelegate } = await g.createSignedMetaTransaction({ receiverId: game, actions: [call], blockHeightTtl: 120 });
    const res = await relayer.signAndSendTransaction({
      receiverId: guest,
      actions: [actions.signedDelegate({ delegateAction: signedDelegate.delegateAction, signature: signedDelegate.signature })],
    });
    console.log(`relayed ${call.functionCall?.methodName}: ${txHash(res)} ${gasBurntTgas(res)} TGas`);
    for (const l of txLogs(res)) console.log("  ", l.slice(0, 220));
    const failure = JSON.stringify(res).match(/"Failure":\{[^}]*\}/);
    if (failure) console.log("  FAILURE", failure[0]);
  }
  const p = await view<{ balance: string; pouch_claimed: boolean }>(game, "get_player", { account_id: guest });
  console.log(`guest SLAY ${BigInt(p.balance) / ONE}, pouch ${p.pouch_claimed}; guest NEAR before ${before}, after ${await balanceNear(guest)}`);
}

async function settle() {
  const t = account(tester);
  const status = await view<{ current_round: number | null; now: string }>(game, "get_status");
  if (status.current_round === null) throw new Error("no round to settle");
  const r = await view<RoundView>(game, "get_round", { round_id: status.current_round });
  const deadlineMs = Number(BigInt(r.deadline) / 1_000_000n);
  while (Date.now() < deadlineMs + 12_000) {
    console.log(`waiting ${Math.ceil((deadlineMs + 12_000 - Date.now()) / 1000)}s for the deadline and drand round ${r.target_drand_round}`);
    await sleep(Math.min(30_000, deadlineMs + 12_000 - Date.now()));
  }
  const round = BigInt(r.target_drand_round);
  const beacon = await fetchBeacon(round);
  console.log(`drand ${round}: ${beacon.signature.slice(0, 24)}..., randomness ${beacon.randomness.slice(0, 16)}...`);

  const attempt = async (label: string, args: Record<string, unknown>) => {
    try {
      const res = await t.callFunctionRaw({ contractId: game, methodName: "settle", args, gas: teraToGas(300) });
      console.log(`${label}: OK ${txHash(res)} ${gasBurntTgas(res)} TGas`);
      for (const l of txLogs(res)) if (l.includes('"event":"settle"')) console.log("  ", l);
      return true;
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      console.log(`${label}: rejected (${msg.match(/Smart contract panicked: [a-z_]+/)?.[0] ?? msg.slice(0, 200)})`);
      return false;
    }
  };
  if ((await balanceNear(tester)) < 1) {
    await account(root).transfer({ receiverId: tester, amount: nearToYocto("1") });
  }
  const flipped = beacon.signature.slice(0, -2) + (beacon.signature.endsWith("00") ? "01" : "00");
  const prev = await fetchBeacon(round - 1n);
  const n = Number(round);
  await attempt("tampered signature", { round_id: r.id, beacon_round: n, signature: flipped });
  await attempt("signature of another round", { round_id: r.id, beacon_round: n, signature: prev.signature });
  await attempt("wrong round number", { round_id: r.id, beacon_round: n - 1, signature: prev.signature });
  await attempt("real beacon", { round_id: r.id, beacon_round: n, signature: beacon.signature });
  const after = await view<RoundView>(game, "get_round", { round_id: r.id });
  console.log("settlement", JSON.stringify(after.settlement));
  console.log(`on-chain randomness equals sha256(signature): ${after.settlement?.randomness === beacon.randomness}`);
}

const cmd = process.argv[2];
const run = { setup, start, relay, settle }[cmd as "setup"];
if (!run) {
  console.error("usage: early-checks.ts setup|start|relay|settle [--game id]");
  process.exit(1);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
