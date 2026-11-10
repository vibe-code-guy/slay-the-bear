# Playing from a terminal

`slay` plays Slay the Bear from a terminal, for people and for AI agents. It has two modes with
the same commands:

- **`slay sim`** plays an offline town: the contract's rules in TypeScript (`packages/rules`),
  four villagers, a keeper and a local test beacon. It needs no network and no keys.
- **`slay live`** plays the real game, `game.slaythebear.testnet` on NEAR testnet. Every move is
  a transaction the contract checks, and every roll comes from the drand beacon, whose signature
  the contract verifies.

Each command prints plain text, or one JSON object with `--json`, and ends with the moves that
make sense next.

## Run it

Needs Node 22+ and a clone with `npm install`. There is no build step: the wrapper runs the
TypeScript through tsx.

| Shell | Run |
| --- | --- |
| macOS, Linux, Git Bash | `./slay help` |
| PowerShell, cmd | `.\slay help` |
| Any shell | `npx slay help` |

The output is plain ASCII, so it reads the same in every terminal. Scripts and agents should
call the wrappers, because `npx` can mix npm's progress spinner into the output.

## Offline: a raid in a minute

`./slay sim demo` plays one whole raid in a scratch town and prints every command with its
output ([abridged below](#the-demo-abridged)). To play one yourself:

```bash
./slay sim new --seed 42   # a fresh town; you join with a 1,000 $SLAY starter pouch
./slay sim hit 300         # burn 300 $SLAY; the first hit opens a 5-minute raid
./slay sim wait 60         # the clock moves only when you wait; the villagers act meanwhile
./slay sim hit 200         # earlier hits deal more: x1.5 at the open, x1.0 at the deadline
./slay sim wait end        # to the end of the raid, once its drand round is out
./slay sim settle          # spin the Wheel of Fate: the beacon draws the Bear's tactic
./slay sim claim           # collect your share if the town won
./slay sim verify          # recompute the raid from public data: 13 checks
```

If no town is saved, the first command starts one with a random seed.

## Live on NEAR testnet

Join once, as a free guest or with your own testnet account:

| Join as | Run | What happens |
| --- | --- | --- |
| A guest | `./slay live join --site <hosted demo URL>` | The CLI makes a key on your machine. The site's relayer creates `p-xxxxxxxx.slaythebear.testnet` with that key as its only key, limited to calling the game. The CLI signs each move as a meta transaction and the relayer pays the gas. |
| Your account | `./slay live join --account you.testnet` | The CLI signs with your key from `~/.near-credentials/testnet/you.testnet.json` (or under `NEAR_CREDENTIALS_DIR`) and you pay the gas, under 0.002 NEAR a move. Settling attaches 150 TGas, which needs about 0.15 NEAR of balance. |

Either way the account then claims its 1,000 $SLAY starter pouch. The hosted demo's address is
in the README's table; set `SLAY_SITE` to leave `--site` out. Any copy of the web app with a
relayer works too ([DEPLOY.md](DEPLOY.md)).

Then play as offline:

```bash
./slay live status         # the raid, you, the town, and what you can do next
./slay live hit 250        # prints the transaction: https://testnet.nearblocks.io/txns/<hash>
./slay live wait 60        # real time here: at most 900 seconds per call
./slay live wait end
./slay live settle         # fetches the deciding round from drand and submits it
./slay live claim
./slay live verify         # the 13 checks, and a link to the beacon at api.drand.sh
```

The CLI reads the contract's views over RPC, so what it shows is what the chain holds.
`status`, `raids`, `feed`, `market`, `verify` and `rules` work without joining. The villagers
and the keeper act while a page of the hosted site is open (it calls `/api/tick` every 20
seconds) or `npm run agents` runs, and the keeper settles a finished raid 15 seconds after its
beacon if no player has. In a quiet town you raid alone and settle your own raids.

`./slay live leave` deletes the local key; the account stays on testnet. `join --new` makes
another guest and forgets the old one's key. [TESTNET.md](TESTNET.md#raid-44-played-from-the-cli-10-nov)
records raid 44, played and verified from the CLI.

## Commands

In both modes:

| Command | What it does |
| --- | --- |
| `status` (`look`) | The raid, you, the town, and the suggested next commands. The default command. |
| `hit <amount> [--weapon club\|sword\|slayer]` | Burns 1 to 1,000 $SLAY to hit the Bear; a weapon uses one of your charges. The first hit opens a raid. |
| `wait <seconds\|end>` | Lets time pass and reports what happened in town. `end` waits until the raid's deciding drand round is out. |
| `settle [raid]` (`spin`) | Settles a finished raid with its drand beacon. The settler earns 5 $SLAY. |
| `claim [raid]` | Collects your loot from won raids, all of them by default. |
| `me` (`inventory`) | Your $SLAY, weapon charges, materials, trophies and loot to claim. |
| `craft <club\|sword\|slayer> [--trophy id]` (`forge`) | Forges 10 charges: a club from 2 wood and 10 $SLAY, a sword from 2 wood, 3 iron and 50 $SLAY, a Bear-slayer from 5 iron, a trophy and 200 $SLAY. |
| `smith` | The smith's prices. `smith buy <n>` buys club charges; `smith sell <wood\|iron> <n\|all>` sells materials. |
| `market` | The player market. `sell <item> <qty> <price>` lists an item, `buy <listing> [qty]` buys, `cancel <listing>` takes a listing back. |
| `feed [n]` | The town's last n events in words (15 by default). |
| `raids` (`history`) | Past raids and how they went. |
| `verify [raid]` | Recomputes a settled raid (the last one by default) from public data: 13 checks. |
| `rules` | Every number in the game's config. |

Offline only: `sim new [--seed n] [--minutes m]` starts a fresh town (raids of 1 to 60 minutes,
5 by default) and `sim demo` plays the scripted raid. Live only: `live join` (with
`--site <url>` or `--account <id>`, and `--new` for another guest) and `live leave`.

| Option | Default |
| --- | --- |
| `--json` | Text |
| `--home <dir>` or `SLAY_HOME`: where sessions are saved | `.slay/` in the repository |
| `--game <id>` or `SLAY_GAME`: the live contract | `game.slaythebear.testnet` |
| `--rpc <url>` or `SLAY_RPC`: the NEAR RPC | `https://rpc.testnet.fastnear.com` |

Exit codes: 0 when the command did what it said, 1 when a move or a check failed (the output
says why), 2 for a usage error.

## For agents

### The JSON

With `--json`, every command prints one object on stdout:

| Key | Holds |
| --- | --- |
| `ok` | `true` when the command did what it said |
| `mode`, `command` | `sim` or `live`, and the command run |
| `result` | What a move did: the damage of a hit, the settlement, the amounts claimed. Live moves include their transaction hashes (`txHash`). `verify` puts its checks here. |
| `status` | The game after the command (below), from `status`, `me` and every move |
| `you`, `events`, `raids`, `listings`, `smith`, `rules` | What `me`, `feed`, `raids`, `market`, `smith` and `rules` read |
| `started` | The seed and raid length, when the command started a new offline town |
| `error`, `message`, `hint` | When `ok` is false: a code such as `round_ended`, `insufficient_balance`, `beacon_not_out` or `usage`, what it means, and what to do |

`status` holds:

| Key | Holds |
| --- | --- |
| `now` | The game's clock as an ISO time. Offline it moves only on `wait`. |
| `you` | `balance`, `items` (token: quantity), `trophies`, `raid` (your hits, damage and `hitsLeft` in the raid shown) and `claimable` (raid and share). Null before you join. |
| `raid` | The current or last raid, or null: `phase` (`open`, `ended`, `settled`), `secondsLeft`, `health`, `damage`, `raiders`, `mood`, `moodOdds` (percent per tactic), `ifEndedNow` (for each tactic, whether the town would win with the damage so far), `winChance` (percent), `earlyBonus` (the multiplier of a hit now), `lateInSeconds`, `loot`, `drandRound`, `beaconInSeconds`, and `result` once settled (outcome, tactic, roll, drops, your share) |
| `town` | The Bear's `hoard`, the `treasury`, the $SLAY `burned`, the Bear's `nextMood`, the market's `listings` and the smith's `clubPrice` |
| `next` | Suggested commands, best first, each with its reason in brackets |

Amounts are $SLAY, as numbers with up to 4 decimals.

<details>
<summary>Example: <code>./slay sim wait 40 --json</code>, after a 250 $SLAY hit</summary>

```json
{
  "ok": true,
  "mode": "sim",
  "command": "wait",
  "result": {
    "waitedSeconds": 40,
    "events": [
      {
        "at": "2026-11-10T19:07:47Z",
        "kind": "hit",
        "account": "fern.sim.slaythebear.testnet",
        "round": 1,
        "text": "Fern the Follower hit raid #1 for 372.9 damage (250 $SLAY burned)"
      }
    ]
  },
  "status": {
    "mode": "sim",
    "game": "sim.slaythebear.testnet",
    "where": "offline town, seed 3",
    "now": "2026-11-10T19:08:22Z",
    "you": {
      "account": "you.sim.slaythebear.testnet",
      "balance": 750,
      "items": {},
      "trophies": [],
      "raid": { "id": 1, "hits": 1, "damage": 375, "hitsLeft": 49 },
      "claimable": []
    },
    "raid": {
      "id": 1,
      "phase": "open",
      "openedAt": "2026-11-10T19:07:42Z",
      "deadline": "2026-11-10T19:12:42Z",
      "secondsLeft": 260,
      "health": 500,
      "damage": 747.9,
      "early": 747.9,
      "late": 0,
      "raiders": 2,
      "mood": "Armor",
      "moodOdds": { "None": 15, "Armor": 55, "Rage": 15, "Feint": 15 },
      "ifEndedNow": [
        { "tactic": "None", "chance": 15, "win": true, "damage": 747.9, "health": 500 },
        { "tactic": "Armor", "chance": 55, "win": true, "damage": 747.9, "health": 600 },
        { "tactic": "Rage", "chance": 15, "win": true, "damage": 747.9, "health": 500 },
        { "tactic": "Feint", "chance": 15, "win": true, "damage": 747.9, "health": 500 }
      ],
      "winChance": 100,
      "earlyBonus": 1.4333,
      "lateInSeconds": 230,
      "loot": 750,
      "drandRound": "33844869",
      "beaconInSeconds": 269,
      "result": null
    },
    "town": {
      "hoard": 0,
      "treasury": 799000000,
      "burned": 500,
      "nextMood": "Armor",
      "bearWonLast": false,
      "listings": 0,
      "clubPrice": 3
    },
    "next": [
      "slay sim hit <1-750>   (strike now: x1.43 early bonus)",
      "slay sim wait 30   (let time pass; the villagers act)",
      "slay sim wait end   (skip to the end of the raid)"
    ]
  }
}
```

A failed move:

```json
{
  "ok": false,
  "mode": "sim",
  "command": "settle",
  "error": "round_not_over",
  "message": "The raid is still on.",
  "hint": "Raid #1 has 4m 20s left: `slay sim wait end` skips to its end."
}
```

</details>

### A loop that plays

1. Run `status --json` and read `raid.phase` and `next`.
2. No raid, or the last one is `settled`: `claim` if `you.claimable` has entries, then `hit` to
   open the next raid.
3. `open`: hit while you have $SLAY to spare and `winChance` is short of 100, then `wait`.
   Earlier hits deal more; hits after `lateInSeconds` are late, and a Feint halves them.
4. `ended`: `wait end` until `beaconInSeconds` is 0, then `settle` to earn the tip.
5. `verify` any settled raid.

The rules in a minute are in `./slay help`, and every number of the game you play is in
`rules` (`./slay live rules` for testnet).

### Time

- **Offline**, the clock stands still between commands. `wait <seconds>` moves it, at most
  3,600 seconds per call, and runs the villagers and the keeper over that time in 5-second
  steps. The deciding drand round comes 6 to 9 seconds after the deadline, and `wait end` stops
  one second after it. The keeper settles 15 seconds after the beacon, so settle right after
  `wait end` to earn the tip. A whole raid takes a few commands and almost no real time.
- **Live**, `wait` sleeps in real time, at most 900 seconds per call. A raid lasts 5 minutes and
  its beacon comes 6 to 9 seconds after the deadline. If your tool stops commands after a time
  limit, wait in steps under it (`wait 60`) and watch `raid.secondsLeft` and
  `raid.beaconInSeconds`.

### Saved state

The CLI saves to `.slay/` in the repository (gitignored), or to `--home` or `SLAY_HOME`:

| File | Holds |
| --- | --- |
| `sim.json` | The offline town as a log: its seed, its start time and every wait and move. Each command replays the log, so a town lasts across commands; a town with many raids takes a few seconds per command. The seed fixes the villagers' dice. The beacon's rolls follow the drand round numbers, which come from the start time. |
| `live-<game>.json` | The account you joined as. For a guest, also its private key, which can only call the game. `live leave` deletes the file. |

## Why the CLI can't cheat

On testnet the CLI is one more client. The contract checks every move, so a changed CLI can
only send moves the contract accepts, and `verify` recomputes a raid from the contract's views
and the drand beacon, as `npm run verify:game` and the `/verify` page do. Offline, the rules are
the TypeScript twin of the contract, held to it by shared test vectors (`fixtures/vectors.json`),
and the beacon is a local test key with drand's signature scheme, so `verify` runs the same 13
checks.

| File | Role |
| --- | --- |
| `packages/cli/src/main.ts` | Parses the command, opens the session, prints text or JSON; the demo |
| `packages/cli/src/commands.ts` | Every command, written once against the `Session` interface (`session.ts`) |
| `packages/cli/src/sim.ts` | The offline session: `SimTown` from `packages/rules/src/town.ts`, the class the web app's offline mode runs, replayed from `sim.json` |
| `packages/cli/src/live.ts` | The testnet session: views over RPC; moves relayed for a guest through the site's `/api/account` and `/api/relay`, as the web app does, or signed by your account; `settle` fetches the beacon from drand |
| `packages/cli/src/report.ts` | The status model behind `--json`, and the same facts as text |

## The demo, abridged

From `./slay sim demo`. The rolls and drops change from run to run, because the drand round
numbers follow the clock.

```
$ slay sim hit 300
You hit the Bear for 450 damage: 300 $SLAY burned, x1.50 early bonus.
Your hit woke the Bear: raid #1 is on for 5m.

Slay the Bear - offline town, seed 7 - 2026-11-10T19:07:19Z
RAID #1: ON, 5m left
  The Bear: 500 health, mood Armor (the beacon draws Armor 55%, each other tactic 15%)
  Damage so far: 450 from 1 raider
  If it ended now: None lose, Armor lose, Rage lose, Feint lose -> win chance 0%
  A hit now deals x1.50 (early bonus). Hits count as late in 4m 30s.
  Loot if the town wins: 750 $SLAY, shared by damage
YOU: 700 $SLAY | raid #1: 1 hit, 450 damage | items: none | trophies: none
TOWN: the Bear's hoard 0 $SLAY | next mood Armor | 0 listings at the market
NEXT:
  slay sim hit <1-700>   (strike now: x1.50 early bonus)
  slay sim wait 30   (let time pass; the villagers act)
  slay sim wait end   (skip to the end of the raid)

$ slay sim wait 45
45s passed.
What happened:
  Bjorn the Brave hit raid #1 for 372.9 damage (250 $SLAY burned)
...

$ slay sim settle
The Wheel of Fate spins on drand round 33844861 (the offline town's test beacon)... You earned the 5 $SLAY tip for settling.

Slay the Bear - offline town, seed 7 - 2026-11-10T19:12:28Z
RAID #1: SETTLED - the town WON
  The beacon (drand round 33844861) drew None, roll 561 of 10000: No trick this round.
  1,107.9 damage against 500 health. Loot: 750 $SLAY, shared by damage.
  Drops: 2 iron -> you, 2 iron -> Bjorn the Brave, 3 wood -> Bjorn the Brave
  Your share: 497.56 $SLAY (not claimed yet)
  Settled by you (tip 5 $SLAY).
...

$ slay sim verify
Raid #1 checks out: 13 of 13 checks pass.
  PASS Deciding drand round fixed at the open: round 33844861, published 8 s after the deadline, so nobody could know it while hits were allowed
  ...
  PASS Tactic drawn from the beacon: roll 561 of 10000 against mood weights 1500/5500/1500/1500: None
  ...
  Loot shares:
    you: weight 735 -> 497.56 $SLAY
    Bjorn the Brave: weight 372.9 -> 252.44 $SLAY
```
