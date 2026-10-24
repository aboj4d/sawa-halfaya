const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, isValidEmail, isValidPassword } = require('../validators');

test('normalizeEmail trims and lowercases, non-strings become empty', () => {
  assert.equal(normalizeEmail('  Ali@Example.COM '), 'ali@example.com');
  assert.equal(normalizeEmail(undefined), '');
  assert.equal(normalizeEmail({ a: 1 }), '');
});

test('isValidEmail accepts normal addresses', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('first.last+tag@sub.example.com'), true);
});

test('isValidEmail rejects markup, spaces, missing parts and long values', () => {
  assert.equal(isValidEmail('<img src=x onerror=alert(1)>@x.com'), false);
  assert.equal(isValidEmail('a b@c.com'), false);
  assert.equal(isValidEmail('abc'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(123), false);
  assert.equal(isValidEmail('a'.repeat(250) + '@b.co'), false);
});

test('isValidPassword enforces 8 characters minimum and 72 bytes maximum', () => {
  assert.equal(isValidPassword('1234567'), false);
  assert.equal(isValidPassword('12345678'), true);
  assert.equal(isValidPassword('x'.repeat(72)), true);
  assert.equal(isValidPassword('x'.repeat(73)), false);
  assert.equal(isValidPassword('ع'.repeat(37)), false); // 74 bytes in UTF-8
  assert.equal(isValidPassword(null), false);
  assert.equal(isValidPassword(['12345678']), false);
});
