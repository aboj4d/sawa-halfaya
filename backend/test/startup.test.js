// Runs only where dependencies are installed (CI). Checks that the server
// refuses to start in production without JWT_SECRET / ADMIN_PASSWORD.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function depsInstalled() {
  try { require.resolve('express'); require.resolve('dotenv'); return true; } catch (e) { return false; }
}

const serverPath = path.join(__dirname, '..', 'server.js');
const baseEnv = { PATH: process.env.PATH, NODE_ENV: 'production' };

test('server exits when JWT_SECRET is missing', { skip: !depsInstalled() && 'dependencies not installed' }, () => {
  const r = spawnSync(process.execPath, [serverPath], {
    env: { ...baseEnv, ADMIN_PASSWORD: 'x'.repeat(16) }, encoding: 'utf8', timeout: 15000
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /JWT_SECRET is not set/);
});

test('server exits when ADMIN_PASSWORD is missing', { skip: !depsInstalled() && 'dependencies not installed' }, () => {
  const r = spawnSync(process.execPath, [serverPath], {
    env: { ...baseEnv, JWT_SECRET: 'x'.repeat(48) }, encoding: 'utf8', timeout: 15000
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ADMIN_PASSWORD is not set/);
});
