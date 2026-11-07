// Print how much contract data an account holds (NEAR only deletes accounts below 10 kB).
//   npx tsx scripts/state-size.ts --game town.slaythebear.testnet
import { arg, provider } from "./lib/near";

export async function stateBytes(accountId: string): Promise<number> {
  const s = (await provider.viewContractState({ contractId: accountId, prefix: "" })) as unknown as {
    values?: { key: string; value: string }[];
  };
  return (s.values ?? []).reduce((t, v) => t + Buffer.from(v.key, "base64").length + Buffer.from(v.value, "base64").length + 40, 0);
}

if (process.argv[1]?.endsWith("state-size.ts")) {
  const game = arg("game");
  const acc = (await provider.viewAccount({ accountId: game })) as unknown as { storage_usage: number };
  console.log(`${game}: storage_usage ${acc.storage_usage} bytes, contract data about ${await stateBytes(game)} bytes`);
}
