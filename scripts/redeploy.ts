// Replace the code of an existing, unlocked game instance and keep its state: for a new build of
// the same contract source, e.g. one whose embedded NEP-330 source link changed. The game
// account signs with its own key from ~/.near-credentials. Without --confirm it only reports.
//   npx tsx scripts/redeploy.ts --game game.slaythebear.testnet [--wasm path] [--confirm]
// Afterwards it checks that the new code is live and that the game's state reads the same, then
// records the new code hash in deployments/<game>.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Account, actions } from "near-api-js";
import type { StatusJson } from "../packages/rules/src/index";
import { REPO_ROOT, account, arg, codeHash, flag, gasBurntTgas, provider, readDeployment, txHash, view, writeDeployment } from "./lib/near";

interface SourceMetadata {
  link?: string;
  build_info?: { source_code_snapshot?: string };
}

/** What a reader would compare before and after: the parts of the state a code swap must not touch. */
async function fingerprint(game: string) {
  const s = await view<StatusJson>(game, "get_status");
  return JSON.stringify([s.next_round_id, s.current_round, s.total_supply, s.burned, s.treasury, s.hoard, s.player_supply, s.listings]);
}

async function main() {
  const game = arg("game");
  const wasmPath = arg("wasm", join(REPO_ROOT, "contracts", "game", "target", "near", "slay_game.wasm"));
  const wasm = readFileSync(wasmPath);
  const next = codeHash(wasm);
  // the source links compiled into the new code
  const links = [...new Set(wasm.toString("latin1").match(/https:\/\/github\.com\/[A-Za-z0-9._\/?=+-]+/g) ?? [])];
  console.log(`new wasm ${wasm.length} bytes, code hash ${next}`);
  console.log(`  source links inside: ${links.join(", ") || "none"}`);

  const before = (await provider.viewAccount({ accountId: game })) as unknown as { code_hash: string };
  const keys = (await new Account(game, provider).getAccessKeyList()).keys;
  console.log(`${game} runs ${before.code_hash}, ${keys.length} access key(s)`);
  if (before.code_hash === next) return console.log("already running this build; nothing to do");
  if (keys.length === 0) throw new Error(`${game} is locked: nobody can replace its code`);
  await view(game, "get_ids"); // throws if there is no initialised contract to keep
  const state = await fingerprint(game);
  console.log(`  state ${state}`);
  if (!flag("confirm")) return console.log("dry run: add --confirm to deploy");

  const res = await account(game).signAndSendTransaction({ receiverId: game, actions: [actions.deployContract(wasm)] });
  const tx = txHash(res);
  console.log(`deployed (${tx}, ${gasBurntTgas(res)} TGas)`);

  const after = (await provider.viewAccount({ accountId: game })) as unknown as { code_hash: string };
  if (after.code_hash !== next) throw new Error(`expected code ${next}, the account runs ${after.code_hash}`);
  const meta = await view<SourceMetadata>(game, "contract_source_metadata");
  console.log(`  NEP-330 link ${meta.link}, snapshot ${meta.build_info?.source_code_snapshot ?? "none"}`);
  const stateAfter = await fingerprint(game);
  if (stateAfter !== state) throw new Error(`state changed: ${state} -> ${stateAfter}`);
  console.log("  state reads the same");

  const d = readDeployment(game);
  d.previousCodeHashes = [...(d.previousCodeHashes ?? []), d.codeHash];
  d.codeHash = next;
  d.wasmBytes = wasm.length;
  d.redeployedAt = new Date().toISOString();
  d.txs = { ...d.txs, [`redeploy${d.previousCodeHashes.length}`]: tx };
  writeDeployment(d);
  console.log(`updated deployments/${game}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
