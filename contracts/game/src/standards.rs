//! NEP-141 ($SLAY), NEP-145 storage and NEP-245 items.
//!
//! NPC and bookkeeping accounts (treasury, pouches, bear, smith, loot, market) can never send
//! or receive through the standard methods: their balances move only by game rules.

use crate::*;
use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds};
use near_sdk::{assert_one_yocto, NearToken, PromiseOrValue};

const ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='34' r='22' fill='%238b5a2b'/%3E%3Ccircle cx='14' cy='14' r='8' fill='%238b5a2b'/%3E%3Ccircle cx='50' cy='14' r='8' fill='%238b5a2b'/%3E%3Cpath d='M18 40 L46 28' stroke='%23e5e7eb' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E";

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        let p = env::predecessor_account_id();
        if self.is_special(&p) || self.is_special(&receiver_id) {
            fail("special_account");
        }
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        let p = env::predecessor_account_id();
        if self.is_special(&p) || self.is_special(&receiver_id) {
            fail("special_account");
        }
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (used, burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 {
            self.burned += burned;
            FtBurn { owner_id: &sender_id, amount: U128(burned), memo: Some("refund to unregistered account") }.emit();
        }
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        let p = env::predecessor_account_id();
        if self.is_special(&p) {
            fail("special_account");
        }
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            if balance > 0 {
                self.burned += balance;
                FtBurn { owner_id: &account_id, amount: U128(balance), memo: Some("account unregistered") }.emit();
            }
            true
        } else {
            false
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Slay the Bear".to_string(),
            symbol: "SLAY".to_string(),
            icon: Some(ICON.to_string()),
            reference: None,
            reference_hash: None,
            decimals: 18,
        }
    }
}

#[near(serializers = [json])]
pub struct MtToken {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
}

/// NEP-245 core: transfers (1 yoctoNEAR, wallets only), balances and supplies.
/// Approvals and `mt_transfer_call` are not supported; in-game trading uses `list` and `buy`.
#[near]
impl Contract {
    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        let _ = memo;
        if approval.is_some() {
            fail("approvals_not_supported");
        }
        let a = env::predecessor_account_id();
        self.require_player(&a);
        if self.is_special(&receiver_id) {
            fail("special_account");
        }
        self.move_item(&a, &receiver_id, &token_id, amount.0);
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        let _ = memo;
        if approvals.is_some_and(|v| v.iter().any(|x| x.is_some())) {
            fail("approvals_not_supported");
        }
        if token_ids.len() != amounts.len() || token_ids.is_empty() {
            fail("length_mismatch");
        }
        let a = env::predecessor_account_id();
        self.require_player(&a);
        if self.is_special(&receiver_id) {
            fail("special_account");
        }
        for (t, q) in token_ids.iter().zip(amounts.iter()) {
            self.move_item(&a, &receiver_id, t, q.0);
        }
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.item_bal(&account_id, &token_id))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.iter().map(|t| U128(self.item_bal(&account_id, t))).collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.item_supply.get(&token_id).map(|s| U128(*s))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.iter().map(|t| self.item_supply.get(t).map(|s| U128(*s))).collect()
    }

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<MtToken>> {
        token_ids
            .into_iter()
            .map(|t| self.item_supply.get(&t).map(|_| MtToken { token_id: t.clone(), owner_id: None }))
            .collect()
    }
}
