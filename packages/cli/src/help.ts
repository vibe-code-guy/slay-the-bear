// The help and the rules in words, for people and for agents deciding what to do next.
import { describeConfig, type GameConfig } from "@slay/rules";

export const HELP = `slay: play Slay the Bear from a terminal

  slay sim <command>    the offline town: the same rules engine as the contract, four villagers,
                        a keeper and a local test beacon. Nothing touches the network. Time
                        stands still between commands; \`wait\` moves it. Saved in .slay/sim.json.
  slay live <command>   the real game, game.slaythebear.testnet on NEAR testnet. Every move is a
                        transaction; the dice come from drand and the contract checks them.

THE GAME IN ONE MINUTE
  The Bear has health. Burn $SLAY to hit it before the raid's timer (5 minutes) runs out: damage
  is $SLAY x weapon (x1.25 club, x1.5 sword, x2 Bear-slayer) x an early bonus (x1.5 at the open,
  falling to x1.0). Hits in the last 10% of the raid are "late". When the timer ends, the drand
  beacon draws the Bear's tactic: its mood with 55%, each other tactic with 15%.
    None: nothing.  Armor: +20% health.  Rage: a theft is 50% bigger.  Feint: late hits count half.
  If the town's damage (after the tactic) reaches the Bear's health, the raiders split the loot
  (the Bear's hoard plus a treasury reward) by damage, and the beacon drops 3 items (wood, iron,
  or a rare one-of-one Bear trophy) by damage. If not, the Bear steals from the treasury and the
  next jackpot is bigger. Anyone can settle a finished raid once its beacon is out (5 $SLAY tip).
  Strategy: hit early, watch the win chance per tactic, and claim your loot.

COMMANDS (both modes)
  status                      the raid, you, the town, and what you can do next
  hit <amount> [--weapon w]   burn 1-1000 $SLAY to hit the Bear (the first hit opens a raid)
  wait <seconds|end>          let time pass; \`end\` waits until the raid's beacon is out
  settle [raid]               spin the Wheel of Fate: settle a finished raid with its drand beacon
  claim [raid]                collect your share of won raids (all of them by default)
  me                          your $SLAY, weapon charges, materials and trophies
  craft <club|sword|slayer>   forge 10 weapon charges (club: 2 wood + 10 $SLAY; sword: 2 wood +
                              3 iron + 50; Bear-slayer: 5 iron + a trophy + 200) [--trophy id]
  smith                       the smith's prices; \`smith buy <n>\` club charges,
                              \`smith sell <wood|iron> <n|all>\`
  market                      items for sale; \`sell <item> <qty> <price>\`, \`buy <listing> [qty]\`,
                              \`cancel <listing>\`
  feed [n]                    the town's last events in words
  raids                       past raids and how they went
  verify [raid]               recompute a settled raid from public data: 13 checks
  rules                       every number of this game's config

  slay sim new [--seed n] [--minutes m]   start a fresh offline town (replaces the saved one)
  slay sim demo                           play one whole raid in a scratch town, with commentary
  slay live join --site <url>             a free guest account through the hosted site's relayer
  slay live join --account <id.testnet>   or your own testnet account (key in ~/.near-credentials)
  slay live leave                         forget the local guest key (the account stays)

OPTIONS
  --json        one JSON object on stdout instead of text, for agents and scripts
  --home <dir>  where sessions are saved (default: .slay in the repository; or SLAY_HOME)
  --game <id>   live game contract (default game.slaythebear.testnet; or SLAY_GAME)
  --rpc <url>   NEAR RPC for live mode (default https://rpc.testnet.fastnear.com; or SLAY_RPC)

AN OFFLINE RAID, START TO END
  slay sim new          slay sim hit 300        slay sim wait 60       slay sim hit 200
  slay sim wait end     slay sim settle         slay sim claim         slay sim verify

Exit codes: 0 done; 1 the move failed or a check failed; 2 a usage error.`;

export function rulesText(c: GameConfig): string[] {
  return Object.entries(describeConfig(c)).map(([k, v]) => `  ${k}: ${v}`);
}
