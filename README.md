# Slay the Bear

A memecoin and a town game in one NEAR contract, on testnet. Players burn $SLAY to hit the Bear
before a five-minute timer runs out. If the town's damage reaches the Bear's health, the raiders
split the Bear's hoard and a treasury reward by damage. If not, the Bear steals from the
treasury, and the next raid's jackpot is bigger.

Most memecoins have nothing to do, and on-chain games ask players to trust whoever rolls the
dice. Here every move is a NEAR transaction that the contract checks, and every random roll
comes from the public drand beacon, whose BLS signature the contract verifies itself. Anyone can
recompute any raid from public data.

Built at NEAR HACKATHON for the **Memecoins With Mechanics** (`memecoins`) and **Games With Real
Economies** (`games`) tracks.

![Raid 40 on game.slaythebear.testnet, played by a guest: the HUD with the hero's level, the game menu and the $SLAY counter; the timer and early bonus; the Bear's health bar with the win chance and a win/lose chip per tactic; the Bear in its Rage mood; the villagers in the plate, capes and crowns of their levels; the Wheel of Fate with the mood odds; today's goals and the hold-to-strike button](docs/img/town.png)

## Start here

| I want to | Do | See |
| --- | --- | --- |
| Play now, with nothing to install | Open [slay-the-bear.vercel.app](https://slay-the-bear.vercel.app) and press **Play as a guest (free)** | A testnet account with 1,000 $SLAY and no wallet. Hold the red **HOLD** button to strike the Bear. |
| Check that a raid was fair | Open [slay-the-bear.vercel.app/verify](https://slay-the-bear.vercel.app/verify) | The latest settled raid, recomputed in your browser from public data: 13 checks, all green. Type another raid number to check that one. |
| Play from a terminal, or let an AI agent play | Clone the repository, run `npm install`, then `./slay sim demo` | A whole raid, command by command. Add `--json` to any command for one JSON object. |
| Recheck every raid of the live game | `npm run verify:game` | One PASS line per raid (47 by 10 Nov 2026), four ledger identities, then `ALL PASS` |
| See how the economy behaves over months | Open [/fast-forward](https://slay-the-bear.vercel.app/fast-forward) and press **Run** | 90 days of raids, simulated in a second |
| Learn the rules | Read [How a raid works](#how-a-raid-works), or open [/rules](https://slay-the-bear.vercel.app/rules) | The four steps of a raid, and every number in the game's config |
| Read the code | Go to [Explore the code](#explore-the-code) | What each folder holds, and which file to open for each part |
| See what happened on testnet | Open [docs/TESTNET.md](docs/TESTNET.md) | Every deployment, transaction and raid result, with transaction hashes |

| Fact | Value |
| --- | --- |
| Hosted demo | [slay-the-bear.vercel.app](https://slay-the-bear.vercel.app), online through judging (until at least 25 Nov 2026) |
| Live contract (testnet) | [`game.slaythebear.testnet`](https://testnet.nearblocks.io/address/game.slaythebear.testnet) |
| Deployed code | A reproducible build of commit [`b9f0a5b`](https://github.com/vibe-code-guy/slay-the-bear/tree/b9f0a5b069b33442d04bb6c8e21fa92f3680d64a), code hash `BD2jeytgDSV5wAyhNEfieVoFg3oqx9vedWuXZusPqdzN` |
| Played so far | 47 raids by 10 Nov 2026, each one recomputed by `npm run verify:game` |
| Lock | Pending: the game account still holds one key ([lock status](#lock-status)) |
| Video | _to be added_ |

**Sections:** [Play in the browser](#play-in-the-browser) ·
[Play in a terminal](#play-in-a-terminal-people-and-ai-agents) ·
[Run from a clone](#run-and-check-it-from-a-clone) · [How a raid works](#how-a-raid-works) ·
[Check that a raid was fair](#check-that-a-raid-was-fair) · [Explore the code](#explore-the-code) ·
[How NEAR is used](#how-near-is-used) · [Track fit](#track-fit) ·
[Words used here](#words-used-here) · [Limits](#limits) · [Built with](#built-with)

## Play in the browser

Open [slay-the-bear.vercel.app](https://slay-the-bear.vercel.app). There is nothing to install.

| Do | See |
| --- | --- |
| Press **Play as a guest (free)** on the title screen | A new testnet account `p-xxxxxxxx.slaythebear.testnet`; 1,000 $SLAY fly into your coin counter. No wallet, no gas prompt. A five-step tutorial points at each control during your first raid. |
| Hold the red **HOLD** button and let go (or hold Space) | Your hero leans back in a growing glow while you hold; the longer you hold, the more $SLAY the strike burns, up to your **Max swing**. The hero lunges, the damage number flies off the Bear and turns final when the transaction lands. The toast links the transaction on nearblocks. |
| Watch the villagers (Bjorn, Fern, Sid, Sara) | NPC raiders charging in by their published rules, wearing the gear of their levels, with the **win chance** and the win/lose chip for each tactic updating after every hit. In the last ten seconds the Bear rears up and the scene's edges glow red. |
| When the timer ends, press **Spin the Wheel of Fate** | The wheel spins while the contract checks the drand signature, then stops on the roll (out of 10,000) that drew the Bear's tactic. On a win, a loot chest opens with the drops the beacon gave you and your share; a Bear trophy gets its own reveal. A level gained shows next, then your goals and achievements. If nobody spins, the keeper settles the raid within about a minute. |
| Press **Claim** | Your share of the loot flies to your coin counter. |
| In the **Tavern**, open **Past raids** and press **Verify** | 13 checks recomputed in your browser from the contract's views and the drand beacon, all green. |

Then explore the menu at the top of the town and the site's pages:

| Open | See |
| --- | --- |
| **Backpack** | Your hero and level, your $SLAY, weapon charges (pick the one to fight with), wood, iron and trophies |
| **Forge** | The three weapon recipes; forging burns the inputs |
| **Market** | Items players have put up for sale (the villagers sell trophies here); 2% of each sale is burned |
| **Smith** | Club charges for sale, and the prices the smith pays for wood and iron |
| **Trophies** | Every Bear trophy and who holds it |
| **Tavern** | The top slayers of the last 20 raids, the town feed, and past raids with **Verify** |
| **Guide** | The rules in a minute |
| The **Live / Offline** switch | The testnet town, or a simulation in your browser with the same rules and a local beacon |
| [/verify](https://slay-the-bear.vercel.app/verify) | Any settled raid, recomputed in your browser: 13 checks |
| [/rules](https://slay-the-bear.vercel.app/rules) | Every number in the game's config |
| [/fast-forward](https://slay-the-bear.vercel.app/fast-forward) | 90 days of raids, simulated in a second: win rate, longest Bear streak, health against damage, the hoard and the burn |

The scene only animates what the contract reports. The wheel's segments are the mood odds from
`get_config`, it stops at `roll / 10,000` of a turn after the settlement is on chain, the loot
chest shows the settlement's drops, and the levels, goals, achievements and **Top slayers** are
computed from the participants of the last 20 settled raids. Music is off until you press 🎵.

![The Trophy Hall on game.slaythebear.testnet: six Bear trophies, each a one-of-one NEP-245 token whose look (kind, element, grade, marks) comes from its raid's drand randomness; four are for sale by villagers, two were forged into Bear-slayers](docs/img/trophies.png)

## Play in a terminal (people and AI agents)

Clone the repository and run `npm install` (Node 22+). Then `./slay` (`.\slay` in PowerShell)
plays the same game: `slay sim` an offline town with the same rules engine, `slay live` the
testnet game. It prints plain text, or one JSON object with `--json`, and every output ends with
the moves that make sense next. Commands, the JSON and timing: [docs/CLI.md](docs/CLI.md).

| Do | See |
| --- | --- |
| `./slay help` | The rules in a minute and every command. |
| `./slay sim demo` | A whole offline raid, command by command: your hits, a villager joining, the beacon's tactic, the loot and 13 passing checks. |
| `./slay sim hit 300`, `./slay sim wait end`, `./slay sim settle`, `./slay sim verify` | Your own offline raid. The clock moves only when you `wait`. |
| `./slay live join`, then `./slay live hit 250` | A guest account on testnet, made through the hosted site's relayer, with its 1,000 $SLAY pouch; then a hit and its transaction on nearblocks. `--account you.testnet` plays as your own account instead. |
| `./slay live status --json` | The raid, you, the town and the suggested next moves, as one JSON object. |
| `./slay live verify --json` | The 13 checks of the last settled raid on `game.slaythebear.testnet`, as JSON. |

## Run and check it from a clone

Needs Node 22+, and Rust for the contract tests (`cargo-near` only to build the wasm). No keys
are needed.

```bash
npm install
npm test                     # 38 TypeScript tests: rules, simulator, verifier
npm run test:contract        # 16 Rust tests, including the TypeScript-to-Rust game replay
npm run verify:game          # recomputes every settled raid on game.slaythebear.testnet
npm run demo                 # the web app at http://localhost:3000
npm run simulate             # the economy simulation; open sim-out/report.html
```

| Do | See |
| --- | --- |
| `npm test` | `38 passed`: the rules engine, the simulator, the verifier and the drand checks. |
| `npm run test:contract` | `16 passed`, including a scripted game that the Rust contract replays and that must match the TypeScript rules exactly. |
| `npm run verify:game` | `PASS round 1: win, Rage (roll 7622), 2 raiders, 13 checks` and a line like it for every raid, then four ledger identities and `ALL PASS`. |
| `npm run demo`, open http://localhost:3000 | The live town, read straight from the testnet contract. Guest play needs the hosted site's relayer, so a clone shows "has no relayer" when you press Play. |
| In the demo, switch to **Offline**, press **Start the simulation**, strike, then **⏭** (to the deadline) and **Spin the Wheel of Fate** | A full raid with the same rules engine and a local beacon, villagers included. **Verify** under the Tavern's **Past raids** shows 13 green checks. |
| `npm run simulate`, then open `sim-out/report.html` | The 60-day economy simulation of four kinds of town that chose the game's numbers. |

## How a raid works

| Step | Rule | Where you see it |
| --- | --- | --- |
| 1. Open | The first hit opens a raid. The open fixes the Bear's health, its *mood* and the drand round that will decide the raid: the first one published after the deadline, plus 2. | The raid number, the timer and the health bar appear. `/verify`: "Deciding drand round fixed at the open". |
| 2. Hit | Burn 1 to 1,000 $SLAY. Damage = $SLAY × weapon (1.25x to 2x) × early bonus (1.5x at the open, 1.0x at the deadline). The last 10% of the raid counts as late. | The damage number on the Bear, the early bonus under the timer, the win chance per tactic. |
| 3. Settle | After the deadline, anyone submits the deciding drand beacon and earns 5 $SLAY. The contract checks the signature, then draws the Bear's tactic: its mood with 55%, each other tactic with 15%. **Armor** adds 20% health, **Rage** makes a theft 50% bigger, **Feint** halves late hits, **None** does nothing. | The Wheel of Fate stops on the roll. `/verify`: "drand signature is valid", "Tactic drawn from the beacon". |
| 4. Win or lose | On a win, the raiders split the hoard plus a treasury reward by damage, and the beacon picks three drops (wood, iron or a rare Bear trophy) weighted by damage. On a loss, the Bear steals from the treasury into its hoard. | The loot chest and your share, then **Claim**. On a loss, the hoard pile beside the Bear grows. |

**The Bear adapts.** After a win it gets 10% tougher, after a loss 15% weaker, and its mood
reacts to how the town fought (many late hits → Feint). Above a 500 $SLAY floor, its health
never exceeds the town's best raid of the last six, and only half its hoard adds to its health.
So a losing town always faces a beatable Bear guarding a growing jackpot. The numbers come from a
simulation of four kinds of town ([docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)).

**Around the raid:**

- Weapons, materials and trophies are NEP-245 items in the same contract. Players craft them
  (fees burned), trade them on a player market (2% burned) and sell materials to the smith.
- The smith is an NPC in the contract. Its prices move with its stock, and its forge runs at
  every raid's open.
- The villagers use the same moves with their own drops: they forge weapons when their charges
  run out, put trophies up at the market and sell spare wood and iron to the smith
  (`villagerTrade` in `packages/rules/src/npc.ts`).
- Each Bear trophy's look (kind, element, grade, marks) comes from its raid's drand randomness,
  so nobody picks it and anyone can recompute it (`scripts/trophy-check.ts`). The look is
  cosmetic: on-chain all trophies are equal.

![A loot chest after a won raid in the offline simulation: the drops the beacon gave the player and their share of the loot](docs/img/loot.png)

## Check that a raid was fair

| Claim | Do | See |
| --- | --- | --- |
| The random rolls are drand's: `settle` checks drand's BLS12-381 signature on-chain (NEP-488 host functions) | Open [/verify](https://slay-the-bear.vercel.app/verify) (the latest raid, or type any raid number) | "drand signature is valid" and "Randomness is sha256(signature)" pass. `./slay live verify` also prints the round's link at api.drand.sh. |
| Bad beacons are refused | Read [docs/TESTNET.md](docs/TESTNET.md#drand-verified-on-chain) | A real signature with one byte flipped, and a valid signature passed as another round, were both rejected on testnet. |
| Nobody knew the Bear's tactic while hits were allowed | On [/verify](https://slay-the-bear.vercel.app/verify), read the first check | "Deciding drand round fixed at the open: round N, published a few seconds after the deadline". The Bear and the smith are rules in the contract, with no keys. |
| Every number follows the rules | `npm run verify:game` | 13 checks per raid, recomputed from the contract's views with the TypeScript rules (pinned to the contract by shared test vectors), then supply + burned = minted, the loot chest, the treasury and the hoard, and `ALL PASS`. |
| The deployed code is this repository | `git checkout b9f0a5b`, `npm run build:contract:reproducible` (needs Docker), `git checkout main`, `npm run verify:live` | The deployed code hash equals your reproducible build of the commit named in the contract's NEP-330 metadata. |
| The rules can't change: no owner, no admin methods, config fixed at `new()` | `npm run verify:game`, first lines (or `near account list-keys game.slaythebear.testnet network-config testnet now`) | Today: one key remains, "an unlocked instance that its deployer can change". After the lock: none ([lock status](#lock-status)). |
| The server can't play for you | Open [a relayed hit](https://testnet.nearblocks.io/txns/7kPY8zsduPvap28pGEvHxrAbBVAqAnLNLkWcMB75UqKq) on nearblocks, then read `checkDelegate` in `apps/web/lib/server.ts` | The relayer (`slaythebear.testnet`) sent the transaction, but the move inside is a delegate action signed with the guest's own key. The relayer only passes on zero-deposit calls to game methods from guest accounts. |

Details and the remaining trust assumptions: [docs/FAIRNESS.md](docs/FAIRNESS.md) and
[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

![The /verify page recomputing raid 1 of game.slaythebear.testnet: 13 of 13 checks pass](docs/img/verify.png)

### Lock status

As of 10 Nov 2026, `game.slaythebear.testnet` still holds one full-access key, so its deployer
could still replace the code; `/verify` and `npm run verify:game` say so. The code was last
replaced on 10 Nov by a reproducible build of the same contract source, to update its source
link, and the state carried over ([docs/TESTNET.md](docs/TESTNET.md#instances)). Deleting the
key is permanent, so it waits for the owner: `npx tsx scripts/lock.ts --game
game.slaythebear.testnet --confirm` deletes it, and `/verify` then shows "no access keys".

## Explore the code

| Open | See |
| --- | --- |
| [`contracts/game/src/lib.rs`](contracts/game/src/lib.rs) | The contract's moves: `claim_pouch`, `hit`, `settle`, `claim`, `craft`, `list`, `buy`, `cancel`, `buy_from_smith`, `sell_to_smith` |
| [`contracts/game/src/drand.rs`](contracts/game/src/drand.rs) | drand's BLS signature checked on-chain: hash-to-curve, then a pairing check with NEAR's BLS12-381 host functions |
| [`contracts/game/src/rules.rs`](contracts/game/src/rules.rs) | Every formula: damage, the early bonus, the Bear's health and mood, the tactic draw, rewards and thefts |
| [`contracts/game/src/views.rs`](contracts/game/src/views.rs) | The views every client reads: `get_config`, `get_status`, `get_round`, `get_round_participants`, `get_player`, `get_feed`, `get_listings` |
| [`packages/rules/src/engine.ts`](packages/rules/src/engine.ts) | The same game in TypeScript, used by the simulator, the offline town and the verifier |
| [`fixtures/vectors.json`](fixtures/vectors.json), then `npm run test:contract` | One scripted game that both implementations replay and must agree on |
| [`packages/rules/src/verify.ts`](packages/rules/src/verify.ts) | The 13 checks that `/verify`, `npm run verify:game` and `slay verify` run |
| [`packages/rules/src/npc.ts`](packages/rules/src/npc.ts) | The NPC rules in words: the Bear's mood, the smith's prices, each villager's personality |
| [`packages/agents/src/keeper.ts`](packages/agents/src/keeper.ts), [`villagers.ts`](packages/agents/src/villagers.ts) | The keeper and the villagers, as they run on testnet |
| [`apps/web/lib/server.ts`](apps/web/lib/server.ts) | Guest creation and what the relayer accepts (`checkDelegate`) |
| [`apps/web/components/game/RaidScene.tsx`](apps/web/components/game/RaidScene.tsx) | The town scene: the Bear, the heroes, the damage numbers |
| [`packages/cli/src/commands.ts`](packages/cli/src/commands.ts) | The terminal client's commands, written once for the offline town and the testnet game |
| [`scripts/verify-game.ts`](scripts/verify-game.ts) | The whole-game verifier: every raid, then the four ledger identities |

| Folder | What |
| --- | --- |
| `contracts/game` | The Rust contract (near-sdk 5.30): $SLAY (NEP-141 + NEP-145), items (NEP-245), raids, drand verification, the Bear, the smith, the market, the feed, views |
| `packages/rules` | The same rules in TypeScript (bigint math): engine, NPC rules, the offline town, simulator, view JSON, verifier |
| `packages/agents` | The keeper (settles finished raids) and the villagers, used by the web app and `npm run agents` |
| `packages/cli` | `slay`, the terminal client ([docs/CLI.md](docs/CLI.md)) |
| `apps/web` | Next.js app: the town, `/verify`, `/rules`, `/fast-forward`, and the guest, relay and tick API routes |
| `scripts/` | Deploy, redeploy, lock, faucet, agents, end-to-end and UI checks, verifiers, simulation, test vectors |
| `fixtures/` | Real drand quicknet rounds and the TypeScript-to-Rust vectors |
| `deployments/` | Code hash and transactions of each testnet instance |
| `docs/` | [Game design](docs/GAME_DESIGN.md), [fairness](docs/FAIRNESS.md), [threat model](docs/THREAT_MODEL.md), [testnet log](docs/TESTNET.md), [deploying](docs/DEPLOY.md), [the terminal client](docs/CLI.md) |
| `llms.txt` | A short map of the project for AI agents |

<details>
<summary>Other commands</summary>

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Type-checks every package and the web app |
| `npm run fast-forward` | A week of raids in the terminal |
| `npm run vectors` | Regenerates the TypeScript-to-Rust test vectors |
| `npm run build:contract` | Builds the contract's wasm (cargo-near) |
| `npm run status -- --game <id>` | A game's state in the terminal |
| `npm run agents -- --game <id>` | Runs the keeper and the villagers (needs their keys) |
| `npm run test:ui -- --url <site> [--live]` | Drives a running site in headless Chrome |
| `npm run test:fit -- --url <site>` | Checks that the HUD, the scene and the strike button fit without scrolling at 12 window sizes, from a phone held sideways to a desktop |
| `npx tsx scripts/ui-game.ts`, `ui-tour.ts`, `ui-moods.ts`, `ui-readme.ts` | A raid, every panel, the Bear's moods and the README screenshots, in headless Chrome |

Running your own instance, relayer and hosted site: [docs/DEPLOY.md](docs/DEPLOY.md).

</details>

## How NEAR is used

| NEAR feature | Used for | See it |
| --- | --- | --- |
| NEP-141 fungible token, with NEP-145 storage management | $SLAY | [An `ft_transfer` of 1 $SLAY](https://testnet.nearblocks.io/txns/9pxjcQPktotSuqeJcz4nFca1cbvgu19hue3PJjq5MCvf) on the dev instance |
| NEP-245 multi-token | Weapon charges, wood, iron and the one-of-one Bear trophies, in the same contract | [An `mt_transfer` of a club charge](https://testnet.nearblocks.io/txns/CJksEJDuMgr6mK13UMhY9i87XStcVv2CkjQgNCypD62Z); the Trophy Hall |
| BLS12-381 host functions (NEP-488) | Checking each drand signature inside `settle` | [Raid 44's settlement](https://testnet.nearblocks.io/txns/EeGLwt7djnfiGKCoDbpsJ4XaVXZdXbwUh6wm5xncRBpe); `contracts/game/src/drand.rs` |
| Meta transactions (NEP-366) and function-call access keys | Gas-free guests: a key that can only call the game signs each move, and the relayer pays the gas | [A guest's hit relayed by the hosted site](https://testnet.nearblocks.io/txns/7kPY8zsduPvap28pGEvHxrAbBVAqAnLNLkWcMB75UqKq) |
| Sub-accounts | Guest accounts `p-xxxxxxxx.slaythebear.testnet`, created by the relayer in one transaction | [A guest's creation](https://testnet.nearblocks.io/txns/cGg8EUr9hF9MvVZfEzT5ZJBiHWatwM9dLPJ1yq9QRVU): account, 0.01 NEAR and the game-only key at once |
| NEP-297 events | Every move (hits, settlements, claims, crafting, trades) as `EVENT_JSON` logs; the site and the CLI read each hit's damage and each claim's payout from them | The logs of any of the transactions above |
| NEP-330 source metadata and reproducible builds | Proving that the deployed code is a given commit of this repository | `npm run verify:live` |
| Deleting the last access key | Making the contract unchangeable | Pending ([lock status](#lock-status)) |

## Track fit

**Memecoins With Mechanics.** Track hints used: memecoins, token mechanics, NEP-141.

- The mechanic is in the contract, not a backend. $SLAY (NEP-141) was minted once: 80% to the
  treasury and the smith, 20% to starter pouches, no team allocation.
- Every raid is a public ritual whose result moves supply. Hits, crafting, the smith and the
  market burn $SLAY: 117,722 $SLAY by raid 47 (`npm run verify:game`).
- The treasury pays out only by rule. The Bear's wallet grows when the community fails and is
  paid out when it succeeds.
- Every parameter is readable with `get_config` and on [/rules](https://slay-the-bear.vercel.app/rules),
  and a 60-day simulation of four community behaviours chose them
  ([docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)).

**Games With Real Economies.** Track hints used: agent NPCs, NEP-245, players who never notice
the chain. Not used: social login (guests cover sign-in) and NEAR Intents (mainnet only).

- NPCs with wallets act by rules in the contract: the Bear's hoard, the smith's float and stock.
- Villager NPCs play and trade as ordinary accounts. On testnet they have forged Bear-slayers
  from their trophies, put others up for sale and sold spare materials to the smith
  ([docs/TESTNET.md](docs/TESTNET.md#raids-10-to-38-the-villagers-trade-8-nov)).
- Players own their items (NEP-245), craft them, trade them on a player market and sell
  materials to the smith.
- The economy adjusts itself every raid, with no dev patch: the difficulty, the Bear's mood, the
  jackpot and the smith's prices.
- Guests never see a wallet or a gas prompt.

## Words used here

| Word | Meaning |
| --- | --- |
| $SLAY | The game's token (NEP-141). Testnet only, no value. Minted once: 1 billion. |
| Raid | One five-minute fight against the Bear. It opens with the first hit. |
| Hoard | The Bear's wallet. Its thefts go in, and the raiders of the next won raid get all of it. |
| Treasury | The contract's $SLAY reserve. It pays win rewards and settle tips, and the Bear steals from it. |
| Mood and tactic | The tactic is what the beacon draws at settlement: None, Armor, Rage or Feint. The mood is the tactic the Bear leans to: the beacon draws it 55% of the time. It follows from how the town fought the last raid (many late hits make it Feint). |
| Early bonus, late hits | A hit at the open deals 1.5x, falling to 1.0x at the deadline. Hits in the last 10% are late, and a Feint halves them. |
| Weapon charge | One charge per hit: club 1.25x, sword 1.5x, Bear-slayer 2x. Forged 10 at a time in the Forge (a Bear-slayer takes a trophy), and clubs are also sold by the smith. Without one you hit with bare paws, 1x. |
| Drops, trophies | Three drops per won raid, picked by the beacon weighted by damage: wood, iron, or (1 in 20) a one-of-one Bear trophy. |
| drand | A public randomness beacon run by the League of Entropy. Its quicknet chain publishes a BLS signature every 3 seconds; randomness = sha256(signature). |
| Settle, Wheel of Fate | Submitting the deciding drand round after the deadline. The contract checks it, then draws the tactic and the drops. |
| Keeper | A bot account that settles finished raids nobody has settled, 15 seconds after the beacon. |
| Villagers | Bjorn the Brave, Fern the Follower, Sid the Sniper and Sara the Saver: NPC accounts that hit, forge and trade by published rules. |
| Smith | An NPC in the contract. It sells club charges and buys wood and iron, at prices set by its stock. |
| Guest | A free testnet account `p-xxxxxxxx.slaythebear.testnet`. Its only key stays in your browser (or the CLI) and can only call the game. |
| Relayer | The hosted site's server account. It creates guests and pays the gas of their moves. |

## Limits

- **Testnet only.** $SLAY and the items have no value. This is not a gambling product: who wins a
  raid follows from damage, and the beacon only picks the tactic and the drops.
- **Relayer.** It can refuse to relay. Guests without NEAR depend on it; anyone with testnet NEAR
  can call the contract directly.
- **drand.** A threshold of League of Entropy members could predict a beacon together.
- **Validators.** A validator would have to hold block timestamps back by more than the 6-second
  margin to sneak in a hit with the beacon known.
- **Fake accounts.** Splitting $SLAY across accounts gains nothing in a raid, and pouches are
  capped at 200 a day, but a farmer can collect pouches within the cap.
- **Storage.** The contract pays for its state; anyone can top it up by sending it NEAR.
- **Not built:** NEAR Auth (Google or email) sign-in, NEAR wallet sign-in, mercenaries and a
  season-long leaderboard (the town ranks the last 20 raids). Guests and direct contract calls
  cover sign-in.

## Built with

near-sdk and near-contract-standards 5.30, cargo-near 0.22 (reproducible build image
`sourcescan/cargo-near:0.22.0-rust-1.99.1`), near-api-js 7.4, borsh, @noble/curves and
@noble/hashes 2.4 (BLS12-381 and SHA-256 in TypeScript), Next.js 16, React 19, Tailwind CSS 4,
ZzFX 1.4 (sound effects), the Web Audio API (the optional music), canvas-confetti 1.9, Vitest 5,
tsx, playwright-core (UI checks only), and the drand quicknet beacon run by the League of
Entropy. The town's art, items and trophies are hand-written SVG. The site is hosted on Vercel,
and a cron-job.org job calls its `/api/tick` every minute so finished raids settle when no page
is open.

## AI disclosure

Built with Kiro, an AI coding agent, which wrote the code, tests and docs under the author's
direction and review. Design decisions, testnet deployments and their results are recorded in
the commit history and [docs/TESTNET.md](docs/TESTNET.md).

## Hackathon window

All code here was written during NEAR HACKATHON: the history starts on 7 Nov 2026 (UTC), and
there is no earlier code base and no product on another chain.

## License

[MIT](LICENSE)
