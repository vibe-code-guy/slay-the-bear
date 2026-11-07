// Run the keeper and the villagers against a game, locally.
//   npx tsx scripts/agents.ts --game dev3.slaythebear.testnet [--once] [--interval 20] [--open-if-idle]
// Keys come from ~/.near-credentials/testnet (created by scripts/setup-npcs.ts).
import { GameClient, VILLAGERS, runTick, type Villager } from "../packages/agents/src/index";
import { account, arg, flag, hasKey, provider, sleep } from "./lib/near";

async function main() {
  const game = arg("game");
  const root = arg("root", "slaythebear.testnet");
  const interval = Number(arg("interval", "20")) * 1000;
  const client = new GameClient(provider, game);
  const keeperId = `keeper.${root}`;
  const keeper = hasKey(keeperId) ? account(keeperId) : undefined;
  const villagers: Villager[] = VILLAGERS.filter((v) => hasKey(`${v.prefix}.${root}`)).map((v) => ({
    name: v.name,
    personality: v.personality,
    account: account(`${v.prefix}.${root}`),
  }));
  console.log(`agents for ${game}: keeper ${keeper ? keeperId : "none"}, villagers ${villagers.map((v) => v.name).join(", ") || "none"}`);
  for (;;) {
    try {
      const logs = await runTick({ client, keeper, villagers, openIfIdle: flag("open-if-idle") });
      for (const l of logs) console.log(`${new Date().toISOString()} ${l.agent}: ${l.message}${l.tx ? ` (${l.tx})` : ""}`);
    } catch (e) {
      console.error(`${new Date().toISOString()} tick failed: ${(e as Error).message}`);
    }
    if (flag("once")) return;
    await sleep(interval);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
