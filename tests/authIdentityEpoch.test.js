import test from "node:test";
import assert from "node:assert/strict";
import { createAuthIdentityEpoch, createAuthorizationGate, createSingleFlight, readGuardedAdminSession, readGuardedGoogleUser } from "../src/lib/adminAuth.js";
import { fetchMyRegistrations } from "../src/features/parent/parentRequests.js";

const google = { id: "parent-a", email: "parent@example.test", app_metadata: { provider: "google" } };
const session = user => ({ user });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test("same-account auth refreshes during both ownership checks retain the saved parent request", async () => {
  const gate = createAuthorizationGate();
  const epoch = createAuthIdentityEpoch();
  epoch.observe(session(google));
  const events = ["TOKEN_REFRESHED", "SIGNED_IN"];
  const observed = [];
  let userReads = 0;
  const client = {
    auth: { getUser: async () => {
      ++userReads;
      // The production listener observes the subject on every SDK event.
      observed.push(events.shift());
      epoch.observe(session(google));
      return { data: { user: google } };
    } },
    rpc: async name => {
      assert.equal(name, "list_my_registrations");
      return { data: [{ id: "saved-request", submission_id: "submission", created: "2026-11-10T09:06:02Z", review_decision: "pending", metadata: { formType: "enrol", childName: "Child", age: "9", sport: "Basketball", community: "Community" } }] };
    },
  };
  const rows = await fetchMyRegistrations({ client, userId: google.id, verifyGoogleUser: () => readGuardedGoogleUser(client, gate, epoch) });
  assert.equal(rows[0].id, "saved-request");
  assert.equal(rows[0].reviewDecision, "pending");
  assert.equal(userReads, 2, "both sides still verify with Supabase getUser");
  assert.deepEqual(observed, ["TOKEN_REFRESHED", "SIGNED_IN"]);
});

test("account switch and switch-back both discard an in-flight remotely verified identity", async () => {
  for (const switchBack of [false, true]) {
    const gate = createAuthorizationGate();
    const epoch = createAuthIdentityEpoch();
    epoch.observe(session(google));
    const response = deferred();
    const pending = readGuardedGoogleUser({ auth: { getUser: () => response.promise } }, gate, epoch);
    epoch.observe(session({ ...google, id: "parent-b" }));
    if (switchBack) epoch.observe(session(google));
    response.resolve({ data: { user: google } });
    assert.equal(await pending, null, switchBack ? "A → B → A cannot revive A's old read" : "A → B rejects A's old read");
  }
});

test("signed-out, missing-subject and explicit sign-in boundaries reject old replies", async () => {
  for (const boundary of [epoch => epoch.observe(null), epoch => epoch.observe({ user: {} }), epoch => epoch.invalidate()]) {
    const gate = createAuthorizationGate();
    const epoch = createAuthIdentityEpoch();
    epoch.observe(session(google));
    const response = deferred();
    const client = { auth: { getUser: () => response.promise } };
    const pending = readGuardedGoogleUser(client, gate, epoch);
    boundary(epoch);
    response.resolve({ data: { user: google } });
    assert.equal(await pending, null);
    epoch.observe(session(google));
    assert.equal((await readGuardedGoogleUser(client, gate, epoch)).id, google.id, "a fresh verified read can recover");
  }
});

test("local sign-out stays blocked even if a same-user refresh or a late read arrives", async () => {
  const gate = createAuthorizationGate();
  const epoch = createAuthIdentityEpoch();
  epoch.observe(session(google));
  const response = deferred();
  let reads = 0;
  const client = { auth: { getUser: () => { ++reads; return response.promise; } } };
  const pending = readGuardedGoogleUser(client, gate, epoch);
  gate.block();
  epoch.invalidate();
  epoch.observe(session(google));
  response.resolve({ data: { user: google } });
  assert.equal(await pending, null);
  assert.equal(await readGuardedGoogleUser(client, gate, epoch), null);
  assert.equal(reads, 1);
  gate.allowSignIn();
  epoch.invalidate();
  epoch.observe(session(google));
  assert.equal((await readGuardedGoogleUser(client, gate, epoch)).id, google.id);
});

test("same-user refresh does not turn revoked database membership into admin authorization", async () => {
  const gate = createAuthorizationGate();
  const epoch = createAuthIdentityEpoch();
  const coalesce = createSingleFlight();
  epoch.observe(session(google));
  const requestEpoch = epoch.ticket();
  let membershipReads = 0;
  const client = {
    auth: { getUser: async () => {
      epoch.observe(session(google));
      return { data: { user: google } };
    } },
    rpc: async name => {
      assert.equal(name, "is_admin");
      ++membershipReads;
      return { data: false };
    },
    from: () => { throw new Error("A revoked admin must not read the allowlist"); },
  };
  const verify = () => coalesce(requestEpoch, () => readGuardedAdminSession(client, gate));
  const first = verify();
  const second = verify();
  const [result] = await Promise.all([first, second]);
  assert.equal(first, second);
  assert.equal(epoch.allows(requestEpoch), true);
  assert.equal(result.phase, "denied");
  assert.equal(result.user.id, google.id, "parent identity is separate from admin membership");
  assert.equal(result.user.role, null);
  assert.equal(membershipReads, 1);
});

test("identity errors and non-Google accounts are never converted to verified parent access", async () => {
  const gate = createAuthorizationGate();
  const epoch = createAuthIdentityEpoch();
  epoch.observe(session(google));
  const denial = Object.assign(new Error("Expired session"), { status: 401 });
  await assert.rejects(readGuardedGoogleUser({ auth: { getUser: async () => ({ error: denial }) } }, gate, epoch), denial);
  assert.equal(await readGuardedGoogleUser({ auth: { getUser: async () => ({ data: { user: { ...google, app_metadata: { provider: "email" } } } }) } }, gate, epoch), null);
});
