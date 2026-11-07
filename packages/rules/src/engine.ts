// The reference state machine of Slay the Bear. contracts/game implements the same transitions;
// fixtures/vectors.json pins them together. The simulator, the in-browser demo and the
// verifier all run this file, so a round replayed here must match the chain exactly.

import { BPS, NS, type GameConfig } from "./config";
import { fromHex, sha256, toHex } from "./bytes";
import { verifyBeacon } from "./drand";
import { dropForRoll, isMaterial, isTrophy, isWeapon, RECIPES, WEAPON_MULT_BPS, type RecipeId } from "./items";
import {
  Tactic,
  baseHealth,
  bearHealth,
  clubPrice,
  drandTargetRound,
  drawBytes,
  earlyBonusBps,
  effectiveHealth,
  hitDamage,
  isLateHit,
  lootShare,
  marketFee,
  materialPrice,
  min,
  nearSeedRandomness,
  nextBaseTarget,
  nextHitsChain,
  noRevealPenalty,
  readDraw,
  stealAmount,
  tacticCommitment,
  treasuryReward,
  weight,
} from "./math";

export class GameError extends Error {
  constructor(public readonly code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export interface Participant {
  account: string;
  early: bigint;
  late: bigint;
  hits: number;
}

export interface Drop {
  account: string;
  tokenId: string;
  qty: bigint;
  draw: number;
}

export interface Settlement {
  outcome: "win" | "loss";
  tactic: Tactic;
  revealed: boolean;
  effectiveHealth: bigint;
  totalWeight: bigint;
  reward: bigint;
  steal: bigint;
  penalty: bigint;
  tip: bigint;
  randomness: string;
  beaconRound: bigint | null;
  beaconSignature: string | null;
  drops: Drop[];
  settledAt: bigint;
  settler: string;
}

export interface Round {
  id: number;
  openedAt: bigint;
  deadline: bigint;
  targetDrandRound: bigint;
  baseHealth: bigint;
  hoardAtOpen: bigint;
  health: bigint;
  commitment: string | null;
  reveal: { tactic: Tactic; salt: string } | null;
  participants: Participant[];
  index: Map<string, number>;
  totalEarly: bigint;
  totalLate: bigint;
  hits: number;
  hitsChain: string;
  settlement: Settlement | null;
  lootClaimed: bigint;
  claimed: Set<string>;
}

export interface Listing {
  id: number;
  seller: string;
  tokenId: string;
  qty: bigint;
  price: bigint;
}

export interface GameEvent {
  event: string;
  at: bigint;
  [key: string]: unknown;
}

/** The drand round handed to `settle`: its number and its signature. */
export interface SettleBeacon {
  round: bigint;
  signature: string;
}

export type RoundStatus = "open" | "ended" | "settled";

export const ZERO_CHAIN = "00".repeat(32);

export class Game {
  readonly ids: { treasury: string; reserve: string; bear: string; smith: string; loot: string; market: string };
  readonly balances = new Map<string, bigint>();
  totalSupply: bigint;
  burned = 0n;
  readonly items = new Map<string, Map<string, bigint>>();
  readonly itemSupply = new Map<string, bigint>();
  readonly pouchClaimed = new Set<string>();
  pouchDay = -1n;
  pouchesToday = 0;
  readonly rounds = new Map<number, Round>();
  nextRoundId = 1;
  pendingCommit: { roundId: number; hash: string } | null = null;
  readonly listings = new Map<number, Listing>();
  nextListingId = 1;
  bearWonLast = false;
  /** Base health target for the next round, moved by the difficulty adjustment. */
  nextBase: bigint;
  /** Raw damage of the last `effortWindow` settled rounds, oldest first. */
  readonly recentDamage: bigint[] = [];
  readonly events: GameEvent[] = [];

  constructor(
    readonly config: GameConfig,
    readonly contractId = "slay.testnet",
  ) {
    const c = config;
    if (c.treasuryInit + c.reserveInit !== c.totalSupply) throw new GameError("bad_config", "treasury + reserve must equal supply");
    if (c.smith.initialFloat > c.treasuryInit) throw new GameError("bad_config", "smith float larger than treasury");
    this.ids = {
      treasury: `treasury.${contractId}`,
      reserve: `pouches.${contractId}`,
      bear: `bear.${contractId}`,
      smith: `smith.${contractId}`,
      loot: `loot.${contractId}`,
      market: `market.${contractId}`,
    };
    this.totalSupply = c.totalSupply;
    this.nextBase = c.minHealth;
    this.balances.set(this.ids.treasury, c.treasuryInit - c.smith.initialFloat);
    this.balances.set(this.ids.smith, c.smith.initialFloat);
    this.balances.set(this.ids.reserve, c.reserveInit);
    this.mintItem(this.ids.smith, "club", c.smith.initialClubs);
  }

  // ---------- ledger ----------

  bal(account: string): bigint {
    return this.balances.get(account) ?? 0n;
  }

  itemBal(account: string, tokenId: string): bigint {
    return this.items.get(account)?.get(tokenId) ?? 0n;
  }

  isSpecial(account: string): boolean {
    return Object.values(this.ids).includes(account);
  }

  private requirePlayer(actor: string) {
    if (this.isSpecial(actor)) throw new GameError("special_account", actor);
  }

  private move(from: string, to: string, amount: bigint) {
    if (amount === 0n) return;
    if (amount < 0n) throw new GameError("negative_amount");
    const fb = this.bal(from);
    if (fb < amount) throw new GameError("insufficient_balance", from);
    this.balances.set(from, fb - amount);
    this.balances.set(to, this.bal(to) + amount);
  }

  private burn(from: string, amount: bigint) {
    if (amount === 0n) return;
    const fb = this.bal(from);
    if (fb < amount) throw new GameError("insufficient_balance", from);
    this.balances.set(from, fb - amount);
    this.totalSupply -= amount;
    this.burned += amount;
  }

  private setItem(account: string, tokenId: string, qty: bigint) {
    let m = this.items.get(account);
    if (!m) this.items.set(account, (m = new Map()));
    if (qty === 0n) m.delete(tokenId);
    else m.set(tokenId, qty);
  }

  private mintItem(account: string, tokenId: string, qty: bigint) {
    if (qty <= 0n) return;
    this.setItem(account, tokenId, this.itemBal(account, tokenId) + qty);
    this.itemSupply.set(tokenId, (this.itemSupply.get(tokenId) ?? 0n) + qty);
  }

  private burnItem(account: string, tokenId: string, qty: bigint) {
    if (qty <= 0n) return;
    const b = this.itemBal(account, tokenId);
    if (b < qty) throw new GameError("insufficient_items", `${account} ${tokenId}`);
    this.setItem(account, tokenId, b - qty);
    this.itemSupply.set(tokenId, (this.itemSupply.get(tokenId) ?? 0n) - qty);
  }

  private moveItem(from: string, to: string, tokenId: string, qty: bigint) {
    if (qty <= 0n) throw new GameError("bad_quantity");
    const b = this.itemBal(from, tokenId);
    if (b < qty) throw new GameError("insufficient_items", `${from} ${tokenId}`);
    this.setItem(from, tokenId, b - qty);
    this.setItem(to, tokenId, this.itemBal(to, tokenId) + qty);
  }

  private emit(event: string, at: bigint, data: Record<string, unknown>) {
    this.events.push({ event, at, ...data });
  }

  // ---------- views ----------

  playerSupply(): bigint {
    const i = this.ids;
    return this.totalSupply - this.bal(i.treasury) - this.bal(i.reserve) - this.bal(i.bear) - this.bal(i.smith) - this.bal(i.loot);
  }

  currentRound(): Round | null {
    const last = this.rounds.get(this.nextRoundId - 1);
    return last && !last.settlement ? last : null;
  }

  roundStatus(r: Round, now: bigint): RoundStatus {
    if (r.settlement) return "settled";
    return now >= r.deadline ? "ended" : "open";
  }

  peakRecentDamage(): bigint {
    return this.recentDamage.reduce((m, d) => (d > m ? d : m), 0n);
  }

  clubPriceNow(): bigint {
    return clubPrice(this.config, this.itemBal(this.ids.smith, "club"), this.bearWonLast);
  }

  materialPriceNow(tokenId: "wood" | "iron"): bigint {
    return materialPrice(this.config, tokenId, this.itemBal(this.ids.smith, tokenId));
  }

  /** Sum of all balances, and supply plus burned, must equal what was minted. */
  checkInvariants(): void {
    let sum = 0n;
    for (const v of this.balances.values()) {
      if (v < 0n) throw new GameError("invariant", "negative balance");
      sum += v;
    }
    if (sum !== this.totalSupply) throw new GameError("invariant", `balances ${sum} != supply ${this.totalSupply}`);
    if (this.totalSupply + this.burned !== this.config.totalSupply) throw new GameError("invariant", "supply + burned != minted");
  }

  // ---------- player actions ----------

  claimPouch(actor: string, now: bigint): bigint {
    this.requirePlayer(actor);
    if (this.pouchClaimed.has(actor)) throw new GameError("pouch_already_claimed");
    const day = now / (86_400n * NS);
    if (day !== this.pouchDay) {
      this.pouchDay = day;
      this.pouchesToday = 0;
    }
    if (this.pouchesToday >= this.config.pouchesPerDay) throw new GameError("pouch_cap_reached");
    const amount = min(this.config.pouchAmount, this.bal(this.ids.reserve));
    if (amount === 0n) throw new GameError("reserve_empty");
    this.move(this.ids.reserve, actor, amount);
    this.pouchClaimed.add(actor);
    this.pouchesToday += 1;
    this.emit("pouch", now, { account: actor, amount });
    return amount;
  }

  transfer(actor: string, to: string, amount: bigint, now: bigint) {
    this.requirePlayer(actor);
    if (this.isSpecial(to)) throw new GameError("special_account", to);
    if (amount <= 0n) throw new GameError("bad_amount");
    this.move(actor, to, amount);
    this.emit("transfer", now, { from: actor, to, amount });
  }

  openRound(actor: string, now: bigint): Round {
    if (this.currentRound()) throw new GameError("round_in_progress");
    const c = this.config;
    const id = this.nextRoundId;
    const deadline = now + c.roundSecs * NS;
    const supply = this.playerSupply();
    const base = baseHealth(c, supply, this.nextBase);
    const hoard = this.bal(this.ids.bear);
    const commitment = this.pendingCommit && this.pendingCommit.roundId === id ? this.pendingCommit.hash : null;
    this.pendingCommit = null;
    const r: Round = {
      id,
      openedAt: now,
      deadline,
      targetDrandRound: drandTargetRound(c, deadline),
      baseHealth: base,
      hoardAtOpen: hoard,
      health: bearHealth(c, base, hoard, supply, this.peakRecentDamage()),
      commitment,
      reveal: null,
      participants: [],
      index: new Map(),
      totalEarly: 0n,
      totalLate: 0n,
      hits: 0,
      hitsChain: ZERO_CHAIN,
      settlement: null,
      lootClaimed: 0n,
      claimed: new Set(),
    };
    this.rounds.set(id, r);
    this.nextRoundId = id + 1;
    this.emit("round_open", now, {
      round: id,
      opener: actor,
      deadline,
      health: r.health,
      baseHealth: base,
      hoard,
      targetDrandRound: r.targetDrandRound,
      committed: commitment !== null,
    });
    return r;
  }

  hit(actor: string, amount: bigint, weapon: string | null, now: bigint): { round: number; damage: bigint; late: boolean } {
    this.requirePlayer(actor);
    const c = this.config;
    if (amount < c.minHit || amount > c.maxHit) throw new GameError("bad_hit_amount");
    if (this.bal(actor) < amount) throw new GameError("insufficient_balance", actor);
    let mult = BPS;
    if (weapon !== null) {
      if (!isWeapon(weapon)) throw new GameError("not_a_weapon", weapon);
      if (this.itemBal(actor, weapon) < 1n) throw new GameError("no_weapon_charge", weapon);
      mult = WEAPON_MULT_BPS[weapon];
    }
    const r = this.currentRound() ?? this.openRound(actor, now);
    if (now >= r.deadline) throw new GameError("round_ended");
    let idx = r.index.get(actor);
    if (idx === undefined) {
      if (r.participants.length >= c.maxParticipants) throw new GameError("round_full");
      idx = r.participants.length;
      r.participants.push({ account: actor, early: 0n, late: 0n, hits: 0 });
      r.index.set(actor, idx);
    }
    const p = r.participants[idx]!;
    if (p.hits >= c.maxHitsPerAccount) throw new GameError("too_many_hits");
    if (weapon !== null) this.burnItem(actor, weapon, 1n);
    this.burn(actor, amount);
    const bonus = earlyBonusBps(r.openedAt, r.deadline, now, c.earlyBonusMaxBps);
    const damage = hitDamage(amount, mult, bonus);
    const late = isLateHit(r.openedAt, r.deadline, now, c.lateWindowBps);
    if (late) {
      p.late += damage;
      r.totalLate += damage;
    } else {
      p.early += damage;
      r.totalEarly += damage;
    }
    p.hits += 1;
    r.hits += 1;
    r.hitsChain = toHex(nextHitsChain(fromHex(r.hitsChain), actor, amount, damage, now, weapon));
    this.emit("hit", now, { round: r.id, account: actor, amount, weapon, damage, late });
    return { round: r.id, damage, late };
  }

  claim(actor: string, roundId: number, now: bigint): bigint {
    const r = this.rounds.get(roundId);
    if (!r || !r.settlement) throw new GameError("not_settled");
    if (r.settlement.outcome !== "win") throw new GameError("round_lost");
    const idx = r.index.get(actor);
    if (idx === undefined) throw new GameError("not_a_raider");
    if (r.claimed.has(actor)) throw new GameError("already_claimed");
    const p = r.participants[idx]!;
    const share = lootShare(weight(p.early, p.late, r.settlement.tactic), r.settlement.totalWeight, r.settlement.reward);
    r.claimed.add(actor);
    r.lootClaimed += share;
    this.move(this.ids.loot, actor, share);
    this.emit("claim", now, { round: roundId, account: actor, amount: share });
    return share;
  }

  craft(actor: string, recipe: RecipeId, trophyId: string | null, now: bigint) {
    this.requirePlayer(actor);
    const rec = RECIPES[recipe];
    if (!rec) throw new GameError("unknown_recipe", recipe);
    if (rec.trophy > 0n && (trophyId === null || !isTrophy(trophyId) || this.itemBal(actor, trophyId) < 1n)) {
      throw new GameError("need_trophy");
    }
    if (this.itemBal(actor, "wood") < rec.wood) throw new GameError("need_wood");
    if (this.itemBal(actor, "iron") < rec.iron) throw new GameError("need_iron");
    if (this.bal(actor) < rec.fee) throw new GameError("insufficient_balance", actor);
    this.burnItem(actor, "wood", rec.wood);
    this.burnItem(actor, "iron", rec.iron);
    if (rec.trophy > 0n && trophyId) this.burnItem(actor, trophyId, rec.trophy);
    this.burn(actor, rec.fee);
    this.mintItem(actor, recipe, rec.charges);
    this.emit("craft", now, { account: actor, recipe, trophy: trophyId, charges: rec.charges, fee: rec.fee });
  }

  transferItem(actor: string, to: string, tokenId: string, qty: bigint, now: bigint) {
    this.requirePlayer(actor);
    if (this.isSpecial(to)) throw new GameError("special_account", to);
    this.moveItem(actor, to, tokenId, qty);
    this.emit("item_transfer", now, { from: actor, to, tokenId, qty });
  }

  list(actor: string, tokenId: string, qty: bigint, price: bigint, now: bigint): number {
    this.requirePlayer(actor);
    if (qty <= 0n || price <= 0n) throw new GameError("bad_listing");
    this.moveItem(actor, this.ids.market, tokenId, qty);
    const id = this.nextListingId++;
    this.listings.set(id, { id, seller: actor, tokenId, qty, price });
    this.emit("list", now, { listing: id, seller: actor, tokenId, qty, price });
    return id;
  }

  buy(actor: string, listingId: number, qty: bigint, now: bigint) {
    this.requirePlayer(actor);
    const l = this.listings.get(listingId);
    if (!l) throw new GameError("no_listing");
    if (l.seller === actor) throw new GameError("own_listing");
    if (qty <= 0n || qty > l.qty) throw new GameError("bad_quantity");
    const cost = l.price * qty;
    if (this.bal(actor) < cost) throw new GameError("insufficient_balance", actor);
    const fee = marketFee(this.config, cost);
    this.burn(actor, fee);
    this.move(actor, l.seller, cost - fee);
    this.moveItem(this.ids.market, actor, l.tokenId, qty);
    l.qty -= qty;
    if (l.qty === 0n) this.listings.delete(listingId);
    this.emit("buy", now, { listing: listingId, buyer: actor, seller: l.seller, tokenId: l.tokenId, qty, cost, fee });
  }

  cancel(actor: string, listingId: number, now: bigint) {
    const l = this.listings.get(listingId);
    if (!l) throw new GameError("no_listing");
    if (l.seller !== actor) throw new GameError("not_seller");
    this.moveItem(this.ids.market, actor, l.tokenId, l.qty);
    this.listings.delete(listingId);
    this.emit("cancel", now, { listing: listingId, seller: actor });
  }

  /** A player buys club charges from the smith. */
  buyFromSmith(actor: string, qty: bigint, now: bigint): bigint {
    this.requirePlayer(actor);
    if (qty <= 0n) throw new GameError("bad_quantity");
    const stock = this.itemBal(this.ids.smith, "club");
    if (stock < qty) throw new GameError("smith_out_of_stock");
    const price = clubPrice(this.config, stock, this.bearWonLast);
    const cost = price * qty;
    if (this.bal(actor) < cost) throw new GameError("insufficient_balance", actor);
    const burnPart = (cost * this.config.smith.burnShareBps) / BPS;
    this.burn(actor, burnPart);
    this.move(actor, this.ids.smith, cost - burnPart);
    this.moveItem(this.ids.smith, actor, "club", qty);
    this.emit("smith_sell", now, { account: actor, qty, price, cost, burned: burnPart });
    return cost;
  }

  /** A player sells wood or iron to the smith. */
  sellToSmith(actor: string, tokenId: string, qty: bigint, now: bigint): bigint {
    this.requirePlayer(actor);
    if (!isMaterial(tokenId)) throw new GameError("smith_only_buys_materials");
    if (qty <= 0n) throw new GameError("bad_quantity");
    const price = materialPrice(this.config, tokenId, this.itemBal(this.ids.smith, tokenId));
    const pay = price * qty;
    if (this.bal(this.ids.smith) < pay) throw new GameError("smith_out_of_money");
    this.moveItem(actor, this.ids.smith, tokenId, qty);
    this.move(this.ids.smith, actor, pay);
    this.emit("smith_buy", now, { account: actor, tokenId, qty, price, paid: pay });
    return pay;
  }

  // ---------- NPC actions ----------

  smithCraft(actor: string, bundles: bigint, now: bigint) {
    if (actor !== this.ids.smith) throw new GameError("only_smith");
    if (bundles <= 0n) throw new GameError("bad_quantity");
    const rec = RECIPES.club;
    const fee = rec.fee * bundles;
    if (this.itemBal(actor, "wood") < rec.wood * bundles) throw new GameError("need_wood");
    if (this.bal(actor) < fee) throw new GameError("insufficient_balance", actor);
    this.burnItem(actor, "wood", rec.wood * bundles);
    this.burn(actor, fee);
    this.mintItem(actor, "club", rec.charges * bundles);
    this.emit("smith_craft", now, { bundles, charges: rec.charges * bundles, fee });
  }

  bearCommit(actor: string, roundId: number, hashHex: string, now: bigint) {
    if (actor !== this.ids.bear) throw new GameError("only_bear");
    if (roundId !== this.nextRoundId) throw new GameError("wrong_round");
    if (fromHex(hashHex).length !== 32) throw new GameError("bad_commitment");
    this.pendingCommit = { roundId, hash: hashHex.toLowerCase() };
    this.emit("bear_commit", now, { round: roundId, commitment: hashHex.toLowerCase() });
  }

  bearReveal(actor: string, roundId: number, tactic: Tactic, saltHex: string, now: bigint) {
    if (actor !== this.ids.bear) throw new GameError("only_bear");
    const r = this.rounds.get(roundId);
    if (!r || r.settlement) throw new GameError("not_revealable");
    if (now < r.deadline) throw new GameError("round_not_over");
    if (!r.commitment) throw new GameError("no_commitment");
    if (r.reveal) throw new GameError("already_revealed");
    if (!(tactic in Tactic) || tactic < 0 || tactic > 3) throw new GameError("bad_tactic");
    if (toHex(tacticCommitment(tactic, fromHex(saltHex))) !== r.commitment) throw new GameError("commitment_mismatch");
    r.reveal = { tactic, salt: saltHex.toLowerCase() };
    this.emit("bear_reveal", now, { round: roundId, tactic });
  }

  // ---------- settlement ----------

  /**
   * Settles a finished round. In drand mode `beacon` must be the round fixed at the open;
   * in near-seed mode `nearSeed` stands for env::random_seed() of the settling receipt.
   */
  settle(actor: string, roundId: number, beacon: SettleBeacon | null, now: bigint, nearSeed?: Uint8Array): Settlement {
    this.requirePlayer(actor);
    const c = this.config;
    const r = this.rounds.get(roundId);
    if (!r) throw new GameError("no_round");
    if (r.settlement) throw new GameError("already_settled");
    if (now < r.deadline) throw new GameError("round_not_over");
    if (r.commitment && !r.reveal && now < r.deadline + c.revealWindowSecs * NS) throw new GameError("reveal_window_open");

    let randomness: Uint8Array;
    if (c.randomness.mode === "drand") {
      if (!beacon || beacon.round !== r.targetDrandRound) throw new GameError("wrong_beacon_round");
      if (!verifyBeacon(beacon.round, beacon.signature, c.randomness.publicKey)) throw new GameError("bad_beacon");
      randomness = sha256(fromHex(beacon.signature));
    } else {
      if (!nearSeed || nearSeed.length !== 32) throw new GameError("missing_seed");
      randomness = nearSeedRandomness(nearSeed, fromHex(r.hitsChain), r.id);
    }

    const tactic = r.reveal?.tactic ?? Tactic.None;
    let penalty = 0n;
    if (r.commitment && !r.reveal) {
      penalty = noRevealPenalty(c, this.bal(this.ids.bear));
      this.move(this.ids.bear, this.ids.treasury, penalty);
    }

    let totalWeight = 0n;
    for (const p of r.participants) totalWeight += weight(p.early, p.late, tactic);
    const effHealth = effectiveHealth(r.health, tactic);
    const win = r.participants.length > 0 && totalWeight > 0n && totalWeight >= effHealth;

    let reward = 0n;
    let steal = 0n;
    const drops: Drop[] = [];
    if (win) {
      const fromTreasury = treasuryReward(c, this.bal(this.ids.treasury), r.baseHealth);
      const hoard = this.bal(this.ids.bear);
      this.move(this.ids.bear, this.ids.loot, hoard);
      this.move(this.ids.treasury, this.ids.loot, fromTreasury);
      reward = hoard + fromTreasury;
      for (let i = 0; i < c.dropDraws; i++) {
        const { target, roll } = readDraw(drawBytes(randomness, r.id, i), totalWeight);
        let cum = 0n;
        let winner = r.participants[r.participants.length - 1]!.account;
        for (const p of r.participants) {
          cum += weight(p.early, p.late, tactic);
          if (cum > target) {
            winner = p.account;
            break;
          }
        }
        const d = dropForRoll(roll, r.id, i);
        this.mintItem(winner, d.tokenId, d.qty);
        drops.push({ account: winner, tokenId: d.tokenId, qty: d.qty, draw: i });
      }
      this.bearWonLast = false;
    } else {
      steal = stealAmount(c, this.bal(this.ids.treasury), r.baseHealth, tactic);
      this.move(this.ids.treasury, this.ids.bear, steal);
      this.bearWonLast = true;
    }
    const tip = min(c.settleTip, this.bal(this.ids.treasury));
    this.move(this.ids.treasury, actor, tip);
    this.nextBase = nextBaseTarget(c, r.baseHealth, win);
    this.recentDamage.push(r.totalEarly + r.totalLate);
    while (this.recentDamage.length > c.effortWindow) this.recentDamage.shift();

    r.settlement = {
      outcome: win ? "win" : "loss",
      tactic,
      revealed: r.reveal !== null,
      effectiveHealth: effHealth,
      totalWeight,
      reward,
      steal,
      penalty,
      tip,
      randomness: toHex(randomness),
      beaconRound: beacon?.round ?? null,
      beaconSignature: beacon?.signature ?? null,
      drops,
      settledAt: now,
      settler: actor,
    };
    this.emit("settle", now, {
      round: r.id,
      outcome: r.settlement.outcome,
      tactic,
      revealed: r.settlement.revealed,
      totalWeight,
      effectiveHealth: effHealth,
      reward,
      steal,
      penalty,
      tip,
      settler: actor,
      randomness: r.settlement.randomness,
      beaconRound: r.settlement.beaconRound,
      drops,
    });
    return r.settlement;
  }
}
