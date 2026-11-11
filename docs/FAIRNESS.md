# Fairness: what you can check, and how

The claim: nobody, including the people who built and deployed Slay the Bear, can pick a raid's
outcome, see the Bear's tactic early, mint $SLAY, move the treasury outside the rules, or change
the rules. Each part of that claim can be checked from public data. This file says how.

## 1. The code is the code in this repository

`game.slaythebear.testnet` was built with `cargo near build reproducible-wasm` inside a pinned
Docker image and exposes its build metadata (NEP-330):

```bash
npm run verify:live        # compares the deployed code hash with contracts/game/target/near/slay_game.wasm
```

To rebuild it yourself (needs Docker):

```bash
git checkout b9f0a5b069b33442d04bb6c8e21fa92f3680d64a      # the commit in the contract's metadata
cd contracts/game && cargo near build reproducible-wasm  # prints "SHA-256 checksum bs58: ..."
```

The checksum must equal the code hash the chain reports for the account:

```bash
near account view-account-summary game.slaythebear.testnet network-config testnet now
near contract call-function as-read-only game.slaythebear.testnet contract_source_metadata json-args '{}' network-config testnet now
```

Expected: `BD2jeytgDSV5wAyhNEfieVoFg3oqx9vedWuXZusPqdzN`, built in
`sourcescan/cargo-near:0.22.0-rust-1.99.1@sha256:c9655eaf…b5bb`.

## 2. Nobody can change it

An account with no access keys cannot sign anything: no redeploy, no upgrade, no migration, no
admin call. The contract has no owner field and no admin method either; its config is fixed at
`new()`.

```bash
near account list-keys game.slaythebear.testnet network-config testnet now
```

Expected: no keys. **The game was locked on 11 Nov 2026**: `scripts/lock.ts` deleted the
deployment key in `EhFhVM3981Dsmcsv5TRfFDC8dPBmLh1cYB2SCSTebW3`, after checking that the code on
chain was the published build. `npm run verify:live` prints `PASS access keys on the game
account: 0`, and the `/verify` page says the account has no access keys. Before the lock, the
deployer used that key once, on 10 Nov, to replace the code with a reproducible build of the same
contract source whose embedded source link points at this repository; the state carried over
([TESTNET.md](TESTNET.md#instances)).

The special accounts (`treasury.`, `pouches.`, `bear.`, `smith.`, `loot.`, `market.` +
contract id) are ledger entries. `ft_transfer`, `mt_transfer` and every game method refuse them
as sender or receiver, so their balances move only by the rules.

## 3. The random rolls are drand's, checked on-chain

- At the open, the contract fixes the **deciding drand round**: the first quicknet round
  published at or after the deadline, plus 2 rounds (6 seconds). While hits are allowed, that
  round does not exist yet.
- `settle` takes that round's signature. The contract checks it against the quicknet group key
  with NEAR's BLS12-381 host functions (NEP-488): hash-to-curve per RFC 9380 in the contract,
  then a pairing check, `e(-sig, G2) · e(H(m), pk) = 1`. A wrong round fails with
  `wrong_beacon_round`; a bad signature with `bad_beacon`. On testnet this costs about 13 TGas
  for the whole settlement (`docs/TESTNET.md`).
- randomness = sha256(signature). Draw *i* = sha256(randomness ‖ round id (8 bytes BE) ‖ i
  (4 bytes BE)). The tactic uses draw 0xFFFFFFFF; drops use draws 0, 1, 2.
- The beacon is public: `https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/<round>`.

Only the Bear's tactic and the drops are random. Hits, damage, health, rewards, thefts, prices
and crafting are deterministic.

## 4. Every raid can be recomputed

The contract keeps everything needed in its views, so no indexer is needed: each round's open
values (health, base, hoard, player supply, mood, deciding drand round), each raider's early and
late damage, and the settlement (beacon signature, randomness, tactic and roll, weights,
reward, theft, drops).

```bash
npm run verify:game        # every settled raid of game.slaythebear.testnet: PASS or FAIL
```

For each raid it checks, with `packages/rules/src/verify.ts`:

| Check | Recomputed from |
| --- | --- |
| Deciding drand round fixed at the open | the deadline and the quicknet schedule |
| Raiders' damage adds up | the participants view |
| Bear's mood follows the last raid | the previous raid |
| Bear's health follows the rules | supply and hoard at the open, the previous base, the last 6 raids |
| drand signature valid | BLS12-381 check in TypeScript (`@noble/curves`) |
| Randomness = sha256(signature) | the signature |
| Tactic drawn from the beacon | randomness, mood, mood weights |
| Total weight, effective health, outcome | participants and tactic |
| Reward or theft within the rules | base health and hoard |
| Drops | randomness and weights |

Then it checks the ledger: supply + burned = minted; the loot chest holds exactly the loot not
yet claimed; the treasury equals its start minus every reward, theft and tip; the Bear's hoard
follows every raid.

The `/verify` page runs the same checks in the browser, and each past raid in the town has a
"Verify" button.

The TypeScript rules and the contract are pinned together: `cargo test` replays
`fixtures/vectors.json` (39 steps of a scripted game, produced by the TypeScript engine) and
compares every balance, item and round after each step, the NPC formulas on 39 more cases, and
every view's JSON field for field.

## 5. The relayer cannot play for you

Guests sign every move in the browser with their own function-call key, which lives only in
their browser's storage. The relayer (`/api/relay`) wraps the signed delegate action (NEP-366)
and pays the gas. It can refuse to relay, but it cannot change or forge a move: NEAR checks the
guest's signature, and the contract identifies the player by `predecessor_account_id`. The
relayer only relays zero-deposit calls to the game's play methods from `p-*` guest accounts.
Anyone with their own testnet NEAR can call the contract directly instead.

## What you still have to trust

- **drand:** a threshold of League of Entropy members could, together, compute a future beacon.
- **NEAR validators:** block timestamps decide the deadline. A validator would have to delay the
  chain clock by more than the 2-round (6 s) margin to include a hit after the beacon is out.
- **Nothing else** about the rules. The hosted site, the relayer, the keeper and the villagers
  can stop working; the game state, the rules and the money stay where they are, and anyone can
  play and settle directly.
