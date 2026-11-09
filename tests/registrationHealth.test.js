import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthHandler } from '../api/cron/supabase.js';

const env = { CRON_SECRET: 'test-only-secret', SUPABASE_URL: 'https://project.example.test', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
function response() {
  return { headers: {}, statusCode: 0, body: null, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
}
test('unconfigured, wrong-method and unsigned cron calls cannot query the database', async () => {
  for (const [config, method, authorization, expected] of [
    [{}, 'GET', '', 503], [env, 'POST', '', 405], [env, 'GET', '', 401], [env, 'GET', 'Bearer incorrect', 401],
  ]) {
    const res = response();
    await createHealthHandler({ env: config, makeClient: () => assert.fail('query before authentication') })({ method, headers: { authorization } }, res);
    assert.equal(res.statusCode, expected);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
});
test('authenticated health check invokes only the non-data health RPC', async () => {
  const res = response();
  const makeClient = (url, key, options) => {
    assert.equal(url, env.SUPABASE_URL); assert.equal(key, env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(options.auth.persistSession, false);
    return { rpc: name => { assert.equal(name, 'registration_health'); return { abortSignal: async () => ({ data: true, error: null }) }; } };
  };
  await createHealthHandler({ env, makeClient })({ method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` } }, res);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true });
});
test('database health failures expose no credentials or provider exceptions', async () => {
  for (const result of [{ data: false, error: null }, { data: null, error: { message: 'private provider detail' } }]) {
    const res = response();
    const makeClient = () => ({ rpc: () => ({ abortSignal: async () => result }) });
    await createHealthHandler({ env, makeClient })({ method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` } }, res);
    assert.equal(res.statusCode, 503); assert.deepEqual(res.body, { ok: false });
  }
});
