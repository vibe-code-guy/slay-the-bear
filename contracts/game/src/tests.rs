//! Contract unit tests. `replays_typescript_vectors` runs the scripted game in
//! fixtures/vectors.json (produced by `npm run vectors` from the TypeScript engine) and checks
//! that the contract ends every step in exactly the state the engine predicts.

use super::*;
use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::metadata::FungibleTokenMetadataProvider;
use near_sdk::serde_json::{self, Value};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, Gas, NearToken};

const VECTORS: &str = include_str!("../../../fixtures/vectors.json");

fn ctx(actor: &str, now: u64, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .current_account_id("slay.testnet".parse().unwrap())
        .predecessor_account_id(actor.parse().unwrap())
        .signer_account_id(actor.parse().unwrap())
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(1_000))
        .prepaid_gas(Gas::from_tgas(300))
        .random_seed([7u8; 32])
        .build());
}

fn s(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or_else(|| panic!("missing {k} in {v}")).to_string()
}

fn u128s(v: &Value, k: &str) -> U128 {
    U128(s(v, k).parse().unwrap())
}

fn opt_str(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(|x| x.as_str()).map(|x| x.to_string())
}

fn new_contract(cfg: &Value, now: u64) -> Contract {
    ctx("deployer.testnet", now, 0);
    let config: Config = serde_json::from_value(cfg.clone()).unwrap();
    Contract::new(config)
}

fn apply(c: &mut Contract, step: &Value) {
    let actor = s(step, "actor");
    let now: u64 = s(step, "now").parse().unwrap();
    let a = &step["args"];
    ctx(&actor, now, 0);
    match s(step, "method").as_str() {
        "claim_pouch" => {
            c.claim_pouch();
        }
        "open_round" => {
            c.open_round();
        }
        "hit" => {
            c.hit(u128s(a, "amount"), opt_str(a, "weapon"));
        }
        "settle" => c.settle(
            a["round_id"].as_u64().unwrap() as u32,
            a.get("beacon_round").and_then(|x| x.as_u64()),
            opt_str(a, "signature"),
        ),
        "claim" => {
            c.claim(a["round_id"].as_u64().unwrap() as u32);
        }
        "craft" => c.craft(s(a, "recipe_id"), opt_str(a, "trophy_id")),
        "list" => {
            c.list(s(a, "token_id"), u128s(a, "qty"), u128s(a, "price"));
        }
        "buy" => c.buy(a["listing_id"].as_u64().unwrap(), u128s(a, "qty")),
        "cancel" => c.cancel(a["listing_id"].as_u64().unwrap()),
        "buy_from_smith" => {
            c.buy_from_smith(u128s(a, "qty"));
        }
        "sell_to_smith" => {
            c.sell_to_smith(s(a, "token_id"), u128s(a, "qty"));
        }
        m => panic!("unknown method {m}"),
    }
}

fn check(c: &Contract, step_no: usize, expect: &Value) {
    let st = c.get_status();
    let label = |k: &str| format!("step {step_no}: {k}");
    assert_eq!(st.total_supply.0.to_string(), s(expect, "total_supply"), "{}", label("total_supply"));
    assert_eq!(st.burned.0.to_string(), s(expect, "burned"), "{}", label("burned"));
    assert_eq!(st.next_base.0.to_string(), s(expect, "next_base"), "{}", label("next_base"));
    for (acc, bal) in expect["balances"].as_object().unwrap() {
        let id: AccountId = acc.parse().unwrap();
        assert_eq!(c.bal(&id).to_string(), bal.as_str().unwrap(), "{}", label(&format!("balance {acc}")));
    }
    for (key, qty) in expect["items"].as_object().unwrap() {
        let (acc, token) = key.split_once('|').unwrap();
        let id: AccountId = acc.parse().unwrap();
        assert_eq!(c.item_bal(&id, token).to_string(), qty.as_str().unwrap(), "{}", label(&format!("item {key}")));
    }
    if let Some(r) = expect.get("round") {
        let id = r["id"].as_u64().unwrap() as u32;
        let v = c.get_round(id).unwrap();
        assert_eq!(v.health.0.to_string(), s(r, "health"), "{}", label("round health"));
        assert_eq!(v.total_early.0.to_string(), s(r, "total_early"), "{}", label("total_early"));
        assert_eq!(v.total_late.0.to_string(), s(r, "total_late"), "{}", label("total_late"));
        assert_eq!(v.hits_chain, s(r, "hits_chain"), "{}", label("hits_chain"));
        assert_eq!(v.target_drand_round.0.to_string(), s(r, "target_drand_round"), "{}", label("target_drand_round"));
        assert_eq!(v.mood as u64, r["mood"].as_u64().unwrap(), "{}", label("mood"));
        assert_eq!(v.supply_at_open.0.to_string(), s(r, "supply_at_open"), "{}", label("supply_at_open"));
        if let Some(se) = r.get("settlement").filter(|x| !x.is_null()) {
            let got = v.settlement.expect("settled");
            assert_eq!(got.outcome, s(se, "outcome"), "{}", label("outcome"));
            assert_eq!(got.tactic as u64, se["tactic"].as_u64().unwrap(), "{}", label("tactic"));
            assert_eq!(got.tactic_roll as u64, se["tactic_roll"].as_u64().unwrap(), "{}", label("tactic_roll"));
            assert_eq!(got.reward.0.to_string(), s(se, "reward"), "{}", label("reward"));
            assert_eq!(got.steal.0.to_string(), s(se, "steal"), "{}", label("steal"));
            assert_eq!(got.total_weight.0.to_string(), s(se, "total_weight"), "{}", label("total_weight"));
            assert_eq!(got.randomness, s(se, "randomness"), "{}", label("randomness"));
            let drops: Vec<String> = got.drops.iter().map(|d| format!("{}:{}:{}", d.account, d.token_id, d.qty.0)).collect();
            let want: Vec<String> = se["drops"].as_array().unwrap().iter().map(|d| d.as_str().unwrap().to_string()).collect();
            assert_eq!(drops, want, "{}", label("drops"));
        }
    }
}

fn replay(v: &Value) -> Contract {
    let start: u64 = s(v, "start").parse().unwrap();
    let mut c = new_contract(&v["config"], start);
    check(&c, 0, &v["initial"]);
    for (i, step) in v["steps"].as_array().unwrap().iter().enumerate() {
        apply(&mut c, step);
        check(&c, i + 1, &step["expect"]);
    }
    c
}

#[test]
fn replays_typescript_vectors() {
    let v: Value = serde_json::from_str(VECTORS).unwrap();
    replay(&v);
}

/// The web app's simulation renders the TypeScript engine's views; they must be the
/// contract's views exactly.
#[test]
fn views_match_typescript() {
    let v: Value = serde_json::from_str(VECTORS).unwrap();
    let c = replay(&v);
    let want = &v["views"];
    let j = |x: Value| x;
    let mut st = serde_json::to_value(c.get_status()).unwrap();
    st["now"] = want["status"]["now"].clone();
    assert_eq!(j(st), want["status"], "status");
    assert_eq!(serde_json::to_value(c.get_rounds(None, Some(50))).unwrap(), want["rounds"], "rounds");
    for (id, parts) in want["participants"].as_object().unwrap() {
        let got = serde_json::to_value(c.get_round_participants(id.parse().unwrap(), None, None)).unwrap();
        assert_eq!(&got, parts, "participants of round {id}");
    }
    for (acc, p) in want["players"].as_object().unwrap() {
        let got = serde_json::to_value(c.get_player(acc.parse().unwrap())).unwrap();
        assert_eq!(&got, p, "player {acc}");
    }
    assert_eq!(serde_json::to_value(c.get_listings(None, None)).unwrap(), want["listings"], "listings");
    assert_eq!(serde_json::to_value(c.get_feed(Some(40))).unwrap(), want["feed"], "feed");
}

fn vec_contract() -> (Contract, u64, Value) {
    let v: Value = serde_json::from_str(VECTORS).unwrap();
    let start: u64 = s(&v, "start").parse().unwrap();
    let c = new_contract(&v["config"], start);
    (c, start, v)
}

#[test]
#[should_panic(expected = "special_account")]
fn npc_accounts_cannot_play() {
    let (mut c, now, _) = vec_contract();
    ctx("bear.slay.testnet", now, 0);
    c.claim_pouch();
}

#[test]
fn npc_formulas_match_typescript() {
    let v: Value = serde_json::from_str(VECTORS).unwrap();
    let (c, _, _) = vec_contract();
    let cfg = c.get_config();
    let f = &v["formulas"];
    for d in f["tacticDraws"].as_array().unwrap() {
        let rnd = drand::from_hex(&s(d, "randomness")).unwrap();
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&rnd);
        let got = draw_tactic(&arr, d["round_id"].as_u64().unwrap() as u32, d["mood"].as_u64().unwrap() as u8, cfg.mood_bps);
        assert_eq!((got.0 as u64, got.1 as u64), (d["tactic"].as_u64().unwrap(), d["roll"].as_u64().unwrap()), "draw {d}");
    }
    for m in f["moods"].as_array().unwrap() {
        let last = m.get("last").filter(|x| !x.is_null()).map(|l| MoodInput {
            total_early: s(l, "total_early").parse().unwrap(),
            total_late: s(l, "total_late").parse().unwrap(),
            town_won: l["town_won"].as_bool().unwrap(),
            total_weight: s(l, "total_weight").parse().unwrap(),
            effective_health: s(l, "effective_health").parse().unwrap(),
        });
        assert_eq!(bear_mood(last.as_ref()) as u64, m["mood"].as_u64().unwrap(), "mood {m}");
    }
    for x in f["forge"].as_array().unwrap() {
        let got = smith_forge_bundles(
            &cfg,
            s(x, "stock").parse().unwrap(),
            s(x, "wood").parse().unwrap(),
            s(x, "balance").parse().unwrap(),
        );
        assert_eq!(got.to_string(), s(x, "bundles"), "forge {x}");
    }
}

#[test]
fn feed_keeps_the_newest_events() {
    let (mut c, now, _) = vec_contract();
    ctx("alice.testnet", now, 0);
    c.claim_pouch();
    c.hit(U128(10 * ONE), None);
    let f = c.get_feed(None);
    let kinds: Vec<&str> = f.iter().map(|x| x.kind.as_str()).collect();
    assert_eq!(kinds, vec!["hit", "open", "pouch"]);
    assert_eq!(f[0].amount.0, 10 * ONE);
    assert_eq!(f[0].round, Some(1));
    for i in 0..(FEED_SIZE + 5) {
        ctx("alice.testnet", now + (i + 1) * NS, 0);
        c.hit(U128(ONE), None);
    }
    let f = c.get_feed(Some(100));
    assert_eq!(f.len() as u64, FEED_SIZE);
    assert!(f.windows(2).all(|w| w[0].seq == w[1].seq + 1));
    assert_eq!(f[0].seq, FEED_SIZE + 7);
}

#[test]
fn mood_weights_sum_to_one() {
    for bps in [2_500u32, 5_500, 7_001, 10_000] {
        for mood in 0..4u8 {
            let w = mood_weights(mood, bps);
            assert_eq!(w.iter().sum::<u32>(), 10_000);
            assert!(w[mood as usize] >= bps);
        }
    }
}

#[test]
#[should_panic(expected = "round_not_over")]
fn cannot_settle_early() {
    let (mut c, now, _) = vec_contract();
    ctx("alice.testnet", now, 0);
    c.claim_pouch();
    c.hit(U128(10 * ONE), None);
    c.settle(1, None, None);
}

#[test]
#[should_panic(expected = "round_ended")]
fn cannot_hit_after_deadline() {
    let (mut c, now, v) = vec_contract();
    ctx("alice.testnet", now, 0);
    c.claim_pouch();
    c.hit(U128(10 * ONE), None);
    let round_secs = v["config"]["round_secs"].as_u64().unwrap();
    ctx("alice.testnet", now + round_secs * NS, 0);
    c.hit(U128(10 * ONE), None);
}

#[test]
#[should_panic(expected = "bad_beacon")]
fn rejects_a_forged_beacon() {
    let (mut c, now, v) = vec_contract();
    ctx("alice.testnet", now, 0);
    c.claim_pouch();
    c.hit(U128(10 * ONE), None);
    let r = c.get_round(1).unwrap();
    let round_secs = v["config"]["round_secs"].as_u64().unwrap();
    ctx("alice.testnet", now + round_secs * NS, 0);
    // a real quicknet signature, but for another round and key
    let sig = "b55e7cb2d5c613ee0b2e28d6750aabbb78c39dcc96bd9d38c2c2e12198df95571de8e8e402a0cc48871c7089a2b3af4b";
    c.settle(1, Some(r.target_drand_round.0), Some(sig.to_string()));
}

#[test]
#[should_panic(expected = "wrong_beacon_round")]
fn rejects_another_drand_round() {
    let (mut c, now, v) = vec_contract();
    ctx("alice.testnet", now, 0);
    c.claim_pouch();
    c.hit(U128(10 * ONE), None);
    let r = c.get_round(1).unwrap();
    let round_secs = v["config"]["round_secs"].as_u64().unwrap();
    ctx("alice.testnet", now + round_secs * NS, 0);
    c.settle(1, Some(r.target_drand_round.0 + 1), Some("00".repeat(48)));
}

#[test]
#[should_panic(expected = "special_account")]
fn npc_balances_cannot_be_transferred() {
    let (mut c, now, _) = vec_contract();
    ctx("smith.slay.testnet", now, 1);
    c.ft_transfer("alice.testnet".parse().unwrap(), U128(1), None);
}

#[test]
fn metadata_and_supply() {
    let (c, _, v) = vec_contract();
    let m = c.ft_metadata();
    assert_eq!(m.symbol, "SLAY");
    assert_eq!(m.decimals, 18);
    assert_eq!(c.ft_total_supply().0.to_string(), s(&v["config"], "total_supply"));
}
