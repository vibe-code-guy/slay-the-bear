// Create a throwaway testnet account through the public faucet helper.
//   npx tsx scripts/faucet-account.ts --account mygame.testnet
// The key is written to ~/.near-credentials/testnet before the faucet call so
// it is never lost, even if the faucet response times out.
import { KeyPair } from "near-api-js";
import { FAUCET_URL, accountExists, arg, balanceNear, credentialsPath, hasKey, loadKey, saveKey, sleep } from "./lib/near.js";

async function main() {
  const accountId = arg("account");
  if (!accountId.endsWith(".testnet")) throw new Error("Faucet accounts must end with .testnet");

  if (await accountExists(accountId)) {
    console.log(`${accountId} already exists, balance ${await balanceNear(accountId)} NEAR`);
    return;
  }

  let keyPair: KeyPair;
  if (hasKey(accountId)) {
    keyPair = loadKey(accountId);
    console.log(`Reusing saved key ${credentialsPath(accountId)}`);
  } else {
    keyPair = KeyPair.fromRandom("ed25519");
    console.log(`Saved key to ${saveKey(accountId, keyPair)}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(FAUCET_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: keyPair.getPublicKey().toString() }),
      signal: controller.signal,
    });
    const text = await res.text();
    console.log(`Faucet HTTP ${res.status}: ${text.slice(0, 300)}`);
  } catch (e) {
    console.log(`Faucet request failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  for (let i = 0; i < 20; i++) {
    if (await accountExists(accountId)) {
      console.log(`Created ${accountId}, balance ${await balanceNear(accountId)} NEAR`);
      return;
    }
    await sleep(3_000);
  }
  console.log(`${accountId} still does not exist`);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
