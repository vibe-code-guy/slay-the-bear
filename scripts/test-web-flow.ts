// End-to-end check of the web app's server routes against a running instance, doing exactly
// what the browser does: create a guest, sign delegate actions with the guest's key, relay them.
//   npx tsx scripts/test-web-flow.ts --url http://localhost:3123 --game dev3.slaythebear.testnet
import { Account, KeyPair, actions, encodeSignedDelegate, teraToGas, type KeyPairString } from "near-api-js";
import { arg, provider, sleep, view } from "./lib/near";

const url = arg("url", "http://localhost:3123");
const game = arg("game");
const ONE = 10n ** 18n;

async function post(path: string, body: unknown) {
  const res = await fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function signed(acc: Account, method: string, args: Record<string, unknown>, deposit = 0n) {
  const { signedDelegate } = await acc.createSignedMetaTransaction({
    receiverId: game,
    actions: [actions.functionCall(method, args, teraToGas(30), deposit)],
    blockHeightTtl: 120,
  });
  return Buffer.from(encodeSignedDelegate(signedDelegate)).toString("base64");
}

async function main() {
  const key = KeyPair.fromRandom("ed25519");
  const created = await post("/api/account", { publicKey: key.getPublicKey().toString() });
  console.log("account:", created.status, created.body);
  const id = created.body.accountId as string;
  if (!id) throw new Error("no account");
  for (let i = 0; i < 15; i++) {
    try {
      await provider.viewAccessKey({ accountId: id, publicKey: key.getPublicKey().toString() });
      break;
    } catch {
      await sleep(1000);
    }
  }
  const acc = new Account(id, provider, key.toString() as KeyPairString);

  const pouch = await post("/api/relay", { signedDelegate: await signed(acc, "claim_pouch", {}) });
  console.log("claim_pouch:", pouch.status, pouch.body);
  const hit = await post("/api/relay", { signedDelegate: await signed(acc, "hit", { amount: (20n * ONE).toString() }) });
  console.log("hit:", hit.status, hit.body);
  const again = await post("/api/relay", { signedDelegate: await signed(acc, "claim_pouch", {}) });
  console.log("second claim_pouch (should fail in the contract):", again.status, again.body);
  const transfer = await post("/api/relay", { signedDelegate: await signed(acc, "ft_transfer", { receiver_id: "bjorn.slaythebear.testnet", amount: "1" }, 1n) });
  console.log("ft_transfer (should be refused by the relayer):", transfer.status, transfer.body);
  const garbage = await post("/api/relay", { signedDelegate: "AAAA" });
  console.log("garbage (should be refused):", garbage.status, garbage.body);
  const badKey = await post("/api/account", { publicKey: "secp256k1:abc" });
  console.log("bad key (should be refused):", badKey.status, badKey.body);
  const tick = await post("/api/tick", {});
  console.log("tick:", tick.status, JSON.stringify(tick.body).slice(0, 600));

  const p = await view<{ balance: string; pouch_claimed: boolean }>(game, "get_player", { account_id: id });
  console.log(`guest ${id}: ${BigInt(p.balance) / ONE} SLAY, pouch ${p.pouch_claimed}`);

  // Several guests at once: account creation and relays in parallel.
  const burst = Number(arg("burst", "0"));
  if (burst > 0) {
    const keys = Array.from({ length: burst }, () => KeyPair.fromRandom("ed25519"));
    const made = await Promise.all(keys.map((k) => post("/api/account", { publicKey: k.getPublicKey().toString() })));
    console.log("burst accounts:", made.map((m) => `${m.status} ${(m.body.accountId as string) ?? m.body.error}`).join(" | "));
    await sleep(4000);
    const relays = await Promise.all(
      made
        .map((m, i) => ({ id: m.body.accountId as string | undefined, key: keys[i]! }))
        .filter((x) => x.id)
        .map(async ({ id, key }) => {
          const acc = new Account(id!, provider, key.toString() as KeyPairString);
          return post("/api/relay", { signedDelegate: await signed(acc, "claim_pouch", {}) });
        }),
    );
    console.log("burst relays:", relays.map((r) => `${r.status} ${r.body.ok ? "ok" : r.body.error}`).join(" | "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
