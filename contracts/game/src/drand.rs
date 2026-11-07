//! drand quicknet verification on NEAR.
//!
//! quicknet (`bls-unchained-g1-rfc9380`) signs sha256(round as 8 big-endian bytes) with BLS on
//! BLS12-381: signatures in G1 (48 bytes compressed), the group key in G2 (96 bytes compressed).
//! A signature is valid when e(sig, g2) == e(H(m), pk), where H is RFC 9380 hash_to_curve for G1
//! with SHA-256 and the DST below. We check e(-sig, g2) * e(H(m), pk) == 1 with NEAR's
//! BLS12-381 host functions (NEP-488). hash_to_field runs here; mapping, addition, decompression
//! and the pairing run in the host.

use near_sdk::env;

pub const QUICKNET_DST: &[u8] = b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

/// The G2 generator, compressed (ZCash / zkcrypto encoding).
pub const G2_GENERATOR_COMPRESSED: [u8; 96] = [
    0x93, 0xe0, 0x2b, 0x60, 0x52, 0x71, 0x9f, 0x60, 0x7d, 0xac, 0xd3, 0xa0, 0x88, 0x27, 0x4f, 0x65, 0x59, 0x6b, 0xd0, 0xd0,
    0x99, 0x20, 0xb6, 0x1a, 0xb5, 0xda, 0x61, 0xbb, 0xdc, 0x7f, 0x50, 0x49, 0x33, 0x4c, 0xf1, 0x12, 0x13, 0x94, 0x5d, 0x57,
    0xe5, 0xac, 0x7d, 0x05, 0x5d, 0x04, 0x2b, 0x7e, 0x02, 0x4a, 0xa2, 0xb2, 0xf0, 0x8f, 0x0a, 0x91, 0x26, 0x08, 0x05, 0x27,
    0x2d, 0xc5, 0x10, 0x51, 0xc6, 0xe4, 0x7a, 0xd4, 0xfa, 0x40, 0x3b, 0x02, 0xb4, 0x51, 0x0b, 0x64, 0x7a, 0xe3, 0xd1, 0x77,
    0x0b, 0xac, 0x03, 0x26, 0xa8, 0x05, 0xbb, 0xef, 0xd4, 0x80, 0x56, 0xc8, 0xc1, 0x21, 0xbd, 0xb8,
];

/// BLS12-381 base field modulus p as little-endian u64 limbs.
const P: [u64; 6] = [
    0xb9fe_ffff_ffff_aaab,
    0x1eab_fffe_b153_ffff,
    0x6730_d2a0_f6b0_f624,
    0x6477_4b84_f385_12bf,
    0x4b1b_a7b6_434b_acd7,
    0x1a01_11ea_397f_e69a,
];

/// RFC 9380 expand_message_xmd with SHA-256.
pub fn expand_message_xmd(msg: &[u8], dst: &[u8], len_in_bytes: usize) -> Vec<u8> {
    let ell = len_in_bytes.div_ceil(32);
    assert!(ell <= 255 && dst.len() <= 255, "expand_message_xmd: bad lengths");
    let mut dst_prime = dst.to_vec();
    dst_prime.push(dst.len() as u8);

    let mut m0 = Vec::with_capacity(64 + msg.len() + 3 + dst_prime.len());
    m0.extend_from_slice(&[0u8; 64]);
    m0.extend_from_slice(msg);
    m0.extend_from_slice(&[(len_in_bytes >> 8) as u8, len_in_bytes as u8, 0u8]);
    m0.extend_from_slice(&dst_prime);
    let b0 = env::sha256(&m0);

    let mut out = Vec::with_capacity(ell * 32);
    let mut prev = {
        let mut m = Vec::with_capacity(33 + dst_prime.len());
        m.extend_from_slice(&b0);
        m.push(1);
        m.extend_from_slice(&dst_prime);
        env::sha256(&m)
    };
    out.extend_from_slice(&prev);
    for i in 2..=ell {
        let mut m = Vec::with_capacity(33 + dst_prime.len());
        m.extend(b0.iter().zip(prev.iter()).map(|(a, b)| a ^ b));
        m.push(i as u8);
        m.extend_from_slice(&dst_prime);
        prev = env::sha256(&m);
        out.extend_from_slice(&prev);
    }
    out.truncate(len_in_bytes);
    out
}

/// Reduces a big-endian integer modulo p and returns it as 48 big-endian bytes.
pub fn reduce_mod_p(be: &[u8]) -> [u8; 48] {
    // r < p < 2^381 always holds between steps; 7 limbs leave room for the shift.
    let mut r = [0u64; 7];
    for byte in be {
        for bit in (0..8).rev() {
            let mut carry = (byte >> bit) as u64 & 1;
            for limb in r.iter_mut() {
                let next = *limb >> 63;
                *limb = (*limb << 1) | carry;
                carry = next;
            }
            if ge_p(&r) {
                sub_p(&mut r);
            }
        }
    }
    let mut out = [0u8; 48];
    for (i, limb) in r.iter().take(6).enumerate() {
        out[48 - 8 * (i + 1)..48 - 8 * i].copy_from_slice(&limb.to_be_bytes());
    }
    out
}

fn ge_p(r: &[u64; 7]) -> bool {
    if r[6] != 0 {
        return true;
    }
    for i in (0..6).rev() {
        if r[i] != P[i] {
            return r[i] > P[i];
        }
    }
    true
}

fn sub_p(r: &mut [u64; 7]) {
    let mut borrow = 0u64;
    for i in 0..7 {
        let p = if i < 6 { P[i] } else { 0 };
        let (d1, b1) = r[i].overflowing_sub(p);
        let (d2, b2) = d1.overflowing_sub(borrow);
        r[i] = d2;
        borrow = (b1 | b2) as u64;
    }
}

/// RFC 9380 hash_to_field for G1: two field elements, 48 big-endian bytes each.
pub fn hash_to_field_g1(msg: &[u8], dst: &[u8]) -> ([u8; 48], [u8; 48]) {
    let uniform = expand_message_xmd(msg, dst, 128);
    (reduce_mod_p(&uniform[0..64]), reduce_mod_p(&uniform[64..128]))
}

/// The message quicknet signs for a round.
pub fn round_message(round: u64) -> Vec<u8> {
    env::sha256(&round.to_be_bytes())
}

/// Verifies a quicknet signature (48 bytes) for `round` against a group key (96 bytes).
pub fn verify_quicknet(round: u64, signature: &[u8], public_key: &[u8]) -> bool {
    if signature.len() != 48 || public_key.len() != 96 {
        return false;
    }
    let (u0, u1) = hash_to_field_g1(&round_message(round), QUICKNET_DST);
    let mut fp = Vec::with_capacity(96);
    fp.extend_from_slice(&u0);
    fp.extend_from_slice(&u1);
    let Some(q) = env::bls12381_map_fp_to_g1(&fp) else { return false };
    let mut sum_in = Vec::with_capacity(194);
    sum_in.push(0);
    sum_in.extend_from_slice(&q[0..96]);
    sum_in.push(0);
    sum_in.extend_from_slice(&q[96..192]);
    let Some(hm) = env::bls12381_p1_sum(&sum_in) else { return false };

    let Some(sig) = env::bls12381_p1_decompress(signature) else { return false };
    let mut neg_in = Vec::with_capacity(97);
    neg_in.push(1);
    neg_in.extend_from_slice(&sig);
    let Some(neg_sig) = env::bls12381_p1_sum(&neg_in) else { return false };

    let Some(pk) = env::bls12381_p2_decompress(public_key) else { return false };
    let Some(g2) = env::bls12381_p2_decompress(G2_GENERATOR_COMPRESSED) else { return false };

    let mut pairs = Vec::with_capacity(576);
    pairs.extend_from_slice(&neg_sig);
    pairs.extend_from_slice(&g2);
    pairs.extend_from_slice(&hm);
    pairs.extend_from_slice(&pk);
    env::bls12381_pairing_check(&pairs) == Some(true)
}

pub fn from_hex(s: &str) -> Option<Vec<u8>> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect()
}

pub fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 15) as usize] as char);
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const FIXTURES: &str = include_str!("../../../fixtures/drand-quicknet.json");

    fn rounds() -> Vec<(u64, String, String, String)> {
        let v: serde_json::Value = serde_json::from_str(FIXTURES).unwrap();
        v["rounds"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| {
                (
                    r["round"].as_str().unwrap().parse().unwrap(),
                    r["signature"].as_str().unwrap().to_string(),
                    r["u0"].as_str().unwrap().to_string(),
                    r["u1"].as_str().unwrap().to_string(),
                )
            })
            .collect()
    }

    fn pk() -> Vec<u8> {
        let v: serde_json::Value = serde_json::from_str(FIXTURES).unwrap();
        from_hex(v["publicKey"].as_str().unwrap()).unwrap()
    }

    #[test]
    fn hash_to_field_matches_typescript() {
        testing_env!(VMContextBuilder::new().build());
        for (round, _, u0, u1) in rounds() {
            let (a, b) = hash_to_field_g1(&round_message(round), QUICKNET_DST);
            assert_eq!(to_hex(&a), u0, "u0 round {round}");
            assert_eq!(to_hex(&b), u1, "u1 round {round}");
        }
    }

    #[test]
    fn reduce_handles_edges() {
        testing_env!(VMContextBuilder::new().build());
        assert_eq!(reduce_mod_p(&[0u8; 64]), [0u8; 48]);
        let mut p_be = [0u8; 48];
        for (i, limb) in P.iter().enumerate() {
            p_be[48 - 8 * (i + 1)..48 - 8 * i].copy_from_slice(&limb.to_be_bytes());
        }
        assert_eq!(reduce_mod_p(&p_be), [0u8; 48]);
    }

    #[test]
    fn verifies_real_quicknet_rounds() {
        testing_env!(VMContextBuilder::new().build());
        let pk = pk();
        for (round, sig, _, _) in rounds() {
            let sig = from_hex(&sig).unwrap();
            assert!(verify_quicknet(round, &sig, &pk), "round {round}");
            assert!(!verify_quicknet(round + 1, &sig, &pk), "wrong round {round}");
            let mut bad = sig.clone();
            bad[47] ^= 1;
            assert!(!verify_quicknet(round, &bad, &pk), "tampered {round}");
        }
    }
}
