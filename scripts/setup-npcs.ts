// Create the keeper and villager accounts (ordinary testnet accounts under the root), each
// with a full-access key in ~/.near-credentials and a little NEAR for gas.
//   npx tsx scripts/setup-npcs.ts [--root slaythebear.testnet] [--near 0.5]
import { KeyPair, actions, nearToYocto } from "near-api-js";
import { VILLAGERS } from "../packages/agents/src/index";
import { account, accountExists, arg, balanceNear, hasKey, loadKey, saveKey } from "./lib/near";

async function main() {
  const root = arg("root", "slaythebear.testnet");
  const fund = arg("near", "0.5") as `${number}`;
  const rootAcc = account(root);
  for (const prefix of ["keeper", ...VILLAGERS.map((v) => v.prefix)]) {
    const id = `${prefix}.${root}`;
    if (await accountExists(id)) {
      console.log(`${id} exists (${await balanceNear(id)} NEAR)`);
      continue;
    }
    if (!hasKey(id)) saveKey(id, KeyPair.fromRandom("ed25519"));
    await rootAcc.signAndSendTransaction({
      receiverId: id,
      actions: [actions.createAccount(), actions.transfer(nearToYocto(fund)), actions.addFullAccessKey(loadKey(id).getPublicKey())],
    });
    console.log(`created ${id} with ${fund} NEAR`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
