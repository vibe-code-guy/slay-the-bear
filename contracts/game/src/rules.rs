//! The pure formulas of Slay the Bear, line for line the same as packages/rules/src/math.ts.
//! fixtures/vectors.json pins the two implementations together.

use crate::config::Config;
use near_sdk::env;

pub const BPS: u128 = 10_000;
pub const ONE: u128 = 1_000_000_000_000_000_000;
pub const NS: u64 = 1_000_000_000;

pub const TACTIC_NONE: u8 = 0;
pub const TACTIC_ARMOR: u8 = 1;
pub const TACTIC_RAGE: u8 = 2;
pub const TACTIC_FEINT: u8 = 3;

/// a * b / d with a 256-bit intermediate, rounding down.
pub fn mul_div(a: u128, b: u128, d: u128) -> u128 {
    assert!(d != 0, "mul_div: division by zero");
    let (hi, lo) = mul_wide(a, b);
    if hi == 0 {
        return lo / d;
    }
    assert!(hi < d, "mul_div: overflow");
    let (mut hi, mut lo) = (hi, lo);
    let mut q: u128 = 0;
    for _ in 0..128 {
        let carry = hi >> 127;
        hi = (hi << 1) | (lo >> 127);
        lo <<= 1;
        q <<= 1;
        if carry == 1 || hi >= d {
            hi = hi.wrapping_sub(d);
            q |= 1;
        }
    }
    q
}

fn mul_wide(a: u128, b: u128) -> (u128, u128) {
    let (a0, a1) = (a as u64 as u128, a >> 64);
    let (b0, b1) = (b as u64 as u128, b >> 64);
    let p00 = a0 * b0;
    let p01 = a0 * b1;
    let p10 = a1 * b0;
    let p11 = a1 * b1;
    let mid = (p00 >> 64) + (p01 as u64 as u128) + (p10 as u64 as u128);
    let lo = (p00 as u64 as u128) | (mid << 64);
    let hi = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64);
    (hi, lo)
}

pub fn bps(v: u128, b: u32) -> u128 {
    mul_div(v, b as u128, BPS)
}

pub fn early_bonus_bps(opened_at: u64, deadline: u64, now: u64, max_bps: u32) -> u128 {
    if now >= deadline {
        return BPS;
    }
    let len = (deadline - opened_at) as u128;
    if len == 0 {
        return BPS;
    }
    let t = now.max(opened_at);
    let remaining = (deadline - t) as u128;
    BPS + (max_bps as u128 - BPS) * remaining / len
}

pub fn is_late_hit(opened_at: u64, deadline: u64, now: u64, late_window_bps: u32) -> bool {
    let len = (deadline - opened_at) as u128;
    (now as u128) >= deadline as u128 - len * late_window_bps as u128 / BPS
}

pub fn hit_damage(amount: u128, weapon_mult_bps: u128, bonus_bps: u128) -> u128 {
    mul_div(amount, weapon_mult_bps * bonus_bps, BPS * BPS)
}

pub fn base_health(c: &Config, player_supply: u128, target: u128) -> u128 {
    c.min_health.0.max(bps(player_supply, c.health_bps).min(target))
}

pub fn next_base_target(c: &Config, base: u128, town_won: bool) -> u128 {
    let b = if town_won { c.win_growth_bps } else { c.loss_shrink_bps };
    c.min_health.0.max(bps(base, b))
}

pub fn bear_health(c: &Config, base: u128, hoard: u128, player_supply: u128, peak_recent_damage: u128) -> u128 {
    let raw = base + bps(hoard, c.hoard_health_bps);
    let cap = bps(player_supply, c.health_bps).min(bps(peak_recent_damage, c.effort_cap_bps));
    c.min_health.0.max(raw.min(cap))
}

pub fn effective_health(health: u128, tactic: u8) -> u128 {
    if tactic == TACTIC_ARMOR {
        mul_div(health, 12_000, BPS)
    } else {
        health
    }
}

pub fn weight(early: u128, late: u128, tactic: u8) -> u128 {
    early + if tactic == TACTIC_FEINT { late / 2 } else { late }
}

pub fn treasury_reward(c: &Config, treasury: u128, base: u128) -> u128 {
    bps(treasury, c.win_cap_bps).min(bps(base, c.reward_mult_bps))
}

pub fn steal_amount(c: &Config, treasury: u128, base: u128, tactic: u8) -> u128 {
    let mut s = bps(treasury, c.steal_cap_bps).min(bps(base, c.steal_mult_bps));
    if tactic == TACTIC_RAGE {
        s = mul_div(s, 15_000, BPS);
    }
    s.min(treasury)
}

pub fn loot_share(raider_weight: u128, total_weight: u128, pool: u128) -> u128 {
    if total_weight == 0 {
        return 0;
    }
    mul_div(raider_weight, pool, total_weight)
}

pub fn market_fee(c: &Config, cost: u128) -> u128 {
    bps(cost, c.market_fee_bps)
}

pub fn club_price(c: &Config, stock: u128, bear_won_last: bool) -> u128 {
    let t = c.smith.club_target_stock.0;
    let mut p = mul_div(c.smith.club_price.0, 2 * t, stock + t);
    if bear_won_last {
        p = mul_div(p, BPS + c.smith.fear_bps as u128, BPS);
    }
    p.max(1)
}

pub fn material_price(c: &Config, token_id: &str, stock: u128) -> u128 {
    let base = if token_id == "wood" { c.smith.wood_price.0 } else { c.smith.iron_price.0 };
    let t = c.smith.material_target_stock.0;
    mul_div(base, t, stock + t).max(1)
}

/// Club bundles the smith forges at a round open: none while its stock is at least half the
/// target, otherwise as many as its wood and $SLAY allow, up to the target.
pub fn smith_forge_bundles(c: &Config, stock: u128, wood: u128, balance: u128) -> u128 {
    let t = c.smith.club_target_stock.0;
    if stock * 2 >= t {
        return 0;
    }
    let rec = crate::items::recipe("club").unwrap();
    let needed = (t - stock).div_ceil(rec.charges);
    (wood / rec.wood).min(balance / rec.fee).min(needed)
}

/// What the Bear remembers of the last settled round.
pub struct MoodInput {
    pub total_early: u128,
    pub total_late: u128,
    pub town_won: bool,
    pub total_weight: u128,
    pub effective_health: u128,
}

/// The Bear's favourite tactic for a round, fixed at the open from the last settled round.
pub fn bear_mood(last: Option<&MoodInput>) -> u8 {
    let Some(l) = last else { return TACTIC_ARMOR };
    let raw = l.total_early + l.total_late;
    if raw > 0 && mul_div(l.total_late, 1000, raw) >= 350 {
        return TACTIC_FEINT;
    }
    if !l.town_won {
        return TACTIC_RAGE;
    }
    if l.effective_health == 0 || mul_div(l.total_weight, 1000, l.effective_health) < 1250 {
        return TACTIC_ARMOR;
    }
    TACTIC_RAGE
}

/// Chance of each tactic [None, Armor, Rage, Feint] in bps; they always sum to 10000.
pub fn mood_weights(mood: u8, mood_bps: u32) -> [u32; 4] {
    let other = (10_000 - mood_bps) / 3;
    let mut w = [other; 4];
    w[mood as usize] = 10_000 - 3 * other;
    w
}

/// Draw index reserved for the tactic, so it never overlaps the item drops.
pub const TACTIC_DRAW: u32 = u32::MAX;

/// (tactic, roll in [0, 10000)) drawn from the round randomness against the mood weights.
pub fn draw_tactic(randomness: &[u8; 32], round_id: u32, mood: u8, mood_bps: u32) -> (u8, u32) {
    let d = draw_bytes(randomness, round_id, TACTIC_DRAW);
    let mut b = [0u8; 8];
    b.copy_from_slice(&d[0..8]);
    let roll = (u64::from_be_bytes(b) % 10_000) as u32;
    let w = mood_weights(mood, mood_bps);
    let mut cum = 0u32;
    for (t, wt) in w.iter().enumerate() {
        cum += wt;
        if roll < cum {
            return (t as u8, roll);
        }
    }
    (TACTIC_FEINT, roll)
}

pub fn next_hits_chain(prev: &[u8; 32], account: &str, amount: u128, damage: u128, now: u64, weapon: Option<&str>) -> [u8; 32] {
    let mut m = Vec::with_capacity(32 + account.len() + 1 + 16 + 16 + 8 + 8);
    m.extend_from_slice(prev);
    m.extend_from_slice(account.as_bytes());
    m.push(0);
    m.extend_from_slice(&amount.to_be_bytes());
    m.extend_from_slice(&damage.to_be_bytes());
    m.extend_from_slice(&now.to_be_bytes());
    m.extend_from_slice(weapon.unwrap_or("").as_bytes());
    env::sha256_array(&m)
}

pub fn near_seed_randomness(seed: &[u8], hits_chain: &[u8; 32], round_id: u32) -> [u8; 32] {
    let mut m = Vec::with_capacity(seed.len() + 40);
    m.extend_from_slice(seed);
    m.extend_from_slice(hits_chain);
    m.extend_from_slice(&(round_id as u64).to_be_bytes());
    env::sha256_array(&m)
}

pub fn draw_bytes(randomness: &[u8; 32], round_id: u32, index: u32) -> [u8; 32] {
    let mut m = Vec::with_capacity(44);
    m.extend_from_slice(randomness);
    m.extend_from_slice(&(round_id as u64).to_be_bytes());
    m.extend_from_slice(&index.to_be_bytes());
    env::sha256_array(&m)
}

/// (weighted target in [0, total_weight), item roll in [0, 100))
pub fn read_draw(draw: &[u8; 32], total_weight: u128) -> (u128, u32) {
    let mut a = [0u8; 16];
    a.copy_from_slice(&draw[0..16]);
    let mut b = [0u8; 8];
    b.copy_from_slice(&draw[16..24]);
    (u128::from_be_bytes(a) % total_weight, (u64::from_be_bytes(b) % 100) as u32)
}

pub fn drand_target_round(c: &Config, deadline_ns: u64) -> u64 {
    let g = c.randomness.genesis_time;
    let p = c.randomness.period;
    let deadline_sec = deadline_ns.div_ceil(NS);
    let first = if deadline_sec <= g { 1 } else { (deadline_sec - g).div_ceil(p) + 1 };
    first + c.randomness.margin_rounds
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mul_div_handles_wide_products() {
        assert_eq!(mul_div(7, 3, 2), 10);
        let big = u128::MAX / 3;
        assert_eq!(mul_div(big, 6, 3), big * 2);
        assert_eq!(mul_div(10u128.pow(30), 10u128.pow(30), 10u128.pow(31)), 10u128.pow(29));
        assert_eq!(mul_div(u128::MAX, u128::MAX, u128::MAX), u128::MAX);
    }
}
