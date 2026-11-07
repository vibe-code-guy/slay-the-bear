//! The game config, fixed at `new()`. Field names mirror packages/rules/src/config.ts in snake_case.

use near_sdk::json_types::U128;
use near_sdk::near;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum RandomnessMode {
    Drand,
    NearSeed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct RandomnessConfig {
    pub mode: RandomnessMode,
    /// drand group public key, G2 compressed, hex (96 bytes).
    pub public_key: String,
    pub genesis_time: u64,
    pub period: u64,
    pub margin_rounds: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct SmithConfig {
    pub club_price: U128,
    pub club_target_stock: U128,
    pub wood_price: U128,
    pub iron_price: U128,
    pub material_target_stock: U128,
    pub fear_bps: u32,
    pub burn_share_bps: u32,
    pub initial_clubs: U128,
    pub initial_float: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Config {
    pub round_secs: u64,
    pub reveal_window_secs: u64,
    pub total_supply: U128,
    pub treasury_init: U128,
    pub reserve_init: U128,
    pub min_health: U128,
    pub health_bps: u32,
    pub win_growth_bps: u32,
    pub loss_shrink_bps: u32,
    pub hoard_health_bps: u32,
    pub effort_window: u32,
    pub effort_cap_bps: u32,
    pub reward_mult_bps: u32,
    pub win_cap_bps: u32,
    pub steal_mult_bps: u32,
    pub steal_cap_bps: u32,
    pub early_bonus_max_bps: u32,
    pub late_window_bps: u32,
    pub min_hit: U128,
    pub max_hit: U128,
    pub max_participants: u32,
    pub max_hits_per_account: u32,
    pub settle_tip: U128,
    pub pouch_amount: U128,
    pub pouches_per_day: u32,
    pub drop_draws: u32,
    pub no_reveal_penalty_bps: u32,
    pub market_fee_bps: u32,
    pub smith: SmithConfig,
    pub randomness: RandomnessConfig,
}

impl Config {
    pub fn validate(&self) {
        let ok = |c: bool, m: &str| {
            if !c {
                near_sdk::env::panic_str(&format!("bad_config: {m}"))
            }
        };
        ok(self.treasury_init.0 + self.reserve_init.0 == self.total_supply.0, "treasury + reserve must equal supply");
        ok(self.smith.initial_float.0 <= self.treasury_init.0, "smith float larger than treasury");
        ok(self.round_secs > 0 && self.randomness.period > 0, "zero durations");
        ok(self.min_hit.0 > 0 && self.min_hit.0 <= self.max_hit.0, "hit bounds");
        ok(self.early_bonus_max_bps >= 10_000 && self.early_bonus_max_bps <= 30_000, "early bonus");
        ok(self.late_window_bps <= 10_000 && self.health_bps <= 10_000, "bps out of range");
        ok(self.max_participants > 0 && self.max_participants <= 500, "max participants");
        ok(self.drop_draws <= 10 && self.effort_window <= 50, "too many draws or window");
        if self.randomness.mode == RandomnessMode::Drand {
            let pk = crate::drand::from_hex(&self.randomness.public_key);
            ok(pk.is_some_and(|k| k.len() == 96), "drand public key must be 96 bytes");
        }
    }
}
