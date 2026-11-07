// On-chain end-to-end run of the moves the unit tests cover, against an unlocked dev game:
// smith trade, crafting, the market, NEP-141 and NEP-245 transfers, and the special-account
// guards. Each step prints its tx hash and gas.
//   npx tsx scripts/e2e.ts --game dev3.slaythebear.testnet
import { teraToGas, type Account } from "near-api-js";
import type { PlayerJson, StatusJson } from "../packages/rules/src/index";
import { account, arg, gasBurntTgas, txHash, view } from "./lib/near";

const root = arg("root", "slaythebear.testnet");
const game = arg("game");
const ONE = 10n ** 18n;
let failures = 0;

async function step(label: string, who: Account, method: string, args: Record<string, unknown>, opts: { deposit?: bigint; expect?: string } = {}) {
  try {
    const res = await who.callFunctionRaw({ contractId: game, methodName: method, args, gas: teraToGas(60), deposit: opts.deposit ?? 0n });
    if (opts.expect) {
      failures++;
      console.log(`✗ ${label}: succeeded but should fail with ${opts.expect} (${txHash(res)})`);
    } else {
      console.log(`✓ ${label} (${txHash(res)}, ${gasBurntTgas(res)} TGas)`);
    }
  } catch (e) {
    const code = String((e as Error).message).match(/Smart contract panicked: ([a-z_]+)/)?.[1] ?? String((e as Error).message).slice(0, 160);
    if (opts.expect && code === opts.expect) console.log(`✓ ${label}: refused with ${code}`);
    else {
      failures++;
      console.log(`✗ ${label}: ${code}`);
    }
  }
}

const player = (id: string) => view<PlayerJson>(game, "get_player", { account_id: id });
const item = (p: PlayerJson, t: string) => BigInt(p.items.find(([x]) => x === t)?.[1] ?? "0");

async function main() {
  const tester = account(`tester.${root}`);
  const fern = account(`fern.${root}`);
  const bjorn = account(`bjorn.${root}`);
  const ids = await view<Record<string, string>>(game, "get_ids");

  if (!(await player(tester.accountId)).pouch_claimed) await step("tester claims a pouch", tester, "claim_pouch", {});
  await step("tester claims a second pouch", tester, "claim_pouch", {}, { expect: "pouch_already_claimed" });

  // Smith: buy clubs, sell materials.
  const st = await view<StatusJson>(game, "get_status");
  console.log(`  smith: ${st.smith_clubs} clubs at ${Number(BigInt(st.club_price) * 100n / ONE) / 100} SLAY, wood ${st.smith_wood}, iron ${st.smith_iron}`);
  await step("tester buys 3 clubs from the smith", tester, "buy_from_smith", { qty: "3" });
  await step("tester sells a club to the smith", tester, "sell_to_smith", { token_id: "club", qty: "1" }, { expect: "smith_only_buys_materials" });
  const f = await player(fern.accountId);
  if (item(f, "iron") > 0n) await step(`fern sells ${item(f, "iron")} iron to the smith`, fern, "sell_to_smith", { token_id: "iron", qty: item(f, "iron").toString() });

  // Crafting.
  if (item(f, "wood") >= 2n) await step("fern crafts 10 club charges from 2 wood", fern, "craft", { recipe_id: "club" });
  await step("tester crafts a sword without materials", tester, "craft", { recipe_id: "sword" }, { expect: "need_wood" });
  await step("tester crafts a slayer without a trophy", tester, "craft", { recipe_id: "slayer" }, { expect: "need_trophy" });

  // Market.
  const before = BigInt((await view<StatusJson>(game, "get_status")).listings);
  await step("tester lists 2 clubs at 4 SLAY", tester, "list", { token_id: "club", qty: "2", price: (4n * ONE).toString() });
  const listings = await view<{ id: number; seller: string }[]>(game, "get_listings", {});
  const mine = listings.filter((l) => l.seller === tester.accountId).pop();
  console.log(`  listings ${before} -> ${listings.length}`);
  if (mine) {
    await step("tester buys own listing", tester, "buy", { listing_id: mine.id, qty: "1" }, { expect: "own_listing" });
    await step("bjorn buys 1 club from the listing", bjorn, "buy", { listing_id: mine.id, qty: "1" });
    await step("bjorn cancels tester's listing", bjorn, "cancel", { listing_id: mine.id }, { expect: "not_seller" });
    await step("tester cancels the rest", tester, "cancel", { listing_id: mine.id });
  }

  // Standards.
  await step("tester sends 1 SLAY to bjorn (ft_transfer)", tester, "ft_transfer", { receiver_id: bjorn.accountId, amount: ONE.toString() }, { deposit: 1n });
  await step("tester sends SLAY to the Bear", tester, "ft_transfer", { receiver_id: ids.bear, amount: ONE.toString() }, { deposit: 1n, expect: "special_account" });
  await step("tester sends a club to bjorn (mt_transfer)", tester, "mt_transfer", { receiver_id: bjorn.accountId, token_id: "club", amount: "1" }, { deposit: 1n });
  await step("tester sends a club to the market account", tester, "mt_transfer", { receiver_id: ids.market, token_id: "club", amount: "1" }, { deposit: 1n, expect: "special_account" });

  const t = await player(tester.accountId);
  console.log(`  tester: ${BigInt(t.balance) / ONE} SLAY, items ${JSON.stringify(t.items)}`);
  const ft = await view<string>(game, "ft_balance_of", { account_id: tester.accountId });
  const mt = await view<string>(game, "mt_balance_of", { account_id: tester.accountId, token_id: "club" });
  console.log(`  ft_balance_of ${BigInt(ft) / ONE} SLAY, mt_balance_of club ${mt}`);
  console.log(failures ? `${failures} step(s) failed` : "all steps passed");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
