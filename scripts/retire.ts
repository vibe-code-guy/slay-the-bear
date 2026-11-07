// Delete an unlocked development instance and send its NEAR back to the root account.
//   npx tsx scripts/retire.ts --game dev.slaythebear.testnet --confirm
import { unlinkSync, existsSync } from "node:fs";
import { account, arg, balanceNear, credentialsPath, deploymentPath, flag, provider } from "./lib/near";

async function main() {
  const game = arg("game");
  const root = arg("root", "slaythebear.testnet");
  if (!game.endsWith(`.${root}`)) throw new Error(`${game} is not under ${root}`);
  console.log(`${game} holds ${await balanceNear(game)} NEAR`);
  // NEAR refuses to delete an account whose contract data is over 10 kB.
  const state = await provider.viewContractState({ accountId: game, prefix: "" }).catch(() => null);
  const bytes = (state as { values?: { key: string; value: string }[] } | null)?.values?.reduce((t, v) => t + v.key.length + v.value.length, 0) ?? 0;
  if (bytes > 10_000 * 1.3) {
    console.log(`${game} holds about ${Math.round((bytes * 3) / 4 / 1000)} kB of contract data; NEAR only deletes accounts below 10 kB. Leave it, or clear its state first.`);
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
