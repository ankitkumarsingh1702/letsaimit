import test from "node:test";
import assert from "node:assert/strict";
import { createAccountDeletionHandler, drainAccountDeletions, ACCOUNT_DELETION_POLICY } from "../supabase/functions/_shared/account-deletion.js";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const anotherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const deletionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const lease = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const origin = "https://example.test", secret = "w".repeat(40);
const body = { expectedUserId: userId, policyVersion: ACCOUNT_DELETION_POLICY, confirmPermanent: true, acceptForfeit: true };
function request(value = body, headers = {}, method = "POST") {
  return new Request("https://backend.example.test/functions/v1/delete-account", { method, headers: { Origin: origin, Authorization: "Bearer signed-parent-token", "Content-Type": "application/json", ...headers }, ...(method === "POST" ? { body: JSON.stringify(value) } : {}) });
}
function fixture(overrides = {}) {
  const calls = [], logs = [];
  let status = "deleting";
  const config = { allowedOrigin: origin, workerSecret: secret,
    verifyUser: async () => ({ id: userId, app_metadata: { provider: "google" } }),
    verifyClaims: async () => null,
    revokeSessions: async token => { assert.equal(token, "signed-parent-token"); calls.push("revoke"); },
    removeAuthUser: async id => { assert.equal(id, userId); calls.push("hard-delete"); return true; },
    rpc: async (name, args) => {
      calls.push(name);
      if (name === "prepare_account_deletion") { assert.equal(args.p_user_id, userId); return { deletion_id: deletionId, status }; }
      if (name === "claim_account_deletions") return [{ id: deletionId, user_id: userId, lease_token: lease }];
      if (name === "finish_account_deletion") { assert.equal(args.p_lease_token, lease); status = args.p_success ? "deleted" : "deleting"; return status; }
      if (name === "get_account_deletion_status") return { status };
      throw new Error("unexpected_rpc");
    },
    log: value => logs.push(value),
    ...overrides,
  };
  return { handler: createAccountDeletionHandler(config), config, calls, logs };
}

test("explicit consent and verified subject bind deletion; permanent cleanup follows the archive transaction", async () => {
  const { handler, calls, logs } = fixture();
  const response = await handler(request({ ...body, user_id: anotherId }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: "deleted", deletedUserId: userId });
  assert.deepEqual(calls, ["prepare_account_deletion", "revoke", "claim_account_deletions", "hard-delete", "finish_account_deletion", "get_account_deletion_status"]);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  assert.equal(logs.length, 1); assert.equal(logs[0].outcome, "deleted");
  assert.doesNotMatch(JSON.stringify(logs), /signed-parent-token|aaaaaaaa|example\.test|service_role/);
});

test("unchecked/old consent, an account switch, non-Google and unsigned callers never archive or delete", async () => {
  for (const patch of [{ acceptForfeit: false }, { confirmPermanent: false }, { policyVersion: "old" }, { expectedUserId: "" }]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request({ ...body, ...patch }))).status, 400); assert.deepEqual(calls, []);
  }
  for (const [actor, status] of [[{ id: anotherId, app_metadata: { provider: "google" } }, 409], [{ id: userId, app_metadata: { provider: "email" } }, 401], [null, 401]]) {
    const { handler, calls } = fixture({ verifyUser: async () => actor });
    assert.equal((await handler(request())).status, status); assert.deepEqual(calls, []);
  }
  const { handler, calls } = fixture();
  assert.equal((await handler(request(body, { Authorization: "" }))).status, 401); assert.deepEqual(calls, []);
});

test("owner protection and invalid archive receipts cannot revoke a login", async () => {
  for (const rpc of [async () => { throw Object.assign(new Error("owner_protected"), { code: "owner_protected" }); }, async () => ({ deletion_id: "bad", status: "deleting" })]) {
    const { handler, calls } = fixture({ rpc });
    const response = await handler(request()); assert.ok([409, 503].includes(response.status));
    assert.equal(calls.includes("hard-delete"), false); assert.equal(calls.includes("revoke"), false);
  }
});

test("temporary Auth failure is a truthful pending deletion, then the protected worker completes it", async () => {
  const failed = fixture({ removeAuthUser: async () => false });
  const response = await failed.handler(request());
  assert.equal(response.status, 202); assert.deepEqual(await response.json(), { ok: true, status: "deleting", deletedUserId: userId });
  const worker = fixture({ verifyUser: async () => { throw new Error("worker_must_not_read_user"); } });
  assert.equal((await worker.handler(request({ mode: "worker", user_id: anotherId }, { Authorization: `Bearer ${secret}` }))).status, 200);
  assert.deepEqual(worker.calls, ["claim_account_deletions", "hard-delete", "finish_account_deletion"]);
  const denied = fixture();
  assert.equal((await denied.handler(request({ mode: "worker" }))).status, 401); assert.deepEqual(denied.calls, []);
});

test("lost-response retries may only read their signature-verified tombstone, never select another account", async () => {
  for (const status of ["deleted", "deleting"]) {
    const calls = [];
    const { handler } = fixture({ verifyUser: async () => null, verifyClaims: async () => ({ sub: userId }), rpc: async (name, args) => { calls.push(name); assert.equal(args.p_user_id, userId); return { status }; } });
    const response = await handler(request());
    assert.equal(response.status, status === "deleted" ? 200 : 202);
    assert.deepEqual(calls, ["get_account_deletion_status"]);
  }
  const mismatched = fixture({ verifyUser: async () => null, verifyClaims: async () => ({ sub: anotherId }) });
  assert.equal((await mismatched.handler(request())).status, 409); assert.deepEqual(mismatched.calls, []);
  const unknown = fixture({ verifyUser: async () => null, verifyClaims: async () => ({ sub: userId }), rpc: async () => null });
  assert.equal((await unknown.handler(request())).status, 401);
});

test("cross-origin/malformed/method requests have no side effects; preflight never starts deletion", async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request(body, { Origin: "https://wrong.test" }))).status, 403);
  assert.equal((await handler(request(null))).status, 400);
  assert.equal((await handler(request(body, {}, "GET"))).status, 405);
  assert.equal((await handler(request(body, {}, "OPTIONS"))).status, 204);
  assert.deepEqual(calls, []);
});

test("recovery only reports deleted after a persisted finalization receipt, without financial calls", async () => {
  const calls = [];
  const counts = await drainAccountDeletions({ rpc: async (name, args) => {
    calls.push(name);
    if (name === "claim_account_deletions") return [{ id: deletionId, user_id: userId, lease_token: lease }];
    assert.equal(args.p_success, true); return { status: "deleting" };
  }, removeAuthUser: async () => true });
  assert.deepEqual(counts, { processed: 1, deleted: 0, deferred: 1 });
  assert.deepEqual(calls, ["claim_account_deletions", "finish_account_deletion"]);
});

test("a self-deletion claim cannot silently route to another subject or deletion ID", async () => {
  for (const patch of [{ user_id: anotherId }, { id: anotherId }]) {
    await assert.rejects(drainAccountDeletions({ deletionId, expectedUserId: userId, rpc: async () => [{ id: deletionId, user_id: userId, lease_token: lease, ...patch }], removeAuthUser: async () => assert.fail("a mismatched claim must never remove Auth") }), /deletion_subject_mismatch/);
  }
});
