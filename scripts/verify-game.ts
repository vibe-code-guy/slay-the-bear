// Verify a whole Slay the Bear game from public data: every settled round is recomputed from
// the contract's views and the drand beacon, and the ledger identities are checked.
//   npm run verify:game -- --game game.slaythebear.testnet
// Exit code 0 only if everything passes.
import { Account } from "near-api-js";
import { GameClient } from "../packages/agents/src/index";
import { TACTIC_NAMES, verifyRound, type RoundJson, type Tactic } from "../packages/rules/src/index";
import { arg, provider, readDeployment } from "./lib/near";

const ONE = 10n ** 18n;
const slay = (v: bigint) => `${(v / ONE).toLocaleString("en-US")}.${((v % ONE) / 10n ** 14n).toString().padStart(4, "0")} SLAY`;
let fails = 0;
const line = (ok: boolean, text: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${text}`);
};

async function main() {
  const game = arg("game", process.env.GAME_ID ?? "game.slaythebear.testnet");
  const client = new GameClient(provider, game);
  const [config, status] = await Promise.all([client.config(), client.status()]);
  const acc = (await provider.viewAccount({ accountId: game })) as unknown as { code_hash: string };
  const keys = (await new Account(game, provider).getAccessKeyList()).keys;
  console.log(`Slay the Bear verifier: ${game}`);
  console.log(`  code hash ${acc.code_hash}`);
  try {
    const d = readDeployment(game);
    line(d.codeHash === acc.code_hash, `code hash matches deployments/${game}.json`);
  } catch {
    console.log("  (no deployments file to compare the code hash with)");
  }
  if (keys.length === 0) line(true, "the game account has no access keys: code and config are final");
  else console.log(`NOTE the game account still has ${keys.length} access key(s): an unlocked instance that its deployer can change`);

  // Every round, oldest first.
  const last = status.next_round_id - 1;
  const rounds: RoundJson[] = [];
  for (let before = last + 1; before > 1; ) {
    const page = await client.rounds(before, 50);
    if (page.length === 0) break;
    rounds.push(...page);
    before = page[page.length - 1]!.id;
  }
  rounds.sort((a, b) => a.id - b.id);
  console.log(`\n${rounds.length} round(s), ${rounds.filter((r) => r.settlement).length} settled`);
  for (const r of rounds) {
    if (!r.settlement) {
      console.log(`  ---- round ${r.id}: in progress`);
      continue;
    }
    const parts = await client.participants(r.id);
    const history = rounds.filter((x) => x.id < r.id).reverse();
    const v = verifyRound(config, r, parts, history);
    const failed = v.checks.filter((c) => !c.ok);
    line(
      v.ok,
      `round ${r.id}: ${r.settlement.outcome}, ${TACTIC_NAMES[r.settlement.tactic as Tactic]} (roll ${r.settlement.tactic_roll}), ${r.participants} raiders, ${v.checks.length} checks${failed.length ? `; failed: ${failed.map((c) => c.name).join(", ")}` : ""}`,
    );
  }

  // Ledger identities: what the rounds paid must be exactly what moved.
  console.log("\nledger");
  const minted = config.totalSupply;
  line(BigInt(status.total_supply) + BigInt(status.burned) === minted, `supply ${slay(BigInt(status.total_supply))} + burned ${slay(BigInt(status.burned))} = minted ${slay(minted)}`);
  const settled = rounds.filter((r) => r.settlement);
  const won = settled.filter((r) => r.settlement!.outcome === "win");
  const unclaimed = won.reduce((t, r) => t + BigInt(r.settlement!.reward) - BigInt(r.loot_claimed), 0n);
  line(BigInt(status.loot) === unclaimed, `loot chest ${slay(BigInt(status.loot))} = loot not yet claimed ${slay(unclaimed)}`);
  let treasury = config.treasuryInit - config.smith.initialFloat;
  for (const r of settled) {
    const s = r.settlement!;
    treasury -= s.outcome === "win" ? BigInt(s.reward) - BigInt(r.hoard_at_open) : BigInt(s.steal);
    treasury -= BigInt(s.tip);
  }
  line(BigInt(status.treasury) === treasury, `treasury ${slay(BigInt(status.treasury))} = start - rewards - thefts - tips (${slay(treasury)})`);
  let hoard = 0n;
  let hoardOk = true;
  for (const r of rounds) {
    if (BigInt(r.hoard_at_open) !== hoard) hoardOk = false;
    if (r.settlement) hoard = r.settlement.outcome === "win" ? 0n : hoard + BigInt(r.settlement.steal);
  }
  line(hoardOk && BigInt(status.hoard) === hoard, `the Bear's hoard ${slay(BigInt(status.hoard))} follows the raids (${slay(hoard)})`);

  console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAIL`}`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
