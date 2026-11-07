import type { Account } from "near-api-js";
import type { GameClient } from "./client";
import { keeperTick, type TickLog } from "./keeper";
import { villagerTick, type Villager } from "./villagers";

export * from "./client";
export * from "./keeper";
export * from "./villagers";

/** One pass of the town's helpers: settle a finished round, then let the villagers act. */
export async function runTick(deps: {
  client: GameClient;
  keeper?: Account;
  villagers?: Villager[];
  openIfIdle?: boolean;
}): Promise<TickLog[]> {
  const logs: TickLog[] = [];
  if (deps.keeper) logs.push(...(await keeperTick(deps.client, deps.keeper)));
  if (deps.villagers?.length) logs.push(...(await villagerTick(deps.client, deps.villagers, { openIfIdle: deps.openIfIdle })));
  return logs;
}
