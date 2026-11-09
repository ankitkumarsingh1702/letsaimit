import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
    await createHealthHandler({ env: config, fetch: () => assert.fail('query before authentication') })({ method, headers: { authorization } }, res);
    assert.equal(res.statusCode, expected);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
});
test('authenticated health check invokes only the non-data health RPC', async () => {
  const res = response();
  let calls = 0;
  const fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, `${env.SUPABASE_URL}/rest/v1/rpc/registration_health`);
    assert.equal(options.method, 'POST');
    assert.equal(options.body, '{}');
    assert.deepEqual(options.headers, { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' });
    assert.equal(options.signal instanceof AbortSignal, true);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(JSON.stringify(options).includes(env.CRON_SECRET), false);
    return new Response('true', { status: 200 });
  };
  await createHealthHandler({ env, fetch })({ method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` } }, res);
  assert.equal(calls, 1);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true });
});
test('database health failures expose no credentials or provider exceptions', async () => {
  const failures = [
    () => new Response('false', { status: 200 }),
    () => new Response('null', { status: 200 }),
    () => new Response('{"private":"provider detail"}', { status: 200 }),
    () => new Response('"true"', { status: 200 }),
    () => new Response('<html>provider detail</html>', { status: 200 }),
    () => new Response('true', { status: 500 }),
    () => { throw new Error('Private provider exception'); },
  ];
  for (const fetch of failures) {
    const res = response();
    await createHealthHandler({ env, fetch })({ method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` } }, res);
    assert.equal(res.statusCode, 503); assert.deepEqual(res.body, { ok: false });
  }
});

test('health requests abort after eight seconds and expose only failure status', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const res = response();
  let aborted = false;
  const fetch = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      aborted = true;
      reject(new DOMException('Private provider timeout detail', 'AbortError'));
    }, { once: true });
  });
  const pending = createHealthHandler({ env, fetch })({ method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` } }, res);
  context.mock.timers.tick(7999);
  assert.equal(aborted, false);
  context.mock.timers.tick(1);
  await pending;
  assert.equal(aborted, true);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { ok: false });
});

test('only the dedicated UAT health deployment owns the three-day schedule', async () => {
  const website = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const service = JSON.parse(await readFile(new URL('../deployment/uat-health/vercel.json', import.meta.url), 'utf8'));
  const packageJson = JSON.parse(await readFile(new URL('../deployment/uat-health/package.json', import.meta.url), 'utf8'));
  assert.equal(Object.hasOwn(website, 'crons'), false);
  assert.equal(service.framework, null);
  assert.equal(service.outputDirectory, 'public');
  assert.deepEqual(service.crons, [{ path: '/api/cron/supabase', schedule: '0 6 */3 * *' }]);
  assert.equal(packageJson.private, true);
  assert.equal(Object.keys(packageJson.dependencies || {}).length, 0);
});
