// Real end-to-end test against Stellar testnet: funds two accounts via Friendbot,
// builds an unsigned payment through our API, signs it exactly like Freighter would,
// submits it through our API, and confirms horizon actually moved the balance.
// Skips (not fails) if the testnet/Friendbot is unreachable, since that's an
// external dependency outside this repo's control.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Horizon, Keypair } from '@stellar/stellar-sdk';
import { buildApp } from './app.js';
import { createStore } from './db.js';

const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');

async function fund(publicKey) {
  const response = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
  if (!response.ok) throw new Error(`friendbot funding failed: ${response.status}`);
}

async function networkAvailable() {
  try {
    const response = await fetch('https://horizon-testnet.stellar.org/', { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

test('a real signed payment moves XLM on Stellar testnet', { timeout: 60_000 }, async (t) => {
  if (!(await networkAvailable())) {
    t.skip('stellar testnet horizon is unreachable from this environment');
    return;
  }

  const sender = Keypair.random();
  const destination = Keypair.random();
  await Promise.all([fund(sender.publicKey()), fund(destination.publicKey())]);

  const store = createStore(':memory:');
  store.createUser(sender.publicKey(), 'sender_e2e');
  store.createUser(destination.publicKey(), 'dest_e2e');
  const chat = store.directChat(sender.publicKey(), destination.publicKey());

  const { app } = buildApp({ store, horizon });

  const before = await horizon.loadAccount(destination.publicKey());
  const balanceBefore = Number(before.balances.find((b) => b.asset_type === 'native').balance);

  const built = await app.inject({
    method: 'POST',
    url: '/payments/build',
    payload: { sender: sender.publicKey(), destination: destination.publicKey(), chatId: chat.id, amount: '5' },
  });
  assert.equal(built.statusCode, 200, built.body);

  const { TransactionBuilder, Networks } = await import('@stellar/stellar-sdk');
  const tx = TransactionBuilder.fromXDR(built.json().xdr, Networks.TESTNET);
  tx.sign(sender); // exactly what Freighter does with the unsigned XDR we handed back

  const submitted = await app.inject({ method: 'POST', url: '/payments/submit', payload: { signedXdr: tx.toXDR() } });
  assert.equal(submitted.statusCode, 200, submitted.body);
  assert.equal(submitted.json().successful, true);

  const after = await horizon.loadAccount(destination.publicKey());
  const balanceAfter = Number(after.balances.find((b) => b.asset_type === 'native').balance);
  assert.ok(balanceAfter - balanceBefore >= 4.99, `expected ~5 XLM received, got ${balanceAfter - balanceBefore}`);
});

test('submitting an unsigned transaction is rejected by horizon', { timeout: 60_000 }, async (t) => {
  if (!(await networkAvailable())) {
    t.skip('stellar testnet horizon is unreachable from this environment');
    return;
  }

  const sender = Keypair.random();
  const destination = Keypair.random();
  await Promise.all([fund(sender.publicKey()), fund(destination.publicKey())]);

  const store = createStore(':memory:');
  store.createUser(sender.publicKey(), 'sender_unsigned');
  store.createUser(destination.publicKey(), 'dest_unsigned');
  const chat = store.directChat(sender.publicKey(), destination.publicKey());

  const { app } = buildApp({ store, horizon });

  const built = await app.inject({
    method: 'POST',
    url: '/payments/build',
    payload: { sender: sender.publicKey(), destination: destination.publicKey(), chatId: chat.id, amount: '1' },
  });

  const submitted = await app.inject({ method: 'POST', url: '/payments/submit', payload: { signedXdr: built.json().xdr } });
  assert.equal(submitted.statusCode, 400);
});
