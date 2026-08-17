import assert from 'node:assert/strict';
import test from 'node:test';
import { requireText, stroops, toStroops, toXlm, username } from './app.js';

test('requireText trims and rejects blank/non-string values', () => {
  assert.equal(requireText('  hi  ', 'field'), 'hi');
  assert.throws(() => requireText('', 'field'), /field is required/);
  assert.throws(() => requireText('   ', 'field'), /field is required/);
  assert.throws(() => requireText(undefined, 'field'), /field is required/);
  assert.throws(() => requireText(42, 'field'), /field is required/);
});

test('stroops accepts positive decimal XLM amounts up to 7 places', () => {
  assert.equal(stroops('5'), '5');
  assert.equal(stroops('5.1234567'), '5.1234567');
  assert.equal(stroops(3), '3');
});

test('stroops rejects zero, negative, and malformed amounts', () => {
  assert.throws(() => stroops('0'));
  assert.throws(() => stroops('-1'));
  assert.throws(() => stroops('1.12345678'));
  assert.throws(() => stroops('abc'));
  assert.throws(() => stroops(''));
});

test('toStroops/toXlm round-trip and use banker-free integer math', () => {
  assert.equal(toStroops('1').toString(), '10000000');
  assert.equal(toStroops('0.0000001').toString(), '1');
  assert.equal(toXlm(10_000_000n), '1');
  assert.equal(toXlm(1n), '0.0000001');
  assert.equal(toXlm(toStroops('12.345')), '12.345');
});

test('username normalizes case, strips leading @, and enforces charset/length', () => {
  assert.equal(username('@Shantanav'), 'shantanav');
  assert.equal(username('sam_99'), 'sam_99');
  assert.throws(() => username('ab'), /3–20/);
  assert.throws(() => username('a'.repeat(21)), /3–20/);
  assert.throws(() => username('bad name'), /3–20/);
  assert.throws(() => username('bad!'), /3–20/);
});
