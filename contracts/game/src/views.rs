//! Read-only views. Everything the UI and the verifier need is readable here, with no indexer.

use crate::*;
use near_sdk::json_types::U64;

#[near(serializers = [json])]
pub struct DropView {
    pub account: AccountId,
    pub token_id: String,
    pub qty: U128,
    pub draw: u32,
}

#[near(serializers = [json])]
pub struct SettlementView {
    pub outcome: String,
    pub tactic: u8,
    pub revealed: bool,
    pub effective_health: U128,
    pub total_weight: U128,
    pub reward: U128,
    pub steal: U128,
    pub penalty: U128,
    pub tip: U128,
    pub randomness: String,
    pub beacon_round: Option<U64>,
    pub beacon_signature: Option<String>,
    pub drops: Vec<DropView>,
    pub settled_at: U64,
    pub settler: AccountId,
}

#[near(serializers = [json])]
pub struct RoundView {
    pub id: u32,
    pub opened_at: U64,
    pub deadline: U64,
    pub target_drand_round: U64,
    pub base_health: U128,
    pub hoard_at_open: U128,
    pub health: U128,
    pub commitment: Option<String>,
    pub revealed_tactic: Option<u8>,
    pub reveal_salt: Option<String>,
    pub participants: u32,
    pub total_early: U128,
    pub total_late: U128,
    pub hits: u32,
    pub hits_chain: String,
    pub loot_claimed: U128,
    pub settlement: Option<SettlementView>,
}

#[near(serializers = [json])]
pub struct ParticipantView {
    pub index: u32,
    pub account: AccountId,
    pub early: U128,
    pub late: U128,
    pub hits: u32,
    pub claimed: bool,
}

#[near(serializers = [json])]
pub struct StatusView {
    pub now: U64,
    pub next_round_id: u32,
    pub current_round: Option<u32>,
    pub total_supply: U128,
    pub burned: U128,
    pub player_supply: U128,
    pub treasury: U128,
    pub reserve: U128,
    pub hoard: U128,
    pub smith_balance: U128,
    pub loot: U128,
    pub bear_won_last: bool,
    pub next_base: U128,
    pub peak_recent_damage: U128,
    pub recent_damage: Vec<U128>,
    pub pending_commit_round: Option<u32>,
    pub club_price: U128,
    pub wood_price: U128,
    pub iron_price: U128,
    pub smith_clubs: U128,
    pub smith_wood: U128,
    pub smith_iron: U128,
    pub pouches_today: u32,
    pub listings: u32,
}

#[near(serializers = [json])]
pub struct PlayerView {
    pub account: AccountId,
    pub registered: bool,
    pub balance: U128,
    pub pouch_claimed: bool,
    pub items: Vec<(String, U128)>,
    pub trophies: Vec<String>,
}

impl Contract {
    fn round_view(&self, r: &RoundMeta) -> RoundView {
        RoundView {
            id: r.id,
            opened_at: U64(r.opened_at),
            deadline: U64(r.deadline),
            target_drand_round: U64(r.target_drand_round),
            base_health: U128(r.base_health),
            hoard_at_open: U128(r.hoard_at_open),
            health: U128(r.health),
            commitment: r.commitment.map(|c| drand::to_hex(&c)),
            revealed_tactic: r.reveal.map(|(t, _)| t),
            reveal_salt: r.reveal.map(|(_, s)| drand::to_hex(&s)),
            participants: r.participants,
            total_early: U128(r.total_early),
            total_late: U128(r.total_late),
            hits: r.hits,
            hits_chain: drand::to_hex(&r.hits_chain),
            loot_claimed: U128(r.loot_claimed),
            settlement: r.settlement.as_ref().map(|s| SettlementView {
                outcome: if s.win { "win".into() } else { "loss".into() },
                tactic: s.tactic,
                revealed: s.revealed,
                effective_health: U128(s.effective_health),
                total_weight: U128(s.total_weight),
                reward: U128(s.reward),
                steal: U128(s.steal),
                penalty: U128(s.penalty),
                tip: U128(s.tip),
                randomness: drand::to_hex(&s.randomness),
                beacon_round: s.beacon_round.map(U64),
                beacon_signature: s.beacon_signature.as_ref().map(|b| drand::to_hex(b)),
                drops: s
                    .drops
                    .iter()
                    .map(|d| DropView { account: d.account.clone(), token_id: d.token_id.clone(), qty: U128(d.qty), draw: d.draw })
                    .collect(),
                settled_at: U64(s.settled_at),
                settler: s.settler.clone(),
            }),
        }
    }
}

#[near]
impl Contract {
    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_ids(&self) -> Ids {
        self.ids.clone()
    }

    pub fn get_status(&self) -> StatusView {
        let i = &self.ids;
        let smith = i.smith.clone();
        StatusView {
            now: U64(env::block_timestamp()),
            next_round_id: self.next_round_id,
            current_round: self.current_round_id(),
            total_supply: U128(self.token.total_supply),
            burned: U128(self.burned),
            player_supply: U128(self.player_supply()),
            treasury: U128(self.bal(&i.treasury)),
            reserve: U128(self.bal(&i.reserve)),
            hoard: U128(self.bal(&i.bear)),
            smith_balance: U128(self.bal(&i.smith)),
            loot: U128(self.bal(&i.loot)),
            bear_won_last: self.bear_won_last,
            next_base: U128(self.next_base),
            peak_recent_damage: U128(self.peak_recent_damage()),
            recent_damage: self.recent_damage.iter().map(|d| U128(*d)).collect(),
            pending_commit_round: self.pending_commit.map(|(r, _)| r),
            club_price: U128(club_price(&self.config, self.item_bal(&smith, "club"), self.bear_won_last)),
            wood_price: U128(material_price(&self.config, "wood", self.item_bal(&smith, "wood"))),
            iron_price: U128(material_price(&self.config, "iron", self.item_bal(&smith, "iron"))),
            smith_clubs: U128(self.item_bal(&smith, "club")),
            smith_wood: U128(self.item_bal(&smith, "wood")),
            smith_iron: U128(self.item_bal(&smith, "iron")),
            pouches_today: self.pouches_today,
            listings: self.listings.len(),
        }
    }

    pub fn get_round(&self, round_id: u32) -> Option<RoundView> {
        self.rounds.get(&round_id).map(|r| self.round_view(r))
    }

    /// Rounds from newest to oldest, starting at `before_id` (exclusive) or the latest.
    pub fn get_rounds(&self, before_id: Option<u32>, limit: Option<u32>) -> Vec<RoundView> {
        let start = before_id.unwrap_or(self.next_round_id).min(self.next_round_id);
        let limit = limit.unwrap_or(10).min(50);
        (1..start).rev().take(limit as usize).filter_map(|id| self.rounds.get(&id).map(|r| self.round_view(r))).collect()
    }

    pub fn get_round_participants(&self, round_id: u32, from_index: Option<u32>, limit: Option<u32>) -> Vec<ParticipantView> {
        let Some(r) = self.rounds.get(&round_id) else { return vec![] };
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(100).min(300);
        (from..r.participants.min(from.saturating_add(limit)))
            .filter_map(|i| {
                self.participants.get(&(round_id, i)).map(|p| ParticipantView {
                    index: i,
                    account: p.account.clone(),
                    early: U128(p.early),
                    late: U128(p.late),
                    hits: p.hits,
                    claimed: p.claimed,
                })
            })
            .collect()
    }

    pub fn get_participant(&self, round_id: u32, account_id: AccountId) -> Option<ParticipantView> {
        let i = *self.participant_index.get(&(round_id, account_id))?;
        let p = self.participants.get(&(round_id, i))?;
        Some(ParticipantView {
            index: i,
            account: p.account.clone(),
            early: U128(p.early),
            late: U128(p.late),
            hits: p.hits,
            claimed: p.claimed,
        })
    }

    pub fn get_player(&self, account_id: AccountId) -> PlayerView {
        let items = items::BASE_ITEMS
            .iter()
            .map(|t| (t.to_string(), U128(self.item_bal(&account_id, t))))
            .filter(|(_, q)| q.0 > 0)
            .collect();
        PlayerView {
            registered: self.token.storage_balance_of(account_id.clone()).is_some(),
            balance: U128(self.bal(&account_id)),
            pouch_claimed: self.pouch_claimed.contains(&account_id),
            items,
            trophies: self.trophies_of.get(&account_id).cloned().unwrap_or_default(),
            account: account_id,
        }
    }

    pub fn get_listings(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Listing> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.listings.values().skip(from).take(limit).cloned().collect()
    }
}
