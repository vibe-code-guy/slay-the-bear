//! Slay the Bear: a memecoin and a town game in one NEAR contract.
//!
//! - $SLAY is an NEP-141 token; weapons, materials and trophies are NEP-245 items.
//! - Every round a Bear appears. Players burn $SLAY to hit it. If the town kills it before the
//!   deadline, raiders split its hoard plus a treasury reward by damage; if not, it takes a slice
//!   of the treasury into its own balance.
//! - Drops are decided by the drand quicknet round fixed at the open, verified on-chain.
//! - The Bear commits to its tactic before the round opens and reveals it after the deadline.
//! - The config is fixed at `new()`. The deployment script deletes every access key on this
//!   account afterwards, so nobody can upgrade, pause, mint or withdraw.
//!
//! The same state machine is implemented in packages/rules/src/engine.ts; fixtures/vectors.json
//! replays one scripted game through both and checks they agree after every step.

pub mod config;
pub mod drand;
pub mod items;
pub mod rules;
mod standards;
mod views;

use config::{Config, RandomnessMode};
use items::{drop_for_roll, is_material, is_trophy, recipe, weapon_mult_bps};
use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::StorageManagement;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::store::{IterableMap, LookupMap, LookupSet};
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};
use rules::*;

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Ft,
    Items,
    ItemSupply,
    Trophies,
    PouchClaimed,
    Rounds,
    Participants,
    ParticipantIndex,
    Listings,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Ids {
    pub treasury: AccountId,
    pub reserve: AccountId,
    pub bear: AccountId,
    pub smith: AccountId,
    pub loot: AccountId,
    pub market: AccountId,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Participant {
    pub account: AccountId,
    pub early: u128,
    pub late: u128,
    pub hits: u32,
    pub claimed: bool,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Drop {
    pub account: AccountId,
    pub token_id: String,
    pub qty: u128,
    pub draw: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Settlement {
    pub win: bool,
    pub tactic: u8,
    pub revealed: bool,
    pub effective_health: u128,
    pub total_weight: u128,
    pub reward: u128,
    pub steal: u128,
    pub penalty: u128,
    pub tip: u128,
    pub randomness: [u8; 32],
    pub beacon_round: Option<u64>,
    pub beacon_signature: Option<Vec<u8>>,
    pub drops: Vec<Drop>,
    pub settled_at: u64,
    pub settler: AccountId,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct RoundMeta {
    pub id: u32,
    pub opened_at: u64,
    pub deadline: u64,
    pub target_drand_round: u64,
    pub base_health: u128,
    pub hoard_at_open: u128,
    pub health: u128,
    pub commitment: Option<[u8; 32]>,
    pub reveal: Option<(u8, [u8; 32])>,
    pub participants: u32,
    pub total_early: u128,
    pub total_late: u128,
    pub hits: u32,
    pub hits_chain: [u8; 32],
    pub settlement: Option<Settlement>,
    pub loot_claimed: u128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Listing {
    pub id: u64,
    pub seller: AccountId,
    pub token_id: String,
    pub qty: U128,
    pub price: U128,
}

#[near(serializers = [json])]
pub struct HitResult {
    pub round: u32,
    pub damage: U128,
    pub late: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    config: Config,
    ids: Ids,
    token: FungibleToken,
    burned: u128,
    items: LookupMap<(AccountId, String), u128>,
    item_supply: LookupMap<String, u128>,
    trophies_of: LookupMap<AccountId, Vec<String>>,
    pouch_claimed: LookupSet<AccountId>,
    pouch_day: u64,
    pouches_today: u32,
    rounds: LookupMap<u32, RoundMeta>,
    participants: LookupMap<(u32, u32), Participant>,
    participant_index: LookupMap<(u32, AccountId), u32>,
    next_round_id: u32,
    pending_commit: Option<(u32, [u8; 32])>,
    listings: IterableMap<u64, Listing>,
    next_listing_id: u64,
    bear_won_last: bool,
    next_base: u128,
    recent_damage: Vec<u128>,
}

pub(crate) fn fail(code: &str) -> ! {
    env::panic_str(code)
}

pub(crate) fn emit(standard: &str, event: &str, data: Value) {
    let v = json!({ "standard": standard, "version": "1.0.0", "event": event, "data": [data] });
    env::log_str(&format!("EVENT_JSON:{v}"));
}

fn u(v: u128) -> String {
    v.to_string()
}

#[near]
impl Contract {
    #[init]
    pub fn new(config: Config) -> Self {
        config.validate();
        let me = env::current_account_id();
        let sub = |p: &str| -> AccountId { format!("{p}.{me}").parse().unwrap() };
        let ids = Ids {
            treasury: sub("treasury"),
            reserve: sub("pouches"),
            bear: sub("bear"),
            smith: sub("smith"),
            loot: sub("loot"),
            market: sub("market"),
        };
        let mut token = FungibleToken::new(StorageKey::Ft);
        for a in [&ids.treasury, &ids.reserve, &ids.bear, &ids.smith, &ids.loot, &ids.market] {
            token.internal_register_account(a);
        }
        let float = config.smith.initial_float.0;
        let treasury = config.treasury_init.0 - float;
        token.internal_deposit(&ids.treasury, treasury);
        token.internal_deposit(&ids.reserve, config.reserve_init.0);
        if float > 0 {
            token.internal_deposit(&ids.smith, float);
        }
        FtMint { owner_id: &ids.treasury, amount: U128(treasury), memo: Some("town treasury") }.emit();
        FtMint { owner_id: &ids.reserve, amount: config.reserve_init, memo: Some("starter pouches") }.emit();
        if float > 0 {
            FtMint { owner_id: &ids.smith, amount: U128(float), memo: Some("smith float") }.emit();
        }
        let next_base = config.min_health.0;
        let initial_clubs = config.smith.initial_clubs.0;
        let mut c = Self {
            config,
            ids: ids.clone(),
            token,
            burned: 0,
            items: LookupMap::new(StorageKey::Items),
            item_supply: LookupMap::new(StorageKey::ItemSupply),
            trophies_of: LookupMap::new(StorageKey::Trophies),
            pouch_claimed: LookupSet::new(StorageKey::PouchClaimed),
            pouch_day: u64::MAX,
            pouches_today: 0,
            rounds: LookupMap::new(StorageKey::Rounds),
            participants: LookupMap::new(StorageKey::Participants),
            participant_index: LookupMap::new(StorageKey::ParticipantIndex),
            next_round_id: 1,
            pending_commit: None,
            listings: IterableMap::new(StorageKey::Listings),
            next_listing_id: 1,
            bear_won_last: false,
            next_base,
            recent_damage: Vec::new(),
        };
        c.mint_item(&ids.smith, "club", initial_clubs);
        c
    }

    // ---------- player actions ----------

    pub fn claim_pouch(&mut self) -> U128 {
        let a = env::predecessor_account_id();
        self.require_player(&a);
        if self.pouch_claimed.contains(&a) {
            fail("pouch_already_claimed");
        }
        let now = env::block_timestamp();
        let day = now / (86_400 * NS);
        if day != self.pouch_day {
            self.pouch_day = day;
            self.pouches_today = 0;
        }
        if self.pouches_today >= self.config.pouches_per_day {
            fail("pouch_cap_reached");
        }
        let reserve = self.ids.reserve.clone();
        let amount = self.config.pouch_amount.0.min(self.bal(&reserve));
        if amount == 0 {
            fail("reserve_empty");
        }
        self.ensure_registered(&a);
        self.mv(&reserve, &a, amount);
        self.pouch_claimed.insert(a.clone());
        self.pouches_today += 1;
        emit("slay", "pouch", json!({ "account": a, "amount": u(amount) }));
        U128(amount)
    }

    pub fn open_round(&mut self) -> u32 {
        let a = env::predecessor_account_id();
        self.internal_open(&a, env::block_timestamp())
    }

    pub fn hit(&mut self, amount: U128, weapon: Option<String>) -> HitResult {
        let a = env::predecessor_account_id();
        self.require_player(&a);
        let amount = amount.0;
        let now = env::block_timestamp();
        if amount < self.config.min_hit.0 || amount > self.config.max_hit.0 {
            fail("bad_hit_amount");
        }
        if self.bal(&a) < amount {
            fail("insufficient_balance");
        }
        let mut mult = BPS;
        if let Some(w) = &weapon {
            mult = weapon_mult_bps(w).unwrap_or_else(|| fail("not_a_weapon"));
            if self.item_bal(&a, w) < 1 {
                fail("no_weapon_charge");
            }
        }
        let rid = match self.current_round_id() {
            Some(id) => id,
            None => self.internal_open(&a, now),
        };
        let mut r = self.rounds.get(&rid).unwrap().clone();
        if now >= r.deadline {
            fail("round_ended");
        }
        let key = (rid, a.clone());
        let idx = match self.participant_index.get(&key) {
            Some(i) => *i,
            None => {
                if r.participants >= self.config.max_participants {
                    fail("round_full");
                }
                let i = r.participants;
                self.participants
                    .insert((rid, i), Participant { account: a.clone(), early: 0, late: 0, hits: 0, claimed: false });
                self.participant_index.insert(key, i);
                r.participants += 1;
                i
            }
        };
        let mut p = self.participants.get(&(rid, idx)).unwrap().clone();
        if p.hits >= self.config.max_hits_per_account {
            fail("too_many_hits");
        }
        if let Some(w) = &weapon {
            self.burn_item(&a, w, 1);
        }
        self.burn(&a, amount, "hit");
        let bonus = early_bonus_bps(r.opened_at, r.deadline, now, self.config.early_bonus_max_bps);
        let damage = hit_damage(amount, mult, bonus);
        let late = is_late_hit(r.opened_at, r.deadline, now, self.config.late_window_bps);
        if late {
            p.late += damage;
            r.total_late += damage;
        } else {
            p.early += damage;
            r.total_early += damage;
        }
        p.hits += 1;
        r.hits += 1;
        r.hits_chain = next_hits_chain(&r.hits_chain, a.as_str(), amount, damage, now, weapon.as_deref());
        self.participants.insert((rid, idx), p);
        self.rounds.insert(rid, r);
        emit(
            "slay",
            "hit",
            json!({ "round": rid, "account": a, "amount": u(amount), "weapon": weapon, "damage": u(damage), "late": late }),
        );
        HitResult { round: rid, damage: U128(damage), late }
    }

    pub fn claim(&mut self, round_id: u32) -> U128 {
        let a = env::predecessor_account_id();
        let Some(mut r) = self.rounds.get(&round_id).cloned() else { fail("not_settled") };
        let Some(s) = r.settlement.clone() else { fail("not_settled") };
        if !s.win {
            fail("round_lost");
        }
        let Some(idx) = self.participant_index.get(&(round_id, a.clone())).copied() else { fail("not_a_raider") };
        let mut p = self.participants.get(&(round_id, idx)).unwrap().clone();
        if p.claimed {
            fail("already_claimed");
        }
        let share = loot_share(weight(p.early, p.late, s.tactic), s.total_weight, s.reward);
        p.claimed = true;
        r.loot_claimed += share;
        self.participants.insert((round_id, idx), p);
        self.rounds.insert(round_id, r);
        let loot = self.ids.loot.clone();
        self.mv(&loot, &a, share);
        emit("slay", "claim", json!({ "round": round_id, "account": a, "amount": u(share) }));
        U128(share)
    }

    pub fn craft(&mut self, recipe_id: String, trophy_id: Option<String>) {
        let a = env::predecessor_account_id();
        self.require_player(&a);
        let Some(rec) = recipe(&recipe_id) else { fail("unknown_recipe") };
        if rec.trophy > 0 {
            let ok = trophy_id.as_deref().is_some_and(|t| is_trophy(t) && self.item_bal(&a, t) >= 1);
            if !ok {
                fail("need_trophy");
            }
        }
        if self.item_bal(&a, "wood") < rec.wood {
            fail("need_wood");
        }
        if self.item_bal(&a, "iron") < rec.iron {
            fail("need_iron");
        }
        if self.bal(&a) < rec.fee {
            fail("insufficient_balance");
        }
        self.burn_item(&a, "wood", rec.wood);
        self.burn_item(&a, "iron", rec.iron);
        if rec.trophy > 0 {
            if let Some(t) = &trophy_id {
                self.burn_item(&a, t, rec.trophy);
            }
        }
        self.burn(&a, rec.fee, "craft fee");
        self.mint_item(&a, &recipe_id, rec.charges);
        emit(
            "slay",
            "craft",
            json!({ "account": a, "recipe": recipe_id, "trophy": trophy_id, "charges": u(rec.charges), "fee": u(rec.fee) }),
        );
    }

    pub fn list(&mut self, token_id: String, qty: U128, price: U128) -> u64 {
        let a = env::predecessor_account_id();
        self.require_player(&a);
        if qty.0 == 0 || price.0 == 0 {
            fail("bad_listing");
        }
        let market = self.ids.market.clone();
        self.move_item(&a, &market, &token_id, qty.0);
        let id = self.next_listing_id;
        self.next_listing_id += 1;
        self.listings.insert(id, Listing { id, seller: a.clone(), token_id: token_id.clone(), qty, price });
        emit(
            "slay",
            "list",
            json!({ "listing": id, "seller": a, "tokenId": token_id, "qty": u(qty.0), "price": u(price.0) }),
        );
        id
    }

    pub fn buy(&mut self, listing_id: u64, qty: U128) {
        let a = env::predecessor_account_id();
        self.require_player(&a);
        let Some(mut l) = self.listings.get(&listing_id).cloned() else { fail("no_listing") };
        if l.seller == a {
            fail("own_listing");
        }
        let qty = qty.0;
        if qty == 0 || qty > l.qty.0 {
            fail("bad_quantity");
        }
        let cost = l.price.0.checked_mul(qty).unwrap_or_else(|| fail("overflow"));
        if self.bal(&a) < cost {
            fail("insufficient_balance");
        }
        let fee = market_fee(&self.config, cost);
        self.burn(&a, fee, "market fee");
        let seller = l.seller.clone();
        self.mv(&a, &seller, cost - fee);
        let market = self.ids.market.clone();
        self.move_item(&market, &a, &l.token_id, qty);
        l.qty = U128(l.qty.0 - qty);
        if l.qty.0 == 0 {
            self.listings.remove(&listing_id);
        } else {
            self.listings.insert(listing_id, l.clone());
        }
        emit(
            "slay",
            "buy",
            json!({ "listing": listing_id, "buyer": a, "seller": seller, "tokenId": l.token_id, "qty": u(qty), "cost": u(cost), "fee": u(fee) }),
        );
    }

    pub fn cancel(&mut self, listing_id: u64) {
        let a = env::predecessor_account_id();
        let Some(l) = self.listings.get(&listing_id).cloned() else { fail("no_listing") };
        if l.seller != a {
            fail("not_seller");
        }
        let market = self.ids.market.clone();
        self.move_item(&market, &a, &l.token_id, l.qty.0);
        self.listings.remove(&listing_id);
        emit("slay", "cancel", json!({ "listing": listing_id, "seller": a }));
    }

    pub fn buy_from_smith(&mut self, qty: U128) -> U128 {
        let a = env::predecessor_account_id();
        self.require_player(&a);
        let qty = qty.0;
        if qty == 0 {
            fail("bad_quantity");
        }
        let smith = self.ids.smith.clone();
        let stock = self.item_bal(&smith, "club");
        if stock < qty {
            fail("smith_out_of_stock");
        }
        let price = club_price(&self.config, stock, self.bear_won_last);
        let cost = price.checked_mul(qty).unwrap_or_else(|| fail("overflow"));
        if self.bal(&a) < cost {
            fail("insufficient_balance");
        }
        let burn_part = bps(cost, self.config.smith.burn_share_bps);
        self.burn(&a, burn_part, "smith sale");
        self.mv(&a, &smith, cost - burn_part);
        self.move_item(&smith, &a, "club", qty);
        emit(
            "slay",
            "smith_sell",
            json!({ "account": a, "qty": u(qty), "price": u(price), "cost": u(cost), "burned": u(burn_part) }),
        );
        U128(cost)
    }

    pub fn sell_to_smith(&mut self, token_id: String, qty: U128) -> U128 {
        let a = env::predecessor_account_id();
        self.require_player(&a);
        if !is_material(&token_id) {
            fail("smith_only_buys_materials");
        }
        let qty = qty.0;
        if qty == 0 {
            fail("bad_quantity");
        }
        let smith = self.ids.smith.clone();
        let price = material_price(&self.config, &token_id, self.item_bal(&smith, &token_id));
        let pay = price.checked_mul(qty).unwrap_or_else(|| fail("overflow"));
        if self.bal(&smith) < pay {
            fail("smith_out_of_money");
        }
        self.move_item(&a, &smith, &token_id, qty);
        self.mv(&smith, &a, pay);
        emit(
            "slay",
            "smith_buy",
            json!({ "account": a, "tokenId": token_id, "qty": u(qty), "price": u(price), "paid": u(pay) }),
        );
        U128(pay)
    }

    // ---------- NPC actions ----------

    pub fn smith_craft(&mut self, bundles: U128) {
        let a = env::predecessor_account_id();
        if a != self.ids.smith {
            fail("only_smith");
        }
        let bundles = bundles.0;
        if bundles == 0 {
            fail("bad_quantity");
        }
        let rec = recipe("club").unwrap();
        let fee = rec.fee * bundles;
        if self.item_bal(&a, "wood") < rec.wood * bundles {
            fail("need_wood");
        }
        if self.bal(&a) < fee {
            fail("insufficient_balance");
        }
        self.burn_item(&a, "wood", rec.wood * bundles);
        self.burn(&a, fee, "smith craft fee");
        self.mint_item(&a, "club", rec.charges * bundles);
        emit("slay", "smith_craft", json!({ "bundles": u(bundles), "charges": u(rec.charges * bundles), "fee": u(fee) }));
    }

    pub fn bear_commit(&mut self, round_id: u32, commitment: String) {
        if env::predecessor_account_id() != self.ids.bear {
            fail("only_bear");
        }
        if round_id != self.next_round_id {
            fail("wrong_round");
        }
        let h = drand::from_hex(&commitment).filter(|h| h.len() == 32).unwrap_or_else(|| fail("bad_commitment"));
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&h);
        self.pending_commit = Some((round_id, arr));
        emit("slay", "bear_commit", json!({ "round": round_id, "commitment": drand::to_hex(&arr) }));
    }

    pub fn bear_reveal(&mut self, round_id: u32, tactic: u8, salt: String) {
        if env::predecessor_account_id() != self.ids.bear {
            fail("only_bear");
        }
        let now = env::block_timestamp();
        let Some(mut r) = self.rounds.get(&round_id).cloned() else { fail("not_revealable") };
        if r.settlement.is_some() {
            fail("not_revealable");
        }
        if now < r.deadline {
            fail("round_not_over");
        }
        let Some(commitment) = r.commitment else { fail("no_commitment") };
        if r.reveal.is_some() {
            fail("already_revealed");
        }
        if tactic > TACTIC_FEINT {
            fail("bad_tactic");
        }
        let s = drand::from_hex(&salt).filter(|s| s.len() == 32).unwrap_or_else(|| fail("commitment_mismatch"));
        let mut salt_arr = [0u8; 32];
        salt_arr.copy_from_slice(&s);
        if tactic_commitment(tactic, &salt_arr) != commitment {
            fail("commitment_mismatch");
        }
        r.reveal = Some((tactic, salt_arr));
        self.rounds.insert(round_id, r);
        emit("slay", "bear_reveal", json!({ "round": round_id, "tactic": tactic }));
    }

    // ---------- settlement ----------

    /// Settles a finished round. In drand mode pass the drand round fixed at the open and its
    /// signature (hex); in near-seed mode pass nothing.
    pub fn settle(&mut self, round_id: u32, beacon_round: Option<u64>, signature: Option<String>) {
        let actor = env::predecessor_account_id();
        self.require_player(&actor);
        let now = env::block_timestamp();
        let Some(mut r) = self.rounds.get(&round_id).cloned() else { fail("no_round") };
        if r.settlement.is_some() {
            fail("already_settled");
        }
        if now < r.deadline {
            fail("round_not_over");
        }
        if r.commitment.is_some() && r.reveal.is_none() && now < r.deadline + self.config.reveal_window_secs * NS {
            fail("reveal_window_open");
        }

        let mut beacon_sig: Option<Vec<u8>> = None;
        let randomness: [u8; 32] = match self.config.randomness.mode {
            RandomnessMode::Drand => {
                if beacon_round != Some(r.target_drand_round) {
                    fail("wrong_beacon_round");
                }
                let sig = signature.as_deref().and_then(drand::from_hex).unwrap_or_else(|| fail("bad_beacon"));
                let pk = drand::from_hex(&self.config.randomness.public_key).unwrap();
                if !drand::verify_quicknet(r.target_drand_round, &sig, &pk) {
                    fail("bad_beacon");
                }
                let rnd = env::sha256_array(&sig);
                beacon_sig = Some(sig);
                rnd
            }
            RandomnessMode::NearSeed => near_seed_randomness(&env::random_seed(), &r.hits_chain, r.id),
        };

        let tactic = r.reveal.map(|(t, _)| t).unwrap_or(TACTIC_NONE);
        let (treasury_id, bear_id, loot_id) = (self.ids.treasury.clone(), self.ids.bear.clone(), self.ids.loot.clone());
        let mut penalty = 0;
        if r.commitment.is_some() && r.reveal.is_none() {
            penalty = no_reveal_penalty(&self.config, self.bal(&bear_id));
            self.mv(&bear_id, &treasury_id, penalty);
        }

        let mut weights: Vec<(AccountId, u128)> = Vec::with_capacity(r.participants as usize);
        let mut total_weight = 0u128;
        for i in 0..r.participants {
            let p = self.participants.get(&(round_id, i)).unwrap();
            let w = weight(p.early, p.late, tactic);
            total_weight += w;
            weights.push((p.account.clone(), w));
        }
        let eff_health = effective_health(r.health, tactic);
        let win = r.participants > 0 && total_weight > 0 && total_weight >= eff_health;

        let (mut reward, mut steal) = (0u128, 0u128);
        let mut drops: Vec<Drop> = Vec::new();
        if win {
            let from_treasury = treasury_reward(&self.config, self.bal(&treasury_id), r.base_health);
            let hoard = self.bal(&bear_id);
            self.mv(&bear_id, &loot_id, hoard);
            self.mv(&treasury_id, &loot_id, from_treasury);
            reward = hoard + from_treasury;
            for i in 0..self.config.drop_draws {
                let (target, roll) = read_draw(&draw_bytes(&randomness, round_id, i), total_weight);
                let mut cum = 0u128;
                let mut winner = weights.last().unwrap().0.clone();
                for (acc, w) in &weights {
                    cum += w;
                    if cum > target {
                        winner = acc.clone();
                        break;
                    }
                }
                let (token_id, qty) = drop_for_roll(roll, round_id, i);
                self.mint_item(&winner, &token_id, qty);
                drops.push(Drop { account: winner, token_id, qty, draw: i });
            }
            self.bear_won_last = false;
        } else {
            steal = steal_amount(&self.config, self.bal(&treasury_id), r.base_health, tactic);
            self.mv(&treasury_id, &bear_id, steal);
            self.bear_won_last = true;
        }
        let tip = self.config.settle_tip.0.min(self.bal(&treasury_id));
        if tip > 0 {
            self.ensure_registered(&actor);
            self.mv(&treasury_id, &actor, tip);
        }
        self.next_base = next_base_target(&self.config, r.base_health, win);
        self.recent_damage.push(r.total_early + r.total_late);
        while self.recent_damage.len() > self.config.effort_window as usize {
            self.recent_damage.remove(0);
        }

        let drops_json: Vec<Value> = drops
            .iter()
            .map(|d| json!({ "account": d.account, "tokenId": d.token_id, "qty": u(d.qty), "draw": d.draw }))
            .collect();
        emit(
            "slay",
            "settle",
            json!({
                "round": round_id,
                "outcome": if win { "win" } else { "loss" },
                "tactic": tactic,
                "revealed": r.reveal.is_some(),
                "totalWeight": u(total_weight),
                "effectiveHealth": u(eff_health),
                "reward": u(reward),
                "steal": u(steal),
                "penalty": u(penalty),
                "tip": u(tip),
                "settler": actor,
                "randomness": drand::to_hex(&randomness),
                "beaconRound": beacon_round,
                "drops": drops_json,
            }),
        );
        r.settlement = Some(Settlement {
            win,
            tactic,
            revealed: r.reveal.is_some(),
            effective_health: eff_health,
            total_weight,
            reward,
            steal,
            penalty,
            tip,
            randomness,
            beacon_round: if self.config.randomness.mode == RandomnessMode::Drand { beacon_round } else { None },
            beacon_signature: beacon_sig,
            drops,
            settled_at: now,
            settler: actor,
        });
        self.rounds.insert(round_id, r);
    }
}

// ---------- internals ----------

impl Contract {
    pub(crate) fn is_special(&self, a: &AccountId) -> bool {
        let i = &self.ids;
        [&i.treasury, &i.reserve, &i.bear, &i.smith, &i.loot, &i.market].contains(&a)
    }

    pub(crate) fn require_player(&self, a: &AccountId) {
        if self.is_special(a) {
            fail("special_account");
        }
    }

    pub(crate) fn bal(&self, a: &AccountId) -> u128 {
        self.token.accounts.get(a).unwrap_or(0)
    }

    fn ensure_registered(&mut self, a: &AccountId) {
        if self.token.storage_balance_of(a.clone()).is_none() {
            self.token.internal_register_account(a);
        }
    }

    pub(crate) fn mv(&mut self, from: &AccountId, to: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        if self.bal(from) < amount {
            fail("insufficient_balance");
        }
        self.token.internal_transfer(from, to, amount, None);
    }

    fn burn(&mut self, from: &AccountId, amount: u128, memo: &str) {
        if amount == 0 {
            return;
        }
        if self.bal(from) < amount {
            fail("insufficient_balance");
        }
        self.token.internal_withdraw(from, amount);
        self.burned += amount;
        FtBurn { owner_id: from, amount: U128(amount), memo: Some(memo) }.emit();
    }

    pub(crate) fn item_bal(&self, a: &AccountId, t: &str) -> u128 {
        self.items.get(&(a.clone(), t.to_string())).copied().unwrap_or(0)
    }

    fn set_item(&mut self, a: &AccountId, t: &str, q: u128) {
        let key = (a.clone(), t.to_string());
        if q == 0 {
            self.items.remove(&key);
        } else {
            self.items.insert(key, q);
        }
        if is_trophy(t) {
            let mut list = self.trophies_of.get(a).cloned().unwrap_or_default();
            let has = list.iter().any(|x| x == t);
            if q > 0 && !has {
                list.push(t.to_string());
            } else if q == 0 && has {
                list.retain(|x| x != t);
            }
            if list.is_empty() {
                self.trophies_of.remove(a);
            } else {
                self.trophies_of.insert(a.clone(), list);
            }
        }
    }

    pub(crate) fn mint_item(&mut self, a: &AccountId, t: &str, q: u128) {
        if q == 0 {
            return;
        }
        let b = self.item_bal(a, t);
        self.set_item(a, t, b + q);
        let s = self.item_supply.get(t).copied().unwrap_or(0);
        self.item_supply.insert(t.to_string(), s + q);
        emit("nep245", "mt_mint", json!({ "owner_id": a, "token_ids": [t], "amounts": [u(q)] }));
    }

    pub(crate) fn burn_item(&mut self, a: &AccountId, t: &str, q: u128) {
        if q == 0 {
            return;
        }
        let b = self.item_bal(a, t);
        if b < q {
            fail("insufficient_items");
        }
        self.set_item(a, t, b - q);
        let s = self.item_supply.get(t).copied().unwrap_or(0);
        self.item_supply.insert(t.to_string(), s - q);
        emit("nep245", "mt_burn", json!({ "owner_id": a, "token_ids": [t], "amounts": [u(q)] }));
    }

    pub(crate) fn move_item(&mut self, from: &AccountId, to: &AccountId, t: &str, q: u128) {
        if q == 0 {
            fail("bad_quantity");
        }
        let b = self.item_bal(from, t);
        if b < q {
            fail("insufficient_items");
        }
        self.set_item(from, t, b - q);
        let tb = self.item_bal(to, t);
        self.set_item(to, t, tb + q);
        emit(
            "nep245",
            "mt_transfer",
            json!({ "old_owner_id": from, "new_owner_id": to, "token_ids": [t], "amounts": [u(q)] }),
        );
    }

    pub(crate) fn player_supply(&self) -> u128 {
        let i = &self.ids;
        self.token.total_supply
            - self.bal(&i.treasury)
            - self.bal(&i.reserve)
            - self.bal(&i.bear)
            - self.bal(&i.smith)
            - self.bal(&i.loot)
    }

    pub(crate) fn peak_recent_damage(&self) -> u128 {
        self.recent_damage.iter().copied().max().unwrap_or(0)
    }

    pub(crate) fn current_round_id(&self) -> Option<u32> {
        let last = self.next_round_id.checked_sub(1)?;
        let r = self.rounds.get(&last)?;
        if r.settlement.is_none() {
            Some(last)
        } else {
            None
        }
    }

    fn internal_open(&mut self, actor: &AccountId, now: u64) -> u32 {
        if self.current_round_id().is_some() {
            fail("round_in_progress");
        }
        let id = self.next_round_id;
        let deadline = now + self.config.round_secs * NS;
        let supply = self.player_supply();
        let base = base_health(&self.config, supply, self.next_base);
        let hoard = self.bal(&self.ids.bear);
        let health = bear_health(&self.config, base, hoard, supply, self.peak_recent_damage());
        let commitment = match self.pending_commit {
            Some((rid, h)) if rid == id => Some(h),
            _ => None,
        };
        self.pending_commit = None;
        let target = drand_target_round(&self.config, deadline);
        self.rounds.insert(
            id,
            RoundMeta {
                id,
                opened_at: now,
                deadline,
                target_drand_round: target,
                base_health: base,
                hoard_at_open: hoard,
                health,
                commitment,
                reveal: None,
                participants: 0,
                total_early: 0,
                total_late: 0,
                hits: 0,
                hits_chain: [0u8; 32],
                settlement: None,
                loot_claimed: 0,
            },
        );
        self.next_round_id = id + 1;
        emit(
            "slay",
            "round_open",
            json!({
                "round": id,
                "opener": actor,
                "deadline": deadline.to_string(),
                "health": u(health),
                "baseHealth": u(base),
                "hoard": u(hoard),
                "targetDrandRound": target,
                "committed": commitment.is_some(),
            }),
        );
        id
    }
}

#[cfg(test)]
mod tests;
