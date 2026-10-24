const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, SCHEMAS } = require('../services');

test('every public service has a schema', () => {
  assert.deepEqual(Object.keys(SCHEMAS).sort(), ['ads', 'complaints', 'info', 'inquiry', 'requests']);
});

test('valid payloads are accepted and trimmed', () => {
  assert.deepEqual(validate('inquiry', { name: ' علي ', question: 'سؤال' }), { ok: true, data: { name: 'علي', question: 'سؤال' } });
  assert.equal(validate('ads', { title: 't', content: 'c' }).ok, true);
  assert.equal(validate('complaints', { name: 'n', complaint: 'c' }).ok, true);
  assert.equal(validate('requests', { name: 'n', request: 'r' }).ok, true);
  assert.equal(validate('info', { message: 'm' }).ok, true);
});

test('unexpected fields are rejected, including __proto__', () => {
  assert.equal(validate('inquiry', { name: 'n', question: 'q', admin: true }).ok, false);
  const withProto = JSON.parse('{"name":"n","question":"q","__proto__":{"x":1}}');
  assert.equal(validate('inquiry', withProto).ok, false);
});

test('missing, empty and non-string values are rejected', () => {
  assert.equal(validate('ads', { title: 't' }).ok, false);
  assert.equal(validate('inquiry', { name: '   ', question: 'q' }).ok, false);
  assert.equal(validate('ads', { title: 5, content: 'c' }).ok, false);
  assert.equal(validate('ads', { title: { a: 1 }, content: 'c' }).ok, false);
});

test('length limits are enforced', () => {
  assert.equal(validate('inquiry', { name: 'x'.repeat(100), question: 'q' }).ok, true);
  assert.equal(validate('inquiry', { name: 'x'.repeat(101), question: 'q' }).ok, false);
  assert.equal(validate('requests', { name: 'n', request: 'x'.repeat(2001) }).ok, false);
});

test('non-object bodies and unknown services are rejected', () => {
  assert.equal(validate('inquiry', null).ok, false);
  assert.equal(validate('inquiry', [1, 2]).ok, false);
  assert.equal(validate('inquiry', 'text').ok, false);
  assert.equal(validate('nope', {}).ok, false);
});
