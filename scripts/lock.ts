// Lock a deployed game for good: delete every access key on the game account.
//   npx tsx scripts/lock.ts --game demo.slaythebear.testnet --confirm
//
// Afterwards nobody, the deployer included, can redeploy, upgrade, migrate, pause or sign for
// the game account. Its code and config can never change. This cannot be undone, so the
// script refuses to run without --confirm and checks the on-chain code first.
import { Account, actions } from "near-api-js";
import { account, arg, flag, provider, readDeployment, txHash, writeDeployment } from "./lib/near";

async function main() {
  const game = arg("game");
  const d = readDeployment(game);
  const onChain = (await provider.viewAccount({ accountId: game })) as unknown as { code_hash: string };
  if (onChain.code_hash !== d.codeHash) {
    throw new Error(`code hash on chain ${onChain.code_hash} differs from deployments/${game}.json ${d.codeHash}`);
  }
  const keys = (await new Account(game, provider).getAccessKeyList()).keys;
  console.log(`${game} runs code ${onChain.code_hash} and has ${keys.length} access key(s):`);
  for (const k of keys) console.log(`  ${k.public_key} ${JSON.stringify(k.access_key.permission)}`);
  if (keys.length === 0) {
    console.log("already locked");
    return;
  }
  if (!flag("confirm")) {
    console.log("dry run: pass --confirm to delete these keys. This cannot be undone.");
    return;
  }
  const res = await account(game).signAndSendTransaction({
    receiverId: game,
    actions: keys.map((k) => actions.deleteKey(k.public_key as never)),
  });
  const left = (await new Account(game, provider).getAccessKeyList()).keys;
  if (left.length !== 0) throw new Error(`${left.length} key(s) still on ${game}`);
  d.locked = true;
  d.lockedAt = new Date().toISOString();
  d.txs.lock = txHash(res);
  writeDeployment(d);
  console.log(`locked ${game} (${d.txs.lock}); it has no access keys left`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
