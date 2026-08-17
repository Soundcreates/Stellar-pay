import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { buildApp } from './app.js';
import { createStore } from './db.js';

function fakeHorizon({ sequence = '100', fail = false } = {}) {
  return {
    async loadAccount(id) {
      return { accountId: () => id, sequenceNumber: () => sequence };
    },
    async submitTransaction() {
      if (fail) throw { response: { data: { extras: { result_codes: { transaction: 'tx_failed' } } } } };
      return { hash: 'fake-hash-123', successful: true };
    },
  };
}

function makeApp(overrides = {}) {
  return buildApp({ store: overrides.store ?? createStore(':memory:'), horizon: overrides.horizon ?? fakeHorizon() });
}

// --- users -------------------------------------------------------------

test('POST /users creates a user, rejects duplicate address/username, validates input', async () => {
  const { app } = makeApp();

  const created = await app.inject({ method: 'POST', url: '/users', payload: { address: 'GA', username: '@Shantanav' } });
  assert.equal(created.statusCode, 200);
  assert.deepEqual(created.json(), { address: 'GA', username: 'shantanav' });

  const dupeAddress = await app.inject({ method: 'POST', url: '/users', payload: { address: 'GA', username: 'someoneelse' } });
  assert.equal(dupeAddress.statusCode, 409);
  assert.match(dupeAddress.json().error, /already has a username/);

  const dupeUsername = await app.inject({ method: 'POST', url: '/users', payload: { address: 'GB', username: 'Shantanav' } });
  assert.equal(dupeUsername.statusCode, 409);
  assert.match(dupeUsername.json().error, /already taken/);

  const badUsername = await app.inject({ method: 'POST', url: '/users', payload: { address: 'GC', username: 'a' } });
  assert.equal(badUsername.statusCode, 400);

  const missingAddress = await app.inject({ method: 'POST', url: '/users', payload: { username: 'noone' } });
  assert.equal(missingAddress.statusCode, 400);
});

test('GET /users/address/:address and /users/lookup/:username', async () => {
  const { app } = makeApp();
  await app.inject({ method: 'POST', url: '/users', payload: { address: 'GA', username: 'shantanav' } });

  const byAddress = await app.inject({ url: '/users/address/GA' });
  assert.equal(byAddress.json().username, 'shantanav');

  const byUsername = await app.inject({ url: '/users/lookup/SHANTANAV' });
  assert.equal(byUsername.json().address, 'GA');

  const missing = await app.inject({ url: '/users/address/GZZZ' });
  assert.equal(missing.json(), null);
});

// --- direct chats + requests -------------------------------------------

test('POST /chats/direct requires a registered sender, blocks self-message, creates an invite then reuses the chat once accepted', async () => {
  const { app } = makeApp();
  await app.inject({ method: 'POST', url: '/users', payload: { address: 'GA', username: 'shantanav' } });
  await app.inject({ method: 'POST', url: '/users', payload: { address: 'GB', username: 'alice' } });

  const unregistered = await app.inject({ method: 'POST', url: '/chats/direct', payload: { address: 'GX', username: 'alice' } });
  assert.equal(unregistered.statusCode, 403);

  const unknownPeer = await app.inject({ method: 'POST', url: '/chats/direct', payload: { address: 'GA', username: 'ghost' } });
  assert.equal(unknownPeer.statusCode, 404);

  const self = await app.inject({ method: 'POST', url: '/chats/direct', payload: { address: 'GA', username: 'shantanav' } });
  assert.equal(self.statusCode, 400);

  const invite = await app.inject({ method: 'POST', url: '/chats/direct', payload: { address: 'GA', username: 'alice' } });
  assert.equal(invite.statusCode, 200);
  assert.equal(invite.json().type, 'invite');

  const requests = await app.inject({ url: '/chats/requests/GB' });
  assert.equal(requests.json()[0].sender, 'GA');

  const accept = await app.inject({ method: 'POST', url: `/chats/requests/${invite.json().id}`, payload: { address: 'GB', accept: true } });
  assert.equal(accept.json().accepted, true);
  const chatId = accept.json().chat.id;

  const reused = await app.inject({ method: 'POST', url: '/chats/direct', payload: { address: 'GA', username: 'alice' } });
  assert.equal(reused.json().type, 'direct');
  assert.equal(reused.json().id, chatId);

  const notFound = await app.inject({ method: 'POST', url: '/chats/requests/does-not-exist', payload: { address: 'GB', accept: true } });
  assert.equal(notFound.statusCode, 404);
});

test('POST /chats/requests/:id reject leaves no chat behind', async () => {
  const { app, store } = makeApp();
  store.createUser('GA', 'shantanav');
  store.createUser('GB', 'alice');
  const invite = store.createChatRequest('GA', 'GB');

  const reject = await app.inject({ method: 'POST', url: `/chats/requests/${invite.id}`, payload: { address: 'GB', accept: false } });
  assert.equal(reject.json().accepted, false);
  assert.equal(reject.json().chat, null);
  assert.equal(store.existingDirectChat('GA', 'GB'), null);
});

// --- group chats ---------------------------------------------------------

test('POST /chats/group validates membership and creates a group', async () => {
  const { app, store } = makeApp();
  store.createUser('GA', 'shantanav');
  store.createUser('GB', 'alice');
  store.createUser('GC', 'sam');

  const noCreatorProfile = await app.inject({ method: 'POST', url: '/chats/group', payload: { creator: 'GX', title: 'Trip', usernames: ['alice'] } });
  assert.equal(noCreatorProfile.statusCode, 403);

  const noMembers = await app.inject({ method: 'POST', url: '/chats/group', payload: { creator: 'GA', title: 'Trip', usernames: [] } });
  assert.equal(noMembers.statusCode, 400);

  const unknownMember = await app.inject({ method: 'POST', url: '/chats/group', payload: { creator: 'GA', title: 'Trip', usernames: ['ghost'] } });
  assert.equal(unknownMember.statusCode, 404);

  const onlySelf = await app.inject({ method: 'POST', url: '/chats/group', payload: { creator: 'GA', title: 'Trip', usernames: ['shantanav'] } });
  assert.equal(onlySelf.statusCode, 400);

  const created = await app.inject({ method: 'POST', url: '/chats/group', payload: { creator: 'GA', title: 'Weekend trip', usernames: ['alice', 'sam'] } });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().members.length, 3);
});

// --- messages --------------------------------------------------------------

test('POST /messages validates fields and GET returns them in order', async () => {
  const { app } = makeApp();
  const missing = await app.inject({ method: 'POST', url: '/messages', payload: { chatId: 'c1' } });
  assert.equal(missing.statusCode, 400);

  await app.inject({ method: 'POST', url: '/messages', payload: { chatId: 'c1', sender: 'shantanav', text: 'hey' } });
  await app.inject({ method: 'POST', url: '/messages', payload: { chatId: 'c1', sender: 'alice', text: 'hi' } });

  const list = await app.inject({ url: '/chats/c1/messages' });
  assert.deepEqual(list.json().map((m) => m.text), ['hey', 'hi']);

  const empty = await app.inject({ url: '/chats/other/messages' });
  assert.deepEqual(empty.json(), []);
});

// --- payment requests --------------------------------------------------------

test('payment requests: create is restricted to chat members, then can be paid', async () => {
  const { app, store } = makeApp();
  store.createUser('GA', 'shantanav');
  store.createUser('GB', 'alice');
  store.createUser('GC', 'stranger');
  const chat = store.directChat('GA', 'GB');

  const unknownPayer = await app.inject({ method: 'POST', url: '/requests', payload: { chatId: chat.id, payerUsername: 'ghost', payee: 'GA', amount: '5' } });
  assert.equal(unknownPayer.statusCode, 404);

  const notMember = await app.inject({ method: 'POST', url: '/requests', payload: { chatId: chat.id, payerUsername: 'stranger', payee: 'GA', amount: '5' } });
  assert.equal(notMember.statusCode, 403);

  const created = await app.inject({ method: 'POST', url: '/requests', payload: { chatId: chat.id, payerUsername: 'alice', payee: 'GA', amount: '5' } });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().status, 'open');

  const wrongPayer = await app.inject({ method: 'POST', url: `/requests/${created.json().id}/pay`, payload: { payer: 'GC', transactionHash: 'tx1' } });
  assert.equal(wrongPayer.statusCode, 404);

  const paid = await app.inject({ method: 'POST', url: `/requests/${created.json().id}/pay`, payload: { payer: 'GB', transactionHash: 'tx1' } });
  assert.equal(paid.json().status, 'paid');
  assert.equal(paid.json().transactionHash, 'tx1');
});

// --- expenses (pinned outings) -----------------------------------------------

test('expenses: split math, membership checks, paying settles once everyone has paid', async () => {
  const { app, store } = makeApp();
  store.createUser('GA', 'shantanav');
  store.createUser('GB', 'alice');
  store.createUser('GC', 'sam');
  const group = store.createGroup('Trip', 'GA', ['GB', 'GC']);

  const notMember = await app.inject({ method: 'POST', url: '/expenses', payload: { chatId: group.id, creator: 'GX', title: 'Dinner', total: '10' } });
  assert.equal(notMember.statusCode, 403);

  const created = await app.inject({ method: 'POST', url: '/expenses', payload: { chatId: group.id, creator: 'GA', title: 'Dinner', total: '10' } });
  assert.equal(created.statusCode, 200);
  const expense = created.json();
  assert.equal(expense.totalAmount, '10');
  assert.equal(expense.participants.length, 3);
  // 10 XLM / 3 members = 3.3333333 each, remainder goes to the creator
  const byAddress = Object.fromEntries(expense.participants.map((p) => [p.address, p]));
  assert.equal(byAddress.GB.amount, '3.3333333');
  assert.equal(byAddress.GC.amount, '3.3333333');
  assert.equal(byAddress.GA.amount, '3.3333334');
  assert.equal(byAddress.GA.paid, true, 'creator is pre-marked as paid for their own share');
  assert.equal(byAddress.GB.paid, false);
  assert.equal(expense.settled, false);

  const alreadyPaid = await app.inject({ method: 'POST', url: `/expenses/${expense.id}/pay`, payload: { payer: 'GA', transactionHash: 'tx-a' } });
  assert.equal(alreadyPaid.statusCode, 404, 'creator share was already marked paid at creation');

  const payB = await app.inject({ method: 'POST', url: `/expenses/${expense.id}/pay`, payload: { payer: 'GB', transactionHash: 'tx-b' } });
  assert.equal(payB.json().settled, false);

  const payC = await app.inject({ method: 'POST', url: `/expenses/${expense.id}/pay`, payload: { payer: 'GC', transactionHash: 'tx-c' } });
  assert.equal(payC.json().settled, true);

  const list = await app.inject({ url: `/chats/${group.id}/expenses` });
  assert.deepEqual(list.json(), [], 'settled expenses drop off the active list');
});

// --- payment building / submitting (Freighter-signing flow) ------------------

test('POST /payments/build restricts to chat members and validates amount', async () => {
  const alice = Keypair.random();
  const bob = Keypair.random();
  const { app, store } = makeApp();
  store.createUser(alice.publicKey(), 'shantanav');
  store.createUser(bob.publicKey(), 'alice');
  const chat = store.directChat(alice.publicKey(), bob.publicKey());
  const stranger = Keypair.random();

  const notMembers = await app.inject({
    method: 'POST',
    url: '/payments/build',
    payload: { sender: alice.publicKey(), destination: stranger.publicKey(), chatId: chat.id, amount: '1' },
  });
  assert.equal(notMembers.statusCode, 403);

  const badAmount = await app.inject({
    method: 'POST',
    url: '/payments/build',
    payload: { sender: alice.publicKey(), destination: bob.publicKey(), chatId: chat.id, amount: '-1' },
  });
  assert.equal(badAmount.statusCode, 400);
});

test('POST /payments/build produces a valid, correctly-shaped unsigned XDR that the sender can sign', async () => {
  const alice = Keypair.random();
  const bob = Keypair.random();
  const { app, store } = makeApp({ horizon: fakeHorizon({ sequence: '42' }) });
  store.createUser(alice.publicKey(), 'shantanav');
  store.createUser(bob.publicKey(), 'alice');
  const chat = store.directChat(alice.publicKey(), bob.publicKey());

  const built = await app.inject({
    method: 'POST',
    url: '/payments/build',
    payload: { sender: alice.publicKey(), destination: bob.publicKey(), chatId: chat.id, amount: '12.5' },
  });
  assert.equal(built.statusCode, 200);
  const { xdr, networkPassphrase } = built.json();
  assert.equal(networkPassphrase, Networks.TESTNET);

  // This is exactly what Freighter does client-side: parse the XDR, sign it, re-serialize.
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  assert.equal(tx.source, alice.publicKey());
  assert.equal(tx.sequence, '43'); // horizon sequence '42' + 1
  assert.equal(tx.operations.length, 1);
  assert.equal(tx.operations[0].type, 'payment');
  assert.equal(tx.operations[0].destination, bob.publicKey());
  assert.equal(tx.operations[0].amount, '12.5000000');

  tx.sign(alice);
  const signedXdr = tx.toXDR();
  assert.notEqual(signedXdr, xdr, 'signing changes the envelope (adds a signature)');

  const resigned = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  assert.equal(resigned.signatures.length, 1);
});

test('POST /payments/submit forwards signed XDR to horizon and surfaces failures', async () => {
  const alice = Keypair.random();
  const bob = Keypair.random();
  const { app, store } = makeApp();
  store.createUser(alice.publicKey(), 'shantanav');
  store.createUser(bob.publicKey(), 'alice');
  const chat = store.directChat(alice.publicKey(), bob.publicKey());

  const built = await app.inject({
    method: 'POST',
    url: '/payments/build',
    payload: { sender: alice.publicKey(), destination: bob.publicKey(), chatId: chat.id, amount: '1' },
  });
  const tx = TransactionBuilder.fromXDR(built.json().xdr, Networks.TESTNET);
  tx.sign(alice);

  const submitted = await app.inject({ method: 'POST', url: '/payments/submit', payload: { signedXdr: tx.toXDR() } });
  assert.equal(submitted.statusCode, 200);
  assert.equal(submitted.json().successful, true);

  const missing = await app.inject({ method: 'POST', url: '/payments/submit', payload: {} });
  assert.equal(missing.statusCode, 400);

  const malformed = await app.inject({ method: 'POST', url: '/payments/submit', payload: { signedXdr: 'not-a-real-xdr' } });
  assert.equal(malformed.statusCode, 400);
});

test('POST /payments/submit surfaces horizon rejection result codes', async () => {
  const alice = Keypair.random();
  const bob = Keypair.random();
  const { app, store } = makeApp({ horizon: fakeHorizon({ fail: true }) });
  store.createUser(alice.publicKey(), 'shantanav');
  store.createUser(bob.publicKey(), 'alice');
  const chat = store.directChat(alice.publicKey(), bob.publicKey());

  const built = await app.inject({
    method: 'POST',
    url: '/payments/build',
    payload: { sender: alice.publicKey(), destination: bob.publicKey(), chatId: chat.id, amount: '1' },
  });
  const tx = TransactionBuilder.fromXDR(built.json().xdr, Networks.TESTNET);
  tx.sign(alice);

  const submitted = await app.inject({ method: 'POST', url: '/payments/submit', payload: { signedXdr: tx.toXDR() } });
  assert.equal(submitted.statusCode, 400);
  assert.deepEqual(submitted.json().error, { transaction: 'tx_failed' });
});
