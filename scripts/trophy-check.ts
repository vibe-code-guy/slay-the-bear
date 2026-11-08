// Print every trophy that dropped on a game and its look, derived as the web app does it: from
// sha256(the raid's on-chain randomness ‖ "slay-trophy" ‖ raid ‖ drop). Anyone can run this.
//   npx tsx scripts/trophy-check.ts --game game.slaythebear.testnet
import type { RoundJson } from "../packages/rules/src/index";
import { trophyTraits } from "../apps/web/lib/trophy";
import { arg, view } from "./lib/near";

async function main() {
  const game = arg("game");
  let n = 0;
  for (let before: number | null = null; ; ) {
    const page: RoundJson[] = await view<RoundJson[]>(game, "get_rounds", { before_id: before, limit: 20 });
    for (const r of page) {
      const s = r.settlement;
      if (!s) continue;
      for (const d of s.drops) {
        if (!d.token_id.startsWith("trophy-")) continue;
        const t = trophyTraits(d.token_id, s.randomness);
        n++;
        console.log(`${d.token_id} → ${d.account}: ${t.name} (${t.grade}, ${t.marks} ${t.pattern}), seed ${t.seed.slice(0, 16)}…`);
      }
    }
    if (page.length < 20) break;
    before = page[page.length - 1]!.id;
  }
  console.log(`${n} trophies`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
