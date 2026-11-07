// Top up a testnet account by creating temporary faucet accounts and deleting
// them with the target as beneficiary (no leftover accounts).
//   npx tsx scripts/faucet-topup.ts --to slaythebear.testnet --count 2
import { unlinkSync } from "node:fs";
import { KeyPair, type KeyPairString, Account } from "near-api-js";
import { FAUCET_URL, accountExists, arg, balanceNear, credentialsPath, provider, saveKey, sleep } from "./lib/near.js";

async function createTemp(accountId: string, keyPair: KeyPair): Promise<boolean> {
  const res = await fetch(FAUCET_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: keyPair.getPublicKey().toString() }),
    signal: AbortSignal.timeout(60_000),
  }).catch((e) => {
    console.log(`  faucet request failed: ${(e as Error).message}`);
    return undefined;
  });
  if (res) console.log(`  faucet HTTP ${res.status}`);
  for (let i = 0; i < 20; i++) {
    if (await accountExists(accountId)) return true;
    await sleep(3_000);
  }
  return false;
}

async function main() {
  const target = arg("to");
  const count = Number(arg("count", "1"));
  if (!(await accountExists(target))) throw new Error(`${target} does not exist`);
  console.log(`${target} starts with ${await balanceNear(target)} NEAR`);

  for (let n = 0; n < count; n++) {
    const tempId = `stb-tmp-${Date.now().toString(36)}${n}.testnet`;
    const keyPair = KeyPair.fromRandom("ed25519");
    saveKey(tempId, keyPair);
    console.log(`Creating ${tempId}`);
    if (!(await createTemp(tempId, keyPair))) {
      console.log(`  ${tempId} was not created; stopping`);
      break;
    }
    const temp = new Account(tempId, provider, keyPair.toString() as KeyPairString);
    await temp.deleteAccount(target);
    unlinkSync(credentialsPath(tempId));
    console.log(`  deleted ${tempId} into ${target}`);
    await sleep(2_000);
  }
  console.log(`${target} now has ${await balanceNear(target)} NEAR`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
