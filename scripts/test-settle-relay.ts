// A guest settles a finished raid through the relayer, exactly as the "Settle with the drand
// beacon" button does: fetch the deciding beacon, sign `settle` with the guest's key, relay it.
//   npx tsx scripts/test-settle-relay.ts --url http://localhost:3123 --game game.slaythebear.testnet
import { Account, KeyPair, actions, encodeSignedDelegate, teraToGas, type KeyPairString } from "near-api-js";
import { fetchBeacon, roundTime, type RoundJson, type StatusJson } from "../packages/rules/src/index";
import { arg, provider, sleep, view } from "./lib/near";

const url = arg("url", "http://localhost:3123");
const game = arg("game");

async function post(path: string, body: unknown) {
  const res = await fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function relay(acc: Account, method: string, args: Record<string, unknown>, tgas: number) {
  const { signedDelegate } = await acc.createSignedMetaTransaction({
    receiverId: game,
    actions: [actions.functionCall(method, args, teraToGas(tgas), 0n)],
    blockHeightTtl: 120,
  });
  return post("/api/relay", { signedDelegate: Buffer.from(encodeSignedDelegate(signedDelegate)).toString("base64") });
}

async function main() {
  const status = await view<StatusJson>(game, "get_status");
  if (status.current_round === null) throw new Error("no raid in progress to settle");
  const r = await view<RoundJson>(game, "get_round", { round_id: status.current_round });
  const key = KeyPair.fromRandom("ed25519");
  const made = await post("/api/account", { publicKey: key.getPublicKey().toString() });
  const id = made.body.accountId as string;
  console.log(`guest ${id}`);
  await sleep(4000);
  const acc = new Account(id, provider, key.toString() as KeyPairString);
  const beaconAt = Number(roundTime(BigInt(r.target_drand_round))) * 1000 + 2000;
  while (Date.now() < beaconAt) {
    console.log(`raid ${r.id}: waiting ${Math.ceil((beaconAt - Date.now()) / 1000)} s for drand round ${r.target_drand_round}`);
    await sleep(Math.min(30_000, beaconAt - Date.now()));
  }
  const beacon = await fetchBeacon(BigInt(r.target_drand_round));
  const res = await relay(acc, "settle", { round_id: r.id, beacon_round: Number(r.target_drand_round), signature: beacon.signature }, 150);
  console.log(`relayed settle: HTTP ${res.status}`, res.body);
  const after = await view<RoundJson>(game, "get_round", { round_id: r.id });
  console.log(`raid ${r.id}: ${after.settlement?.outcome}, tactic ${after.settlement?.tactic} (roll ${after.settlement?.tactic_roll}), settled by ${after.settlement?.settler}, tip ${after.settlement?.tip}`);
  const p = await view<{ balance: string }>(game, "get_player", { account_id: id });
  console.log(`guest balance after the tip: ${BigInt(p.balance) / 10n ** 18n} SLAY`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
