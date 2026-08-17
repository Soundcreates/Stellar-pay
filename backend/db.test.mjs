import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from './db.js';

test('usernames are unique and direct chats are reused', () => {
  const store = createStore(':memory:');
  store.createUser('GA', 'shantanav');
  store.createUser('GB', 'alice');
  assert.equal(store.userByUsername('ALICE').address, 'GB');
  const chat = store.directChat('GA', 'GB');
  assert.equal(store.directChat('GB', 'GA').id, chat.id);
  const group = store.createGroup('Weekend', 'GA', ['GB']);
  assert.equal(store.chatHasMembers(group.id, 'GA', 'GB'), true);
  const expense = store.createExpense(group.id, 'Outing', 'GA', '1', [{ address: 'GA', amount: '0.5' }, { address: 'GB', amount: '0.5' }]);
  assert.equal(expense.participants.find((member) => member.address === 'GA').paid, true);
  assert.equal(store.payExpense(expense.id, 'GB', 'tx-hash').settled, true);
  assert.equal(store.chatsFor('GB').length, 2);
  store.createUser('GC', 'sam');
  const invite = store.createChatRequest('GC', 'GA');
  assert.equal(store.chatRequestsFor('GA')[0].username, 'sam');
  assert.equal(store.respondToChatRequest(invite.id, 'GA', true).chat.memberOne, 'GA');
  assert.throws(() => store.createUser('GC', 'alice'));
});
