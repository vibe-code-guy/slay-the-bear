# Testnet log

Everything here can be opened on a testnet explorer: `https://testnet.nearblocks.io/txns/<hash>`
or `https://testnet.nearblocks.io/address/<account>`. All accounts are throwaway faucet
accounts under `slaythebear.testnet`. Their keys live in the deployer's `~/.near-credentials`,
never in the repository.

## Instances

| Account | Role | Code hash | Config | Keys |
| --- | --- | --- | --- | --- |
| `game.slaythebear.testnet` | **The public game** (5-minute raids) | `Br6G5zJ8f5hyPuiyDsZ5RZehWNLmXwLpqSB9SwLhJJov` (reproducible build of `2038bbd`) | `quick` preset | 1, until the owner approves the lock |
| `dev3.slaythebear.testnet` | Development and end-to-end tests (10-minute raids) | `AgzkaQz7jKRUj7JLh9uEWDJvKhBt3nPykJYnHeMNSh5p` (local build of the same source) | `demo` preset | 1 (stays unlocked) |
| `town.slaythebear.testnet` | Superseded before launch: pre-launch effort cap (2.0x) | `Br6G5zJ8…` | `quick` with the old cap | 1, unused |

`game.slaythebear.testnet`: created in `DHSNjfzy6FhxkvdSjPH7KQjF6ohejF239Rikom9bTp2v`, deployed
and initialised in one transaction, `2pCMMY5qVTfRqQBBwWTCw9oTzghyPJWsDiDFLrt56BZB` (31.0 TGas).

Helper accounts: `slaythebear.testnet` (root, relayer and guest factory), `keeper.slaythebear.testnet`,
villagers `bjorn`, `fern`, `sid` and `sara` `.slaythebear.testnet`, and `tester.slaythebear.testnet`.

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
