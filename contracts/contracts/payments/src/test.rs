#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env};

#[test]
fn sends_directly_and_pays_a_request() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let payer = Address::generate(&env);
    let payee = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(admin.clone());
    let asset = token::StellarAssetClient::new(&env, &token_id);
    asset.mint(&payer, &100);

    let contract_id = env.register(Payments, ());
    let client = PaymentsClient::new(&env, &contract_id);
    client.initialize(&admin, &token_id);
    client.direct_pay(&payer, &payee, &25);
    assert_eq!(token::Client::new(&env, &token_id).balance(&payee), 25);

    let id = client.create_request(&payer, &payee, &75);
    client.pay_request(&id, &payer);
    assert!(client.get_request(&id).paid);
    assert_eq!(token::Client::new(&env, &token_id).balance(&payee), 100);
}
