//! Item tables, identical to packages/rules/src/items.ts. Weapons are counted in charges.

use crate::rules::ONE;

pub fn weapon_mult_bps(token_id: &str) -> Option<u128> {
    match token_id {
        "club" => Some(12_500),
        "sword" => Some(15_000),
        "slayer" => Some(20_000),
        _ => None,
    }
}

pub struct Recipe {
    pub wood: u128,
    pub iron: u128,
    pub trophy: u128,
    pub fee: u128,
    pub charges: u128,
}

pub fn recipe(id: &str) -> Option<Recipe> {
    match id {
        "club" => Some(Recipe { wood: 2, iron: 0, trophy: 0, fee: 10 * ONE, charges: 10 }),
        "sword" => Some(Recipe { wood: 2, iron: 3, trophy: 0, fee: 50 * ONE, charges: 10 }),
        "slayer" => Some(Recipe { wood: 0, iron: 5, trophy: 1, fee: 200 * ONE, charges: 10 }),
        _ => None,
    }
}

pub fn drop_for_roll(roll: u32, round_id: u32, draw_index: u32) -> (String, u128) {
    if roll < 60 {
        ("wood".to_string(), 3)
    } else if roll < 95 {
        ("iron".to_string(), 2)
    } else {
        (trophy_id(round_id, draw_index), 1)
    }
}

pub fn trophy_id(round_id: u32, draw_index: u32) -> String {
    format!("trophy-{round_id}-{draw_index}")
}

pub fn is_trophy(token_id: &str) -> bool {
    let Some(rest) = token_id.strip_prefix("trophy-") else { return false };
    let mut parts = rest.split('-');
    let ok = |p: Option<&str>| p.is_some_and(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()));
    ok(parts.next()) && ok(parts.next()) && parts.next().is_none()
}

pub fn is_material(token_id: &str) -> bool {
    token_id == "wood" || token_id == "iron"
}

/// Token ids that exist from the start; trophies are added as they drop.
pub const BASE_ITEMS: [&str; 5] = ["wood", "iron", "club", "sword", "slayer"];
