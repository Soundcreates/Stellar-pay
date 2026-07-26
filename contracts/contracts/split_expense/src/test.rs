#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, vec, Address, Env};

#[test]
fn creates_and_settles_an_expense() {
    let env = Env::default();
    let contract_id = env.register(SplitExpense, ());
    let client = SplitExpenseClient::new(&env, &contract_id);
    env.mock_all_auths();
    let owner = Address::generate(&env);
    let friend = Address::generate(&env);
    let id = client.create(&owner, &100, &vec![
        &env,
        Share { participant: owner.clone(), amount: 40, paid: false },
        Share { participant: friend.clone(), amount: 60, paid: false },
    ]);

    client.mark_paid(&id, &owner);
    client.mark_paid(&id, &friend);

    assert!(client.get(&id).settled);
}
