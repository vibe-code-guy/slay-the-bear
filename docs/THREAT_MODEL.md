# Threat model

Scope: the game contract on NEAR testnet, the web app with its relayer, and the helper agents.
$SLAY and the items have no monetary value; the aim is that the game would stay fair if they did.

## Assets

- Player $SLAY balances and items.
- The treasury, the pouch chest, the Bear's hoard, the loot chest, the smith's float and stock.
- The integrity of each raid: who won, the tactic, the drops, the shares.
- The relayer's testnet NEAR (it pays guests' gas and account creation).
- The game account's NEAR, which pays for contract storage.

## Actors

| Actor | Holds | Can | Cannot |
| --- | --- | --- | --- |
| Player | Their account's key (guests: a function-call key for the game only, in the browser) | Play every game method, transfer their own $SLAY and items | Move anyone else's balance, hit after the deadline, settle without the right beacon, claim twice |
| Deployer | Nothing since the lock on 11 Nov 2026 (before it, the game account's full-access key) | Before locking: redeploy. After locking: nothing | Mint, move the treasury or hoard, pick randomness: there are no such methods |
| Relayer operator (`/api/relay`) | The root account key | Pay gas, refuse to relay, create guest accounts | Sign as a guest or alter a signed move |
| Agent operator (keeper, villagers) | Ordinary player keys | Settle finished raids, play as four villagers | Anything a player cannot |
| NEAR validators | Block production | Order transactions, set block timestamps within protocol limits | Forge a drand signature |
| drand (League of Entropy) | Threshold key shares | Publish beacons | Change a published beacon; a threshold of members colluding could predict one |
| Web host and RPC provider | The site and the read path | Serve a wrong page or wrong view data | Change on-chain state; `npm run verify:game` and `/verify` can be run against any RPC |

## Threats

| Threat | Mitigation | Left over |
| --- | --- | --- |
| **Forged or chosen randomness** | `settle` verifies the BLS signature of the drand round fixed at the open, on-chain. Tampered signatures, other rounds and wrong round numbers were rejected on testnet (`docs/TESTNET.md`). | A colluding drand threshold. |
| **Knowing the tactic early** | The tactic is drawn from the same beacon after the deadline. No NPC holds a secret. | None. |
| **Deadline sniping with the beacon in hand** | The deciding round is published at least 2 rounds (6 s) after the deadline; hits after the deadline fail with `round_ended`. | A validator delaying block timestamps by more than 6 s. |
| **Re-rolling by refusing to settle** | Settlement is deterministic given the beacon: whoever settles, whenever, the outcome is the same (tested in `engine.test.ts`). | None. Delaying settlement only delays it. |
| **Front-running settle** | Only the 5 $SLAY tip is at stake. | None. |
| **Double claim, double settle** | `already_claimed`, `already_settled`; checked by unit tests and the vector replay. | None. |
| **Moving NPC or treasury funds** | Special accounts are refused as sender or receiver by `ft_transfer`, `ft_transfer_call`, `mt_transfer`, `mt_batch_transfer` and all game methods; they have no keys. | None. |
| **Admin or upgrade abuse** | No owner, no admin methods, config fixed at `new()`, reproducible build. The last key was deleted on 11 Nov 2026 (`docs/FAIRNESS.md`). | None. |
| **Relayer misuse by others** | Relays only zero-deposit calls to the game's play methods from `p-*` guest accounts; per-IP and per-account rate limits; gas per call capped at 200 TGas. | Rate limits are per server instance, so a determined user on a scaled deployment gets more. Cost is testnet NEAR only. |
| **Censoring relayer** | Players can call the contract directly with any wallet or the NEAR CLI. | Guests without NEAR depend on the relayer. |
| **Guest key theft** | The key lives in the browser's localStorage and can only call the game contract; the account holds 0.01 NEAR. | Malware in the browser can play as the guest and transfer its $SLAY and items. |
| **Fake accounts (Sybil)** | Loot and drops follow damage, so splitting $SLAY across accounts gains nothing in a raid. Starter pouches are capped at 200 a day game-wide; guest creation is rate-limited per IP. | A farmer can still collect pouches within the daily cap. |
| **Jackpot farming** | Opening empty raids lets the Bear steal and grows the hoard, and the effort cap lowers the next Bear's health. Thefts are capped (1% of the treasury, 0.5x base health), and any player can join the raid that wins the jackpot. | This is the intended catch-up: a quiet town meets a weak Bear with a big hoard. |
| **Storage griefing** | The contract pays for state from its own NEAR. Pouches are capped per day; raids cap raiders (300) and hits per raider (50); the feed keeps 40 entries. Anyone can top up the contract by sending it NEAR. | Market listings and new items have no per-account cap; each costs the contract about 0.0015 NEAR. |
| **Gas exhaustion in settle** | Settlement reads at most 300 raiders and makes 3 draws; the client attaches 150 TGas. | None measured; one settlement with 2 raiders used 13 TGas. |
| **drand outage** | A raid waits until its deciding round is published; drand keeps every past round. | A permanent drand halt would leave raids unsettled; the mode is fixed at `new()`. |
| **Wrong data from the site or RPC** | The verifier recomputes everything from views and the beacon, and can run against any RPC. | A user who trusts a malicious mirror without verifying. |
| **Integer overflow and rounding** | u128 with 256-bit intermediates (`mul_div`), `checked_mul` on prices, release builds keep overflow checks; all splits round down, so payouts never exceed the pool. | Dust from rounding stays in the loot chest. |

## Not in scope

Mainnet, real money, price oracles, liquidity pools, contract upgrades after launch (by design),
and NEAR Auth social login (cut for time; guests and direct contract calls cover sign-in).
