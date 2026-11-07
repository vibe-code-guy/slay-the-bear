# Game design

Slay the Bear is a memecoin and a town game in one NEAR contract. This file is the loop on
paper, the final rules, the NPC rules and the simulation that chose the numbers. Every number
here is in `packages/rules/src/config.ts` and fixed at the contract's `new()`.

## The loop

| Every | The player |
| --- | --- |
| 30 seconds | Hits the Bear (burns $SLAY), watches the health bar, the win chance and the town feed. Crafts a weapon, trades on the market or with the smith. |
| Raid (5 minutes on `game.slaythebear.testnet`, 10 in the demo preset, 24 hours in the season preset) | Decides when to hit: early hits deal up to 1.5x damage, late hits risk a Feint. At the deadline, settles the raid (or waits for someone else to), sees which tactic the beacon drew and whether the town won, claims loot. |
| Session | Grows a stash of materials and weapons, hunts the 5% Bear trophies, crafts a Bear-slayer (2x damage), and watches the Bear's hoard grow while the town loses, waiting for the raid that wins it back. |

## A raid

1. **Open.** The first hit (or `open_round`) opens a raid. The open fixes, from on-chain state
   only: the Bear's health, its mood, and the drand round that will decide the raid (the first
   quicknet round at or after the deadline, plus 2). The smith forges clubs if its stock is low.
2. **Hits.** A hit burns 1 to 1,000 $SLAY. Damage = $SLAY × weapon multiplier × early bonus.
   The bonus falls linearly from 1.5x at the open to 1.0x at the deadline. Hits in the last 10%
   of the raid are *late*. Each raider may hit 50 times; a raid takes 300 raiders.
3. **Settle.** After the deadline anyone calls `settle` with the deciding drand round's
   signature and earns a 5 $SLAY tip. The contract verifies the BLS signature on-chain, takes
   randomness = sha256(signature) and draws:
   - the Bear's **tactic**: a roll in [0, 10000) against the mood weights (the mood 55%, each
     other tactic 15%);
   - on a win, **3 item drops**, each going to a raider picked with probability proportional to
     their damage.
4. **Outcome.** The town wins if its total weight (damage, with late hits halved under Feint)
   reaches the Bear's effective health (+20% under Armor).
   - **Win:** raiders split the Bear's whole hoard plus a treasury reward (1.5x base health, at
     most 0.5% of the treasury) in proportion to their weight, and claim it with `claim`.
   - **Loss:** the Bear steals 0.5x base health (at most 1% of the treasury; 1.5x that under
     Rage) into its hoard. The burned $SLAY stays burned.

### The Bear's tactics

| Tactic | Effect |
| --- | --- |
| None | No trick this round. |
| Armor | 20% more health. |
| Rage | If the Bear wins, it steals 50% more. |
| Feint | Late hits count half, for the kill and for the loot. |

The **mood** (favourite tactic) is set at the open from the last settled raid:

1. first raid of a season: Armor;
2. 35% or more of the last raid's damage came late: Feint;
3. the Bear won the last raid: Rage;
4. the town won by less than 25%: Armor;
5. otherwise: Rage.

Players see the mood and the odds during the raid. The tactic itself is drawn from the beacon
after the deadline, so nobody knows it while hits are allowed, including whoever deployed the
game. The screen shows the win chance "if the raid ended now", summed over the four tactics.

### Difficulty and the hoard

- **Base health** starts at 500 $SLAY (game and demo presets) or 2,000 (season). After a town
  win the next base is 10% higher; after a Bear win 15% lower; never below the floor and never
  above 25% of the $SLAY players hold.
- **Health** = base + 50% of the hoard, capped at 25% of the player supply and at the best raw
  damage of the last 6 raids (the *effort cap*), never below the floor.
- Because only half the hoard adds to health, a losing streak makes the jackpot grow faster than
  the Bear. Because of the effort cap, the Bear never outgrows what the town has recently shown
  it can deal. A town that stops fighting meets a weak Bear guarding a big jackpot, so the game
  cannot deadlock.

## The economy

| Flow | Rule |
| --- | --- |
| Supply | 1,000,000,000 $SLAY minted once at `new()`: 799,000,000 to the treasury, 1,000,000 to the smith, 200,000,000 to the pouch chest. No team, presale or airdrop allocation. Nothing can mint again. |
| Starter pouch | 1,000 $SLAY per account, once, at most 200 pouches a day across the game. |
| Burns (sinks) | Every hit. Every craft fee. Half of every smith sale. 2% of every market sale. The smith's own forging fee. |
| Treasury out | Win rewards, the Bear's thefts, settlement tips. Nothing else can move it. |
| The hoard | Grows only by thefts; paid out in full to the raiders of the next won raid. |
| Smith | Sells club charges at 3 $SLAY × 2T / (stock + T) (T = 200, +20% right after a Bear win); half of each sale is burned, half is its income. Buys wood (4) and iron (8) at prices that fall as its stock grows. Forges 10 club charges from 2 wood and 10 $SLAY at each open while its stock is under 100. |
| Items | NEP-245 tokens in the same contract. Wood and iron drop from won raids (3 wood 60%, 2 iron 35%); a unique Bear trophy drops 5% of the time. Recipes: club = 2 wood + 10 $SLAY; sword = 2 wood + 3 iron + 50 $SLAY; Bear-slayer = 5 iron + 1 trophy + 200 $SLAY; each makes 10 charges. Weapons multiply damage 1.25x, 1.5x and 2x; one charge per hit. |
| Market | Any player lists any item at a $SLAY price; the item waits in the market account until it sells or the seller cancels. 2% of each sale is burned. |

All math is integer and rounds down. The contract (`contracts/game/src/rules.rs`) and the
TypeScript rules (`packages/rules/src/math.ts`) implement the same formulas line for line;
`fixtures/vectors.json` replays a scripted game through both and compares every balance, item,
round and view after every step.

## NPCs

| NPC | Where its rule runs | Keys |
| --- | --- | --- |
| The Bear | In the contract: mood at the open (`bear_mood`), tactic drawn from the beacon at settlement (`draw_tactic`). | None. Its hoard is a ledger entry that only the rules move. |
| The smith | In the contract: prices and forging at each open (`smith_forge_bundles`). | None. |
| Villagers (Bjorn the Brave, Fern the Follower, Sid the Sniper, Sara the Saver) | `packages/agents`, following `villagerHit` in `packages/rules/src/npc.ts`. | Ordinary player accounts. They claim a pouch like anyone and can only make moves any player can make. |
| The keeper | `packages/agents/src/keeper.ts`: settles a finished raid when no player does. | Ordinary player account. Settling is open to anyone; the contract checks the beacon. |

Villager personalities: *brave* hits early when the reward is at least worth the Bear's health;
*follower* joins once a third of the health is gone; *sniper* waits for the last tenth and
finishes the Bear if it can; *saver* hits only when the reward is 1.4x the health. The screen
explains the Bear's mood and the smith's plans in their own words (`explainBearMood`,
`smithRestock`).

### Why the Bear has no key

The first build had the Bear commit to a tactic before each raid and reveal it after the
deadline, from an agent holding a function-call key. That prevents the Bear from changing its
tactic after seeing the hits, but its operator would still know the tactic in advance and could
play with that knowledge. Drawing the tactic from the same drand beacon that decides the drops
removes that edge: nobody knows the tactic before the deadline, there is no reveal to miss, and
no NPC key to protect. The mood keeps the Bear's character: it still reacts to the last raid.

## Simulation

`npm run simulate` plays every scenario with the real engine, the NPC rules and a local BLS
beacon, and writes `sim-out/*.csv` and `sim-out/report.html`. `npm run fast-forward` does a week;
the `/fast-forward` page does the same in the browser. Scenarios
(`packages/rules/src/sim.ts`):

- **coordinated**: an active community, most players hit early or join once the raid is going;
- **free-riders**: most players wait for others to commit first;
- **whale**: a small town with one large holder who hits early every raid;
- **ghost-town**: six players who rarely show up.

Results with the launch parameters, seed 1 (season: 60 days of daily raids; demo: 2 days of
10-minute raids):

| Scenario | Raids | Town wins | Longest Bear streak | Biggest jackpot ($SLAY) | Burned ($SLAY) |
| --- | --- | --- | --- | --- | --- |
| season, coordinated | 60 | 85% | 6 | 388,686 | 1,919,715 |
| season, free-riders | 60 | 65% | 2 | 11,275 | 97,316 |
| season, whale | 60 | 77% | 2 | 42,079 | 442,699 |
| season, ghost-town | 60 | 8% | 23 | 33,650 | 16,940 |
| demo, coordinated | 240 | 70% | 5 | 122,281 | 4,315,024 |
| demo, free-riders | 240 | 67% | 3 | 26,731 | 701,172 |
| demo, whale | 240 | 69% | 7 | 56,182 | 1,659,996 |
| demo, ghost-town | 240 | 40% | 7 | 3,324 | 93,511 |

### Tuning decisions

| Decision | Alternatives tried | Why |
| --- | --- | --- |
| Health from a difficulty target (+10% after a town win, -15% after a loss) | Health as a fixed share of supply | A fixed share deadlocked: once the town lost, it kept losing. |
| Hoard adds 50% to health | 100% | At 100% a losing streak made the Bear grow as fast as its jackpot. |
| Effort cap at 1.0x the best of the last 6 raids | 2.0x (`scripts/tune.ts`) | At 2.0x the Bear could pin its health at twice the town's best and win up to 95 raids in a row (demo, whale). At 1.0x the longest streaks for active towns are 5 to 7 raids and win rates stay between 65% and 85%. |
| Effort window of 6 raids | Last raid only | One quiet raid would make the next Bear trivial. |
| Tactic drawn from the beacon, mood 55% | Bear agent commits and reveals | See "Why the Bear has no key". |
| Early bonus 1.5x falling to 1.0x | Flat damage | Without it, everyone waits for others to commit first (the free-rider scenario). |
| Feint halves late hits | No late-hit risk | Gives snipers a cost and makes the mood worth reading. |
