const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../rateLimit');

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test('allows up to max requests per window, then answers 429 with Retry-After', () => {
  let t = 1000;
  const limiter = createRateLimiter({ windowMs: 60000, max: 3, now: () => t });
  let passed = 0;
  const next = () => { passed += 1; };

  for (let i = 0; i < 3; i++) limiter({ ip: '1.1.1.1' }, fakeRes(), next);
  assert.equal(passed, 3);

  const res = fakeRes();
  limiter({ ip: '1.1.1.1' }, res, next);
  assert.equal(passed, 3);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.ok, false);
  assert.ok(Number(res.headers['Retry-After']) >= 1);
  limiter.stop();
});

test('counts clients separately and resets after the window', () => {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
  let passed = 0;
  const next = () => { passed += 1; };

  limiter({ ip: 'a' }, fakeRes(), next);
  limiter({ ip: 'b' }, fakeRes(), next);
  assert.equal(passed, 2);

  const blocked = fakeRes();
  limiter({ ip: 'a' }, blocked, next);
  assert.equal(blocked.statusCode, 429);

  t = 1500;
  limiter({ ip: 'a' }, fakeRes(), next);
  assert.equal(passed, 3);
  limiter.stop();
});

test('rejects invalid configuration', () => {
  assert.throws(() => createRateLimiter({ windowMs: 0, max: 1 }));
  assert.throws(() => createRateLimiter({ windowMs: 1000, max: 0 }));
});
