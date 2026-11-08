// Print a game's on-chain status: code hash, keys, balances, current round. --drops also lists
// every settled raid's outcome and drops (trophies marked).
//   npx tsx scripts/status.ts --game dev2.slaythebear.testnet [--drops]
import { Account } from "near-api-js";
import type { RoundJson, StatusJson } from "../packages/rules/src/index";
import { arg, flag, provider, view } from "./lib/near";

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
  if (flag("drops")) {
    let trophies = 0;
    for (let before: number | null = null; ; ) {
      const page: RoundJson[] = await view<RoundJson[]>(game, "get_rounds", { before_id: before, limit: 20 });
      for (const r of page) {
        const s = r.settlement;
        if (!s) continue;
        const drops = s.drops.map((d) => `${d.qty} ${d.token_id}${d.token_id.startsWith("trophy-") ? " 🏆" : ""} → ${d.account.split(".")[0]}`);
        trophies += s.drops.filter((d) => d.token_id.startsWith("trophy-")).length;
        console.log(`  #${r.id} ${s.outcome}${drops.length ? `: ${drops.join(", ")}` : ""}`);
      }
      if (page.length < 20) break;
      before = page[page.length - 1]!.id;
    }
    console.log(`  ${trophies} trophy drop(s)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
