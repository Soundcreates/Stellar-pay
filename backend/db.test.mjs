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
  assert.throws(() => store.createUser('GC', 'alice'));
});
