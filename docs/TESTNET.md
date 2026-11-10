# Testnet log

Everything here can be opened on a testnet explorer: `https://testnet.nearblocks.io/txns/<hash>`
or `https://testnet.nearblocks.io/address/<account>`. All accounts are throwaway faucet
accounts under `slaythebear.testnet`. Their keys live in the deployer's `~/.near-credentials`,
never in the repository.

## Instances

| Account | Role | Code hash | Config | Keys |
| --- | --- | --- | --- | --- |
| `game.slaythebear.testnet` | **The public game** (5-minute raids) | `BD2jeytgDSV5wAyhNEfieVoFg3oqx9vedWuXZusPqdzN` (reproducible build of `b9f0a5b`) | `quick` preset | 1, until the owner approves the lock |
| `dev3.slaythebear.testnet` | Development and end-to-end tests (10-minute raids) | `BD2jeytg…` (the same build) | `demo` preset | 1 (stays unlocked) |
| `town.slaythebear.testnet` | Superseded before launch: pre-launch effort cap (2.0x) | `BD2jeytg…` (the same build) | `quick` with the old cap | 1, unused |

`game.slaythebear.testnet`: created in `DHSNjfzy6FhxkvdSjPH7KQjF6ohejF239Rikom9bTp2v`, deployed
and initialised in one transaction, `2pCMMY5qVTfRqQBBwWTCw9oTzghyPJWsDiDFLrt56BZB` (31.0 TGas).

**Code replaced on 10 Nov, after raid 43.** The repository's address changed, and the contract
embeds its source link (NEP-330), so all three instances got a reproducible build of `b9f0a5b`:
the same contract source, with the new link. The state carried over (`scripts/redeploy.ts`
compares `get_status` before and after). Raids 1 to 43 ran on the earlier build
`Br6G5zJ8f5hyPuiyDsZ5RZehWNLmXwLpqSB9SwLhJJov` (dev3 on `AgzkaQz7jKRUj7JLh9uEWDJvKhBt3nPykJYnHeMNSh5p`).

| Instance | Redeploy tx | Gas |
| --- | --- | --- |
| `game` | `9mREfF1RQRaWD4YsvZ7GgWXJXNBhxyideLVHfytYTBjW` | 27.1 TGas |
| `town` | `zesRf1yGpBB4wB6SKUzDpkGw1oZz1hVoEhAHtMQdXSt` | 27.1 TGas |
| `dev3` | `7pC5PfUi1TXKUaKDgA3QAbc9VxUaBvDmbbxtT6jx4q5L` | 27.1 TGas |

The new code then settled dev3's raid 2 with drand round 33762507, the BLS check included
(`E21R9fxAboxdNCp1REx2GrRaV2FVPD6WgidTUWeBh3AE`).

Helper accounts: `slaythebear.testnet` (root, relayer and guest factory), `keeper.slaythebear.testnet`,
villagers `bjorn`, `fern`, `sid` and `sara` `.slaythebear.testnet`, and `tester.slaythebear.testnet`.

## The public game, `game.slaythebear.testnet`

Raids 1 to 5 were played by the villagers (`npm run agents -- --open-if-idle`) and test guests
created through the web app's `/api/account`. Raid 5 was settled by a guest through the relayer,
as the town's settle button (now **Spin the Wheel of Fate**) does (`scripts/test-settle-relay.ts`): tx
`DHpRAzBjcAfERsv5woyr5rnezQNpEdxrkLZHoK8dmT2k`, drand round 33763623; the guest
`p-62xkl74q.slaythebear.testnet` received the 5 $SLAY tip.

`npm run verify:game` after raid 5:

```
PASS code hash matches deployments/game.slaythebear.testnet.json
NOTE the game account still has 1 access key(s): an unlocked instance that its deployer can change
5 round(s), 5 settled
PASS round 1: win, Rage (roll 7622), 2 raiders, 13 checks
PASS round 2: win, Rage (roll 4484), 3 raiders, 13 checks
PASS round 3: win, Armor (roll 1852), 3 raiders, 13 checks
PASS round 4: win, Rage (roll 6935), 4 raiders, 13 checks
PASS round 5: win, Rage (roll 5407), 3 raiders, 13 checks
PASS supply 999,996,723.4064 SLAY + burned 3,276.5935 SLAY = minted 1,000,000,000.0000 SLAY
PASS loot chest 1,268.7573 SLAY = loot not yet claimed 1,268.7573 SLAY
PASS treasury 798,995,396.1750 SLAY = start - rewards - thefts - tips (798,995,396.1750 SLAY)
PASS the Bear's hoard 0.0000 SLAY follows the raids (0.0000 SLAY)
ALL PASS
```

Raid 6 was lost on purpose (`scripts/lost-raid.ts`): a single 1 $SLAY hit
(`2tHEAtQpUkp3jztvpMLYRYeexApbSYhTz1rTYJuU23Ma`) against 805 health. The keeper settled it with
drand round 33763744 (`BNwL4BZApzba1JUAFeGNHftGeTi7r4ZERF5dg5KSX1dq`); the beacon drew Rage
(roll 3228), so the Bear stole 1.5 × 402 = 603 $SLAY from the treasury into its hoard, which
the next won raid pays out. `npm run verify:game` afterwards:

```
PASS round 6: loss, Rage (roll 3228), 1 raiders, 13 checks
PASS treasury 798,994,787.2337 SLAY = start - rewards - thefts - tips (798,994,787.2337 SLAY)
PASS the Bear's hoard 603.9412 SLAY follows the raids (603.9412 SLAY)
ALL PASS
```

Raids 7 to 9 were played in the town's game scene in headless Chrome (`scripts/ui-game.ts
--mode live`, 8 Nov), each by a new guest: one hold-to-charge strike that opened the raid,
Bjorn and Fern joining through `/api/tick`, then the wheel.

| Raid | Opened by | Deciding drand round | Tactic (roll) | Result | Settled by |
| --- | --- | --- | --- | --- | --- |
| 7 | `p-gs7wuxld` | 33771960 | Armor (1908) | won: 1,860 damage against 986 × 1.2 health; the 603 $SLAY hoard from raid 6 paid out in the 1,630 $SLAY loot | the keeper |
| 8 | `p-88wwe6oq` | 33772565 | None (267) | won: 1,159 against 752 | the keeper |
| 9 | `p-hpev41mq` | 33773077 | Feint (8546) | won: 1,255 against 828; the guest claimed 212.26 $SLAY | the guest, with **Spin the Wheel of Fate** |

In raids 7 and 8 the guest's spin never reached the relayer, and the keeper settled the raids
instead. The likely cause: the public RPC was answering HTTP 429 (rate limited) to this
machine throughout (the dev server's log shows it), and near-api-js does not retry a 429, so
one read of the settle failed. The web app, the server routes and the scripts now use a
provider that waits out a 429 (`packages/agents/src/rpc.ts`), the page and the villagers read
less per poll, and the keeper leaves players 15 seconds after the beacon before it settles.
Raid 9 then went through end to end. `npm run verify:game` afterwards:

```
9 round(s), 9 settled
PASS round 7: win, Armor (roll 1908), 3 raiders, 13 checks
PASS round 8: win, None (roll 267), 3 raiders, 13 checks
PASS round 9: win, Feint (roll 8546), 3 raiders, 13 checks
PASS supply 999,993,833.3891 SLAY + burned 6,166.6108 SLAY = minted 1,000,000,000.0000 SLAY
PASS loot chest 1,667.1660 SLAY = loot not yet claimed 1,667.1660 SLAY
PASS treasury 798,991,373.8563 SLAY = start - rewards - thefts - tips (798,991,373.8563 SLAY)
PASS the Bear's hoard 0.0000 SLAY follows the raids (0.0000 SLAY)
ALL PASS
```

### Raids 10 to 38: the villagers trade (8 Nov)

The villagers then played on their own (`npm run agents -- --game game.slaythebear.testnet
--interval 30 --open-if-idle`), one raid every five to six minutes. The town won 26 of these 29
raids; the Bear won raids 28 to 30, and the next won raid, 31, paid its hoard out. Six Bear
trophies dropped (raids 13, 19, 20, 22, 23 and 33), each a one-of-one NEP-245 token. Their looks,
derived from each raid's settlement randomness (`npx tsx scripts/trophy-check.ts --game
game.slaythebear.testnet`): Shadow Paw, Moss Paw, Storm Paw, Ember Paw and Shadow Paw (all bronze),
then Storm Claw (silver).

After raid 30 the villagers also trade with their drops, by `villagerTrade` in
`packages/rules/src/npc.ts`:

| Move | Tx |
| --- | --- |
| Bjorn forges a Bear-slayer from a trophy and 5 iron (the trophy is burned) | `E4WtSYVZJMvLY3JQ8Etm92qHiY1gUH9wFc8378KeqMqY` |
| Fern lists a trophy at the market for 250 $SLAY | `2p2LAzDp1SukcDndThUkGnif8sMbZU68h3orZsH6YVMi` |
| Bjorn lists a spare trophy for 350 $SLAY | `GFWBtTe6ow1jZE3eGiNVY7Rcw3yMS581eMPvWGYTDZbF` |
| Fern forges 10 sword charges | `HUj2iSNNBC56arAjEz7WLGJETDedohtPv4xG7VtNdERW` |
| Bjorn hits 1,000 $SLAY with the Bear-slayer (×2 damage) | `779ajEiKeyBEqW6cLFoLUDBptUQ9Ywa5g8ZoHPCknDF6` |
| Fern sells spare wood to the smith | `7eD8v57rk3wJSJM7v28i9PuvrF8JrdKdG64eeHyocbwZ` |
| Bjorn sells spare iron to the smith | `B7TK4thtkgDjQrxx8aT9iEKvsqE2E97LAwMHaQJTGcMK` |

Raid 38 was settled by a guest, `p-eawmbchh.slaythebear.testnet`, pressing **Spin the Wheel of
Fate** in the new game shell (`scripts/ui-check.ts --live` against a production build).
`npm run verify:game` afterwards:

```
39 round(s), 38 settled
PASS round 10: win, Rage (roll 5559), 2 raiders, 13 checks
PASS round 11: win, Armor (roll 4596), 2 raiders, 13 checks
…
PASS round 37: win, Feint (roll 9719), 2 raiders, 13 checks
PASS round 38: win, Rage (roll 7541), 2 raiders, 13 checks
  ---- round 39: in progress
ledger
PASS supply 999,910,207.6096 SLAY + burned 89,792.3903 SLAY = minted 1,000,000,000.0000 SLAY
PASS loot chest 1,667.1660 SLAY = loot not yet claimed 1,667.1660 SLAY
PASS treasury 798,867,964.2483 SLAY = start - rewards - thefts - tips (798,867,964.2483 SLAY)
PASS the Bear's hoard 0.0000 SLAY follows the raids (0.0000 SLAY)
ALL PASS
```

Raids 39 to 43 followed; the Bear won 41 to 43, so its hoard holds 13,549 $SLAY for the next won
raid. After the code was replaced (see Instances), `npm run verify:game`:

```
PASS code hash matches deployments/game.slaythebear.testnet.json
43 round(s), 43 settled
…
PASS round 40: win, Rage (roll 8368), 3 raiders, 13 checks
PASS round 41: loss, Armor (roll 2285), 2 raiders, 13 checks
PASS round 42: loss, Rage (roll 8076), 0 raiders, 13 checks
PASS round 43: loss, Rage (roll 5540), 1 raiders, 13 checks
ledger
PASS supply 999,901,112.6096 SLAY + burned 98,887.3903 SLAY = minted 1,000,000,000.0000 SLAY
PASS loot chest 1,807.3950 SLAY = loot not yet claimed 1,807.3950 SLAY
PASS treasury 798,833,385.2682 SLAY = start - rewards - thefts - tips (798,833,385.2682 SLAY)
PASS the Bear's hoard 13,549.7117 SLAY follows the raids (13,549.7117 SLAY)
ALL PASS
```

`npm run verify:live`: the deployed code hash equals the local reproducible build
(`BD2jeytgDSV5wAyhNEfieVoFg3oqx9vedWuXZusPqdzN`); NEP-330 metadata points at
`https://github.com/vibe-code-guy/slay-the-bear/tree/b9f0a5b069b33442d04bb6c8e21fa92f3680d64a`
and the image `sourcescan/cargo-near:0.22.0-rust-1.99.1@sha256:c9655eaf…b5bb`; the config is
the published `quick` preset; one access key remains (the lock waits for approval).

Parallel load through the local web app (`scripts/test-web-flow.ts --burst 4`), with four
relayer keys: four guest accounts created at once and four relayed moves at once, all
succeeded.

### Raid 44, played from the CLI (10 Nov)

A guest made by the terminal client ([docs/CLI.md](CLI.md)) played raid 44:
`./slay live join --site http://localhost:3100`, a local copy of the web app with the relayer,
created `p-rw126we0.slaythebear.testnet`, and its key stayed on the machine. The Bear's
13,549.71 $SLAY hoard from raids 41 to 43 gave it 9,863.36 health.

| Move (`./slay live ...`) | Result | Tx |
| --- | --- | --- |
| `hit 400` | opened raid 44: 600 damage (x1.5 early bonus) against a Bear in the Rage mood | `aNWaqeX4Jmgmmcpo3CPVfSNPHYqrKJHHYcp6aeqWXSk` |
| | Bjorn and Fern hit 1,000 $SLAY twice each with swords, Sara 161.15 and 128.92 | |
| `hit 600` | 767.88 damage | `3RTupUxCPeJ2XNiMNvaoARpeHUHnJyAT69XYyuZFtybL` |
| `settle`, once the beacon was out | the CLI fetched drand round 33844453 and submitted it; the beacon drew Rage (roll 6302); 10,477.71 damage from 4 raiders against 9,863.36 health, so the town won 20,982.13 $SLAY: the hoard plus 7,432.42 from the treasury. The guest earned the 5 $SLAY tip. | `EeGLwt7djnfiGKCoDbpsJ4XaVXZdXbwUh6wm5xncRBpe` |
| `claim` | the guest's share, 2,739.25 $SLAY | `A6eocyjNDyHNbsoWnv6FKbhJpmQqm7njYu3XvFUVvm3V` |
| `verify 44` | 13 of 13 checks pass | |

The other way in, your own account: after `./slay live join --account
tester.slaythebear.testnet` (its key in `~/.near-credentials`), `./slay live smith buy 1` bought
a club charge for 3 $SLAY (`2mcU2k4EQRJ9SMXLZD8T1KbaCWZhaewgamr5xEQoTyaR`).

### Raids 45 to 47 on the hosted site (10 Nov)

The site went up at [slay-the-bear.vercel.app](https://slay-the-bear.vercel.app), deployed by
Vercel from this repository, with the relayer, keeper and villager keys in its environment.
Guests joined through its relayer from a browser and from the CLI, and the villagers and the
keeper acted through its `/api/tick`.

| Raid | What happened | Result |
| --- | --- | --- |
| 45 | Opened by a guest of the headless-Chrome check (`scripts/ui-check.ts --live` against the site). Bjorn and Fern hit with swords. A CLI guest, `p-w2bjtawr`, joined through the hosted relayer and hit 300 $SLAY for 406.74 damage (`7kPY8zsduPvap28pGEvHxrAbBVAqAnLNLkWcMB75UqKq`). A player in a browser, `p-u7augxbj`, hit 1,000 $SLAY and pressed **Spin the Wheel of Fate** seconds after the beacon; the CLI guest's settle a second later was refused, `already_settled`. | Armor (roll 3220): 7,771.23 damage against 6,540.53 health, won 8,175.67 $SLAY; the CLI guest claimed 427.91 (`628taYrKxijofxDq6kmGZ8gfyY7us4DtF9bujN3HMFK5`) |
| 46 | Opened by `p-u7augxbj`; Bjorn and Fern joined. The raid ended at 20:23 UTC with no page open and no scheduled tick yet, so it waited for the next call to `/api/tick`, at 20:38, when the keeper settled it. | Rage (roll 7881): 8,205.47 against 5,995.49 health, won 8,993.23 $SLAY |
| 47 | Opened by `p-u7augxbj`; Bjorn and Fern joined. The keeper settled it from a manual call to `/api/tick` (`2BpdR2c2uksUd1aMDBHbQDX3zGoJHvXTbMvWfgLhKZem`), in which Bjorn also sold spare iron to the smith (`B3RqtcFD9eRH4oRdQ54n5kLC6mTahY8LPN8ZA5nBB7NA`). | Rage (roll 7946): 8,798.29 against 6,595.04 health, won 9,892.55 $SLAY |

`./slay live verify 45`, `46` and `47`: 13 of 13 checks pass each. Since 20:54 UTC a
cron-job.org job sends a POST to `/api/tick` every minute, so finished raids settle and the
villagers play when no page is open.

## Early checks (8 Nov 2026, first contract build)

These ran against `dev.slaythebear.testnet` (now deleted), an unlocked instance of the first
contract build, whose Bear committed and revealed its tactic. The drand verification code and
the meta-transaction path are the same in the current build.

### drand verified on-chain

Raid 1 opened by a hit, settled after the deadline with quicknet round 33761623
(`scripts/early-checks.ts settle`):

| Attempt | Result |
| --- | --- |
| Real signature with one byte flipped | rejected, `bad_beacon` |
| Valid signature of round 33761622 passed as 33761623 | rejected, `bad_beacon` |
| Round 33761622 with its own valid signature | rejected, `wrong_beacon_round` |
| Real beacon for 33761623 | settled, tx `DBZJmfCFMMBauhd2WP5SKC762ie4zo6E52LpnnsGi7dY`, 13.0 TGas burnt in total |

The settlement stored `randomness = 314ddce4…6405`, which equals sha256 of the beacon signature
`b44325de…4699`.

### Gas-free play with a function-call key

`guest-check.slaythebear.testnet` was created with 0.01 NEAR and one function-call key limited
to the game contract (`HYFpWAMqPUamqUvX6GW9griHCcaGQSqWEYJpeX2vwZuv`). It signed delegate
actions; `slaythebear.testnet` relayed them and paid the gas:

| Move | Tx | Gas |
| --- | --- | --- |
| claim_pouch (relayed) | `2RhqE5RCuHXZF5kp8F9aDuRzc8H1dMc184FFt6tkoJ24` | 3.95 TGas |
| hit 50 $SLAY (relayed) | `FDeScyaBVZdp1jXtiGJTCR4t2YWMWiXEJn5PRTdtYRyX` | 4.10 TGas |

The contract credited the pouch to, and recorded the hit for, `guest-check`, not the relayer.
The guest's balance stayed at 0.01 NEAR.

## Current build on `dev3.slaythebear.testnet`

### A raid with villagers and the keeper (agents)

| Step | Tx |
| --- | --- |
| Four villagers claim pouches; Bjorn opens raid 1 | `HTVAW3cP5mgzCpcLL5WtoowmyzNyN52gG2fWUxsdLYLw` … `HyYijCAPX2sK2qigHox8NpPmsy1DEfZpFsRb9XAGKpg2` |
| Bjorn hits 250 (brave), Fern hits 250 (follower) | `mGqvgjyBacZdTESC9p99qyGvEyuYm42tKf3e6qtZ94r`, `H7MLci1KFmgg9aG9jpPF85KYFRVpkUXkxDo3CgpDAX7F` |
| Keeper settles with drand round 33762096: town wins, the beacon draws Armor (roll 2851) | `AxzGkpBHam5iDVobzfBESWSLMANeTyBbLsQeFJR2YyRB` |
| Bjorn and Fern claim 375 and 374 $SLAY | `6UXdQae2vfT6a61WYnFt4J6CypYNnwwN5cTobJ9vf3Br`, `3YZshppDxaDWa4LnoBgLXoCrEkohC6tZCJkCTP2j53ct` |

`npm run verify:game -- --game dev3.slaythebear.testnet`:

```
PASS code hash matches deployments/dev3.slaythebear.testnet.json
PASS round 1: win, Armor (roll 2851), 2 raiders, 13 checks
PASS supply 999,999,435.4200 SLAY + burned 564.5800 SLAY = minted 1,000,000,000.0000 SLAY
PASS loot chest 0.0000 SLAY = loot not yet claimed 0.0000 SLAY
PASS treasury 798,999,245.0000 SLAY = start - rewards - thefts - tips (798,999,245.0000 SLAY)
PASS the Bear's hoard 0.0000 SLAY follows the raids (0.0000 SLAY)
ALL PASS
```

### Smith, crafting, market and token standards (`scripts/e2e.ts`)

| Step | Result |
| --- | --- |
| tester claims a pouch | `7d7qQ5qaNQyNrSZCbfE396JSRC5WTuVAtoKbsw2a1LMA`, 3.2 TGas |
| tester claims a second pouch | refused, `pouch_already_claimed` |
| tester buys 3 club charges from the smith | `5ynzSDa13NU2XqZZzjRVRDMhDoREnGdeWwJSghgzK1Rm`, 3.9 TGas |
| tester sells a club to the smith | refused, `smith_only_buys_materials` |
| fern sells 2 iron (a raid drop) to the smith | `H1iiQbZbXe2qjL9akx1uNxDyVJAUxFnURSaFijjqSCa2`, 3.5 TGas |
| fern crafts 10 club charges from 2 wood | `H8KsJ3Hs8ZssthfbqF5YhB1vo6xUfnLYoy7wpReGFfLf`, 3.9 TGas |
| tester crafts a sword / a Bear-slayer without materials | refused, `need_wood` / `need_trophy` |
| tester lists 2 clubs at 4 $SLAY | `3yGzUDb97EKWNuhycUgLYPaM5FGQn1Cd9X1E7qXJseun`, 3.2 TGas |
| tester buys own listing | refused, `own_listing` |
| bjorn buys 1 club from the listing | `HHMdCRkEizVnaH5otk4G9zQ9nqRUKCvv86MY5jR7Z3eT`, 4.1 TGas |
| bjorn cancels tester's listing | refused, `not_seller` |
| tester cancels the rest | `GC3qQxNn2MAKJNrRrPZ55LoEN7Gxbc7NgRbTz9MyX62R`, 3.0 TGas |
| `ft_transfer` 1 $SLAY to bjorn | `9pxjcQPktotSuqeJcz4nFca1cbvgu19hue3PJjq5MCvf`, 2.5 TGas |
| `ft_transfer` to the Bear's account | refused, `special_account` |
| `mt_transfer` 1 club to bjorn | `CJksEJDuMgr6mK13UMhY9i87XStcVv2CkjQgNCypD62Z`, 2.5 TGas |
| `mt_transfer` to the market account | refused, `special_account` |

### The web app's server routes (`scripts/test-web-flow.ts`, local `next start`)

| Request | Result |
| --- | --- |
| `POST /api/account` with a fresh browser key | `p-3kregt0t.slaythebear.testnet` created, `cGg8EUr9hF9MvVZfEzT5ZJBiHWatwM9dLPJ1yq9QRVU` |
| Relayed `claim_pouch` signed by the guest's key | ok, `63qLCckSxgx658MrSovMr97TFSnFBnPodjiWkAhxxLkp` |
| Relayed `hit` while the raid was over but unsettled | contract refused, `round_ended` (`3v4d5Uxjbr28H2M1qfyGRWxFBkhvKNXZSSEua44CiVwb`) |
| Relayed second `claim_pouch` | contract refused, `pouch_already_claimed` (`2N8gGsNs2sRV1QbHhsfhEphLw7g9aYJQT9ob8oXkvU44`) |
| Relayed `ft_transfer` with a 1 yocto deposit | relayer refused, HTTP 400 `method ft_transfer is not relayed` |
| Garbage delegate / a secp256k1 key | relayer refused, HTTP 400 |
| `POST /api/tick` | keeper settled raid 1, two villagers claimed loot |

In headless Chrome (`scripts/ui-check.ts --live`), a guest (`p-w9fi6s0h.slaythebear.testnet`)
joined with one click, claimed the pouch and hit, which opened raid 2 on `dev3`; `/verify`
showed 13 of 13 checks passing for raid 1.

## Measurements

| What | Gas |
| --- | --- |
| Deploy a 372 kB wasm and `new()` in one transaction | 31 TGas |
| claim_pouch | 3.0 to 3.2 TGas |
| A hit, including opening the raid | 3.8 TGas |
| A relayed move (meta transaction) | 4.0 to 4.1 TGas |
| Settle with on-chain BLS verification, 2 raiders, 3 drops | 13.0 TGas |

Testnet gas price on 8 Nov: 100,000,000 yoctoNEAR per gas, so a relayed move costs the relayer
about 0.0004 NEAR. A caller needs about 0.3 NEAR of balance to attach 300 TGas, because NEAR
reserves prepaid gas at a pessimistic price; the web app attaches 150 TGas to settle and 30 to
everything else.
