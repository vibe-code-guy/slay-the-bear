// Deploy a game instance to testnet.
//   npx tsx scripts/deploy.ts --root slaythebear.testnet --name demo --preset demo [--near 6]
//
// 1. root creates <name>.<root> with a fresh full-access key (saved to ~/.near-credentials).
// 2. Deploy and `new()` run in one transaction, so nobody can initialise the contract first.
// 3. The public facts (code hash, tx hashes) go to deployments/<game>.json.
// The Bear and the smith are rules inside the contract, so there are no NPC keys to create.
// Locking (deleting the game account's keys) is a separate step: scripts/lock.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KeyPair, actions, nearToYocto, teraToGas } from "near-api-js";
import { DEMO_CONFIG, QUICK_CONFIG, SEASON_CONFIG, describeConfig, toContractConfig } from "../packages/rules/src/index";
import {
  REPO_ROOT,
  account,
  accountExists,
  arg,
  balanceNear,
  codeHash,
  gasBurntTgas,
  hasKey,
  loadKey,
  saveKey,
  txHash,
  view,
  writeDeployment,
  type Deployment,
} from "./lib/near";

export const WASM = join(REPO_ROOT, "contracts", "game", "target", "near", "slay_game.wasm");

function keyFor(accountId: string): KeyPair {
  if (!hasKey(accountId)) saveKey(accountId, KeyPair.fromRandom("ed25519"));
  return loadKey(accountId);
}

async function main() {
  const root = arg("root", "slaythebear.testnet");
  const name = arg("name");
  const preset = arg("preset", "demo");
  const fund = arg("near", "6") as `${number}`;
  const game = `${name}.${root}`;
  const config = { season: SEASON_CONFIG, demo: DEMO_CONFIG, quick: QUICK_CONFIG }[preset];
  if (!config) throw new Error(`unknown preset ${preset}`);

  const wasm = readFileSync(WASM);
  console.log(`wasm ${wasm.length} bytes, code hash ${codeHash(wasm)}`);
  console.log(describeConfig(config));
  const txs: Record<string, string> = {};
  console.log(`${root} has ${await balanceNear(root)} NEAR`);

  if (!(await accountExists(game))) {
    const key = keyFor(game);
    const res = await account(root).signAndSendTransaction({
      receiverId: game,
      actions: [actions.createAccount(), actions.transfer(nearToYocto(fund)), actions.addFullAccessKey(key.getPublicKey())],
    });
    txs.createAccount = txHash(res);
    console.log(`created ${game} (${txs.createAccount})`);
  } else {
    console.log(`${game} exists`);
  }

  let initialised = false;
  try {
    await view(game, "get_ids");
    initialised = true;
  } catch {
    /* no contract yet */
  }
  if (!initialised) {
    const res = await account(game).signAndSendTransaction({
      receiverId: game,
      actions: [actions.deployContract(wasm), actions.functionCall("new", { config: toContractConfig(config) }, teraToGas(100), 0n)],
    });
    txs.deployAndInit = txHash(res);
    console.log(`deployed and initialised (${txs.deployAndInit}, ${gasBurntTgas(res)} TGas)`);
  } else {
    console.log("already initialised; nothing deployed");
  }

  const d: Deployment = {
    contractId: game,
    network: "testnet",
    preset,
    codeHash: codeHash(wasm),
    wasmBytes: wasm.length,
    deployedAt: new Date().toISOString(),
    deployer: root,
    txs,
    locked: false,
  };
  writeDeployment(d);
  console.log("ids", await view<Record<string, string>>(game, "get_ids"));
  console.log(`${game} has ${await balanceNear(game)} NEAR`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
