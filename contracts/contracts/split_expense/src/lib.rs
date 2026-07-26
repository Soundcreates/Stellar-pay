#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Share {
    pub participant: Address,
    pub amount: i128,
    pub paid: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Expense {
    pub owner: Address,
    pub total: i128,
    pub shares: Vec<Share>,
    pub settled: bool,
}

#[contracttype]
pub enum DataKey {
    NextId,
    Expense(u64),
}

#[contract]
pub struct SplitExpense;

#[contractimpl]
impl SplitExpense {
    pub fn create(env: Env, owner: Address, total: i128, shares: Vec<Share>) -> u64 {
        owner.require_auth();
        assert!(total > 0 && !shares.is_empty());

        let mut sum = 0;
        for share in shares.iter() {
            assert!(share.amount > 0);
            sum += share.amount;
        }
        assert_eq!(sum, total);

        let id = env.storage().persistent().get(&DataKey::NextId).unwrap_or(0);
        env.storage().persistent().set(&DataKey::NextId, &(id + 1));
        env.storage().persistent().set(
            &DataKey::Expense(id),
            &Expense { owner, total, shares, settled: false },
        );
        id
    }

    pub fn mark_paid(env: Env, id: u64, participant: Address) {
        participant.require_auth();
        let mut expense: Expense = env.storage().persistent().get(&DataKey::Expense(id)).unwrap();
        let mut found = false;
        for index in 0..expense.shares.len() {
            let mut share = expense.shares.get(index).unwrap();
            if share.participant == participant {
                share.paid = true;
                expense.shares.set(index, share);
                found = true;
                break;
            }
        }
        assert!(found);
        expense.settled = expense.shares.iter().all(|share| share.paid);
        env.storage().persistent().set(&DataKey::Expense(id), &expense);
    }

    pub fn get(env: Env, id: u64) -> Expense {
        env.storage().persistent().get(&DataKey::Expense(id)).unwrap()
    }
}

mod test;
