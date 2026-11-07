// Print a game's on-chain status: code hash, keys, balances, current round.
//   npx tsx scripts/status.ts --game dev2.slaythebear.testnet
import { Account } from "near-api-js";
import type { RoundJson, StatusJson } from "../packages/rules/src/index";
import { arg, provider, view } from "./lib/near";

const ONE = 10n ** 18n;
const slay = (v: string) => `${(BigInt(v) / ONE).toLocaleString("en-US")} SLAY`;

async function main() {
  const game = arg("game");
  const acc = (await provider.viewAccount({ accountId: game })) as unknown as { code_hash: string; amount: string; storage_usage: number };
  const keys = (await new Account(game, provider).getAccessKeyList()).keys;
  const st = await view<StatusJson>(game, "get_status");
  console.log(`${game}`);
  console.log(`  code hash ${acc.code_hash}, ${keys.length} access key(s), storage ${acc.storage_usage} bytes, ${Number(BigInt(acc.amount) / 10n ** 21n) / 1000} NEAR`);
  console.log(`  supply ${slay(st.total_supply)}, burned ${slay(st.burned)}, players hold ${slay(st.player_supply)}`);
  console.log(`  treasury ${slay(st.treasury)}, pouches left ${slay(st.reserve)}, Bear's hoard ${slay(st.hoard)}, smith ${slay(st.smith_balance)} with ${st.smith_clubs} clubs`);
  console.log(`  next round ${st.next_round_id}, current ${st.current_round ?? "none"}, next mood ${st.next_mood}`);
  if (st.current_round !== null) {
    const r = await view<RoundJson>(game, "get_round", { round_id: st.current_round });
    const left = Number(BigInt(r.deadline) / 1_000_000n) - Date.now();
    console.log(`  round ${r.id}: health ${slay(r.health)}, damage ${slay((BigInt(r.total_early) + BigInt(r.total_late)).toString())}, ${r.participants} raiders, mood ${r.mood} ${JSON.stringify(r.mood_weights)}, ${Math.round(left / 1000)}s left, drand ${r.target_drand_round}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
