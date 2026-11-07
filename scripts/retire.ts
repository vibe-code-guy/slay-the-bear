// Delete an unlocked development instance and send its NEAR back to the root account.
//   npx tsx scripts/retire.ts --game dev.slaythebear.testnet --confirm
import { unlinkSync, existsSync } from "node:fs";
import { account, arg, balanceNear, credentialsPath, deploymentPath, flag, provider, readDeployment } from "./lib/near";
import { stateBytes } from "./state-size";

async function main() {
  const game = arg("game");
  const root = arg("root", "slaythebear.testnet");
  if (!game.endsWith(`.${root}`)) throw new Error(`${game} is not under ${root}`);
  console.log(`${game} holds ${await balanceNear(game)} NEAR`);
  // NEAR refuses to delete an account whose storage, not counting its code, is over 10,000 bytes.
  const acc = (await provider.viewAccount({ accountId: game })) as unknown as { storage_usage: number };
  const wasm = existsSync(deploymentPath(game)) ? readDeployment(game).wasmBytes : 0;
  const data = wasm ? acc.storage_usage - wasm : await stateBytes(game);
  if (data > 10_000) {
    console.log(`${game} holds about ${data} bytes besides its code; NEAR only deletes accounts below 10,000. Leave it, or clear its state first.`);
    return;
  }
  if (!flag("confirm")) {
    console.log("dry run: pass --confirm to delete the account");
    return;
  }
  await account(game).deleteAccount(root);
  unlinkSync(credentialsPath(game));
  if (existsSync(deploymentPath(game))) unlinkSync(deploymentPath(game));
  console.log(`deleted ${game}; ${root} now has ${await balanceNear(root)} NEAR`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
