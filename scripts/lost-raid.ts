// Play a raid the town loses, on purpose: one 1-$SLAY hit, then settle with the drand beacon
// once the deadline has passed. Shows the Bear's theft on-chain.
//   npx tsx scripts/lost-raid.ts --game game.slaythebear.testnet
import { teraToGas } from "near-api-js";
import { GameClient, keeperTick } from "../packages/agents/src/index";
import type { PlayerJson } from "../packages/rules/src/index";
import { account, arg, provider, sleep, txHash, view } from "./lib/near";

const game = arg("game");
const root = arg("root", "slaythebear.testnet");
const ONE = 10n ** 18n;

async function main() {
  const client = new GameClient(provider, game);
  const tester = account(`tester.${root}`);
  const keeper = account(`keeper.${root}`);
  const p = await view<PlayerJson>(game, "get_player", { account_id: tester.accountId });
  if (!p.pouch_claimed) await tester.callFunctionRaw({ contractId: game, methodName: "claim_pouch", args: {}, gas: teraToGas(30) });
  const status = await client.status();
  if (status.current_round !== null) throw new Error(`raid ${status.current_round} is still running; settle it first`);
  const hit = await tester.callFunctionRaw({ contractId: game, methodName: "hit", args: { amount: ONE.toString() }, gas: teraToGas(30) });
  const id = (await client.status()).current_round!;
  const r = (await client.round(id))!;
  console.log(`raid ${id} opened by a 1 $SLAY hit (${txHash(hit)}); health ${BigInt(r.health) / ONE}, mood ${r.mood}`);
  for (;;) {
    const logs = await keeperTick(client, keeper);
    for (const l of logs) console.log(`  ${l.agent}: ${l.message}${l.tx ? ` (${l.tx})` : ""}`);
    const now = (await client.round(id))!;
    if (now.settlement) {
      const s = now.settlement;
      console.log(`raid ${id}: ${s.outcome}; the beacon drew tactic ${s.tactic} (roll ${s.tactic_roll}); the Bear stole ${BigInt(s.steal) / ONE} $SLAY`);
      console.log(`the Bear's hoard is now ${BigInt((await client.status()).hoard) / ONE} $SLAY`);
      return;
    }
    await sleep(20_000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
