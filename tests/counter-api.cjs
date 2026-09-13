const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHandler } = require('../api/spark.js');
const exec = promisify(execFile);
const origin = 'https://limzhengjie.com';
let folder, socket, redis, handler;
const env = { VERCEL_ENV: 'production', VERCEL: '1', SPARK_ALLOWED_ORIGINS: origin,
  UPSTASH_REDIS_REST_URL: 'https://test.invalid', UPSTASH_REDIS_REST_TOKEN: 'test-token', SPARK_RATE_SALT: 'test-salt' };

async function command(args) {
  return JSON.parse((await exec('redis-cli', ['-s', socket, '--json', ...args.map(String)])).stdout);
}
async function startRedis() {
  redis = spawn('redis-server', ['--port', '0', '--unixsocket', socket, '--save', '',
    '--appendonly', 'yes', '--appendfsync', 'always', '--dir', folder], { stdio: 'ignore' });
  let failed;
  redis.on('error', error => { failed = error; });
  for (let i = 0; i < 100; i++) {
    if (failed) throw failed;
    try { if (await command(['PING']) === 'PONG') return; } catch (_) { /* Wait for the isolated socket. */ }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('redis-server did not start');
}
async function stopRedis() {
  if (!redis || redis.exitCode !== null) return;
  await new Promise(resolve => { redis.once('exit', resolve); redis.kill('SIGTERM'); });
}
const fetcher = async (_url, options) => {
  assert.equal(options.headers.Authorization, 'Bearer test-token');
  return { ok: true, json: async () => ({ result: await command(JSON.parse(options.body)) }) };
};
async function call(options = {}) {
  const headers = { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.1', ...options.headers };
  const req = { method: options.method || 'POST', headers, body: options.body || { requestId: randomUUID(), amount: 1 } };
  const response = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(value) { this.body = value ? JSON.parse(value) : null; } };
  await (options.handler || handler)(req, response);
  return response;
}
before(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'site-spark-redis-'));
  socket = path.join(folder, 'redis.sock');
  await startRedis();
  handler = createHandler({ env, fetcher });
});
after(async () => { await stopRedis(); if (folder) await fs.rm(folder, { recursive: true, force: true }); });

test('concurrent visitors add every tap without lost increments', async () => {
  const responses = await Promise.all(Array.from({ length: 40 }, (_, i) => call({
    body: { requestId: randomUUID(), amount: 3 }, headers: { 'x-forwarded-for': `192.0.2.${i + 2}` }
  })));
  assert.ok(responses.every(response => response.statusCode === 200));
  assert.equal((await call({ method: 'GET' })).body.total, 120);
});
test('a lost response retried concurrently is counted exactly once', async () => {
  const before = (await call({ method: 'GET' })).body.total;
  const body = { requestId: randomUUID(), amount: 7 };
  const responses = await Promise.all(Array.from({ length: 12 }, () => call({ body })));
  assert.ok(responses.every(response => response.statusCode === 200));
  assert.equal((await call({ method: 'GET' })).body.total, before + 7);
  assert.equal((await call({ body: { ...body, amount: 6 } })).statusCode, 409);
  assert.equal((await call({ body: { ...body, requestId: body.requestId.toUpperCase() } })).body.total, before + 7);
});
test('total and deduplication survive a Redis restart', async () => {
  const body = { requestId: randomUUID(), amount: 1 };
  const saved = (await call({ body })).body.total;
  await stopRedis(); await startRedis();
  assert.equal((await call({ method: 'GET' })).body.total, saved);
  assert.equal((await call({ body })).body.total, saved);
  assert.equal(await command(['TTL', 'spark:production:total']), -1);
});
test('rate limit is atomic, expires, and does not reject an already saved retry', async () => {
  const headers = { 'x-forwarded-for': '2001:db8::7' };
  const bodies = Array.from({ length: 15 }, () => ({ requestId: randomUUID(), amount: 10 }));
  const responses = await Promise.all(bodies.map(body => call({ body, headers })));
  assert.equal(responses.filter(r => r.statusCode === 200).length, 12);
  assert.equal(responses.filter(r => r.statusCode === 429).length, 3);
  assert.ok(responses.filter(r => r.statusCode === 429).every(r => Number(r.headers['retry-after']) > 0));
  assert.ok(responses.filter(r => r.statusCode === 429).every(r => r.headers['access-control-expose-headers'] === 'Retry-After'));
  const accepted = bodies[responses.findIndex(r => r.statusCode === 200)];
  assert.equal((await call({ body: accepted, headers })).statusCode, 200);
  const keys = await command(['KEYS', 'spark:production:rate:*']);
  assert.ok(keys.every(key => !key.includes('2001:db8')));
  assert.ok((await command(['TTL', keys[0]])) > 0);
});
test('only exact allowed origins can write and preflight is supported', async () => {
  for (const bad of [undefined, 'null', 'https://limzhengjie.com.evil.test', 'https://other.test']) {
    assert.equal((await call({ headers: { origin: bad } })).statusCode, 403);
  }
  const preflight = await call({ method: 'OPTIONS' });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], origin);
  assert.equal((await call({ method: 'GET', headers: { origin: undefined } })).statusCode, 200);
  assert.equal((await call({ method: 'DELETE' })).statusCode, 405);
});
test('malformed payloads and spoofable address lists cannot increment', async () => {
  const before = (await call({ method: 'GET' })).body.total;
  for (const body of [{}, { requestId: randomUUID(), amount: -1 }, { requestId: randomUUID(), amount: 11 },
    { requestId: randomUUID(), amount: 1.5 }, { requestId: randomUUID(), amount: '1' },
    { requestId: 'arbitrary-key', amount: 1 }, { requestId: randomUUID(), amount: 1, extra: 'field' }, '{invalid']) {
    assert.equal((await call({ body })).statusCode, 400);
  }
  assert.equal((await call({ headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await call({ headers: { 'content-length': '513' } })).statusCode, 413);
  assert.equal((await call({ headers: { 'x-forwarded-for': 'fake, 192.0.2.5' } })).statusCode, 400);
  assert.equal((await call({ method: 'GET' })).body.total, before);
});
test('unavailable or malformed storage fails closed without pretending the total is zero', async () => {
  for (const fetcher of [async () => { throw new Error('test secret'); },
    async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ result: 'nonsense' }) })]) {
    const response = await call({ method: 'GET', handler: createHandler({ env, fetcher }) });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { error: 'Counter unavailable' });
  }
  assert.equal((await call({ handler: createHandler({ env: {} }) })).statusCode, 403);
  assert.equal((await call({ method: 'GET', headers: { origin: undefined }, handler: createHandler({ env: {} }) })).statusCode, 503);
});
test('preview writes are isolated from the public total', async () => {
  const before = (await call({ method: 'GET' })).body.total;
  const preview = createHandler({ env: { ...env, VERCEL_ENV: 'preview', VERCEL_URL: 'preview.vercel.app' }, fetcher });
  assert.equal((await call({ handler: preview })).statusCode, 403);
  assert.equal((await call({ handler: preview, headers: { origin: 'https://preview.vercel.app' } })).body.total, 1);
  assert.equal((await call({ method: 'GET' })).body.total, before);
});
