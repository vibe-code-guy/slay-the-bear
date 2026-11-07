// Delete an unlocked development instance and send its NEAR back to the root account.
//   npx tsx scripts/retire.ts --game dev.slaythebear.testnet --confirm
import { unlinkSync, existsSync } from "node:fs";
import { account, arg, balanceNear, credentialsPath, deploymentPath, flag } from "./lib/near";

async function main() {
  const game = arg("game");
  const root = arg("root", "slaythebear.testnet");
  if (!game.endsWith(`.${root}`)) throw new Error(`${game} is not under ${root}`);
  console.log(`${game} holds ${await balanceNear(game)} NEAR`);
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
