// Check that a deployed game runs the code in this repository, and that nobody can change it.
//   npm run verify:live -- --game game.slaythebear.testnet [--wasm contracts/game/target/near/slay_game.wasm]
// Build the wasm first with `cargo near build reproducible-wasm` (in contracts/game) to compare
// against a reproducible build of the current commit.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Account } from "near-api-js";
import { QUICK_CONFIG, DEMO_CONFIG, SEASON_CONFIG, fromContractConfig, toContractConfig, type ContractConfig } from "../packages/rules/src/index";
import { REPO_ROOT, arg, codeHash, provider, view } from "./lib/near";

let fails = 0;
const line = (ok: boolean, text: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${text}`);
};

async function main() {
  const game = arg("game", process.env.GAME_ID ?? "game.slaythebear.testnet");
  const wasmPath = arg("wasm", join(REPO_ROOT, "contracts", "game", "target", "near", "slay_game.wasm"));
  const acc = (await provider.viewAccount({ accountId: game })) as unknown as { code_hash: string };
  console.log(`${game} runs code ${acc.code_hash}`);
  if (existsSync(wasmPath)) {
    const local = codeHash(readFileSync(wasmPath));
    line(local === acc.code_hash, `local build ${wasmPath.replace(REPO_ROOT, ".")} has hash ${local}`);
  } else {
    console.log(`NOTE no local wasm at ${wasmPath}; build it to compare`);
  }
  try {
    const meta = await view<Record<string, unknown>>(game, "contract_source_metadata");
    console.log(`  NEP-330 source metadata: ${JSON.stringify(meta)}`);
  } catch {
    console.log("  (no NEP-330 contract_source_metadata view)");
  }
  const keys = (await new Account(game, provider).getAccessKeyList()).keys;
  line(keys.length === 0, `access keys on the game account: ${keys.length} (0 means nobody can redeploy, upgrade or sign for it)`);

  const cfg = await view<ContractConfig>(game, "get_config");
  const normalize = (c: ContractConfig) => JSON.stringify(toContractConfig(fromContractConfig(c)));
  const presets = { quick: QUICK_CONFIG, demo: DEMO_CONFIG, season: SEASON_CONFIG };
  const match = Object.entries(presets).find(([, p]) => normalize(cfg) === JSON.stringify(toContractConfig(p)));
  line(!!match, match ? `config is the published "${match[0]}" preset in packages/rules/src/config.ts` : "config matches no published preset");
  console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAIL`}`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
