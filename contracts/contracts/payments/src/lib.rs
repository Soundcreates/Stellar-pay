#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRequest {
    pub payer: Address,
    pub payee: Address,
    pub amount: i128,
    pub paid: bool,
}

#[contracttype]
pub enum DataKey {
    Token,
    NextRequest,
    Request(u64),
}

#[contract]
pub struct Payments;

#[contractimpl]
impl Payments {
    // `token` can be Stellar's native-XLM asset contract or any Stellar Asset Contract.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        admin.require_auth();
        assert!(!env.storage().instance().has(&DataKey::Token));
        env.storage().instance().set(&DataKey::Token, &token);
    }

    pub fn direct_pay(env: Env, payer: Address, payee: Address, amount: i128) {
        payer.require_auth();
        assert!(payer != payee && amount > 0);
        token::Client::new(&env, &payment_token(&env)).transfer(&payer, &payee, &amount);
    }

    // Called when the recipient creates a payment-request chat card.
    pub fn create_request(env: Env, payer: Address, payee: Address, amount: i128) -> u64 {
        payee.require_auth();
        assert!(payer != payee && amount > 0);
        let id = env.storage().persistent().get(&DataKey::NextRequest).unwrap_or(0);
        env.storage().persistent().set(&DataKey::NextRequest, &(id + 1));
        env.storage().persistent().set(
            &DataKey::Request(id),
            &PaymentRequest { payer, payee, amount, paid: false },
        );
        id
    }

    // Called by the Pay button. The token transfer and request update are atomic.
    pub fn pay_request(env: Env, id: u64, payer: Address) {
        payer.require_auth();
        let mut request: PaymentRequest = env.storage().persistent().get(&DataKey::Request(id)).unwrap();
        assert!(request.payer == payer && !request.paid);
        token::Client::new(&env, &payment_token(&env)).transfer(&payer, &request.payee, &request.amount);
        request.paid = true;
        env.storage().persistent().set(&DataKey::Request(id), &request);
    }

    pub fn get_request(env: Env, id: u64) -> PaymentRequest {
        env.storage().persistent().get(&DataKey::Request(id)).unwrap()
    }
}

fn payment_token(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Token).unwrap()
}

mod test;
