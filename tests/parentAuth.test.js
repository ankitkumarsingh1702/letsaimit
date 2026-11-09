import test from "node:test";
import assert from "node:assert/strict";
import { readGoogleUser, readAdminSession, verifiedGoogleUserAfterAdminError, identityAfterAccessFailure } from "../src/lib/adminAuth.js";
import { fetchMyRegistrations, parentRequestRow } from "../src/features/parent/parentRequests.js";
import { createRegistrationDraft, storeRegistrationDraft, consumeRegistrationDraft, clearRegistrationDrafts, shouldClearBoundRegistration, canConfirmRegistrationReceipt } from "../src/features/registration/registrationDraft.js";
import { storeAuthReturnTarget, consumeAuthReturnTarget, clearAuthReturnTarget } from "../src/lib/authReturn.js";

const google = { id: "parent-user-a", email: "parent@example.com", app_metadata: { provider: "google" }, user_metadata: { full_name: "Parent" } };
const verified = { id: google.id, email: google.email, isGoogle: true };
const record = { id: "request-a", submission_id: "submission-a", created: "2026-11-10T08:00:00Z", review_decision: "accepted", reviewed_at: "2026-11-10T09:00:00Z", metadata: { formType: "enrol", childName: "Child", age: "9", community: "Community", sport: "Basketball", adminNotes: "private" }, email: "hidden@example.com", notes: "private", assignee: "private" };
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };

test("a verified Google parent is eligible without an admin RPC or allowlist membership", async () => {
  let privateReads = 0;
  const client = { auth: { getUser: async () => ({ data: { user: google } }) }, rpc: async () => { ++privateReads; return { data: false }; } };
  const user = await readGoogleUser(client);
  assert.equal(user.isGoogle, true); assert.equal(privateReads, 0);
  const admin = await readAdminSession(client);
  assert.equal(admin.phase, "denied"); assert.equal(admin.user.isGoogle, true); assert.equal(admin.user.role, null);
});

test("admin membership outage does not erase a separately verified parent identity", async () => {
  const cause = new Error("Admin RPC unavailable");
  const client = { auth: { getUser: async () => ({ data: { user: google } }) }, rpc: async () => ({ error: cause }) };
  await assert.rejects(readAdminSession(client), cause);
  assert.equal(verifiedGoogleUserAfterAdminError(cause).isGoogle, true);
  assert.equal(verifiedGoogleUserAfterAdminError(cause).id, google.id);
  assert.equal(verifiedGoogleUserAfterAdminError({ verifiedUser: { ...verified, role: "owner" } }), null);
  assert.equal((await readGoogleUser(client)).id, google.id);
});

test("editable metadata, linked identity aliases and a non-Google user cannot grant parent capability", async () => {
  for (const identity of [
    { ...google, app_metadata: { provider: "email" }, user_metadata: { provider: "google", isGoogle: true } },
    { ...google, app_metadata: { provider: "email" }, identities: [{ provider: "google" }] },
    { ...google, id: "" }, { ...google, email: "" },
  ]) assert.equal(await readGoogleUser({ auth: { getUser: async () => ({ data: { user: identity } }) } }), null);
});

test("confirmed identity failure clears parent access while a verified admin-only failure keeps parent capability", async () => {
  const identityFailure = Object.assign(new Error("Expired identity"), { status: 401 });
  await assert.rejects(readAdminSession({ auth: { getUser: async () => ({ error: identityFailure }) } }), identityFailure);
  assert.equal(identityAfterAccessFailure(identityFailure, verified), null);
  for (const error of [{ status: 403 }, { code: "PGRST301" }, { code: "42501" }]) assert.equal(identityAfterAccessFailure(error, verified), null);
  const adminFailure = Object.assign(new Error("Admin-only permission failure"), { status: 403 });
  await assert.rejects(readAdminSession({ auth: { getUser: async () => ({ data: { user: google } }) }, rpc: async () => ({ error: adminFailure }) }), adminFailure);
  assert.equal(identityAfterAccessFailure(adminFailure, null).id, google.id);
  assert.equal(identityAfterAccessFailure(new Error("Network unavailable"), verified), verified);
});

test("own request list uses only its ownership RPC and drops any private fields from the response", async () => {
  const calls = [];
  const client = { rpc: async name => { calls.push(name); return { data: [record] }; }, from() { throw new Error("Private table read forbidden"); } };
  const rows = await fetchMyRegistrations({ client, verifyGoogleUser: async () => verified, userId: verified.id });
  assert.deepEqual(calls, ["list_my_registrations"]);
  assert.equal(rows[0].reviewDecision, "accepted"); assert.equal(rows[0].childName, "Child");
  assert.equal(rows[0].email, undefined); assert.equal(rows[0].notes, undefined); assert.equal(rows[0].adminNotes, undefined); assert.equal(rows[0].assignee, undefined);
  assert.throws(() => parentRequestRow({ ...record, review_decision: "paid" }), /could not be confirmed/);
});

test("account changes before or after a request-list read cannot expose another account's results", async () => {
  let calls = 0;
  const client = { rpc: async () => { ++calls; return { data: [record] }; } };
  await assert.rejects(fetchMyRegistrations({ client, userId: verified.id, verifyGoogleUser: async () => ({ ...verified, id: "different" }) }), /Sign in/);
  assert.equal(calls, 0);
  const identities = [verified, { ...verified, id: "different" }];
  await assert.rejects(fetchMyRegistrations({ client, userId: verified.id, verifyGoogleUser: async () => identities.shift() }), /account changed/);
  assert.equal(calls, 1);
});

test("an RPC failure is unavailable data, not a measured empty parent register", async () => {
  await assert.rejects(fetchMyRegistrations({ client: { rpc: async () => ({ error: new Error("private server details") }) }, verifyGoogleUser: async () => verified, userId: verified.id }), error => /could not load/.test(error.message) && !error.message.includes("private server"));
});

test("OAuth draft keeps only bounded answers in this tab and resets consent and terms on resume", () => {
  const tab = storage();
  const values = { ...createRegistrationDraft(), parentName: "Parent", email: "parent@example.com", phone: "98765 43210", childName: "Child", consent: true, terms: true, accessToken: "do not save", submissionId: "do not save" };
  assert.equal(storeRegistrationDraft("enroll", values, tab, 1000), true);
  const restored = consumeRegistrationDraft("enrol", tab, 2000);
  assert.equal(restored.parentName, "Parent"); assert.equal(restored.childName, "Child");
  assert.equal(restored.consent, false); assert.equal(restored.terms, false);
  assert.equal(restored.accessToken, undefined); assert.equal(restored.submissionId, undefined);
  assert.equal(consumeRegistrationDraft("enrol", tab, 2001), null);
});

test("drafts expire at thirty minutes and reject oversized or malformed stored answers", () => {
  const tab = storage(); const values = createRegistrationDraft();
  storeRegistrationDraft("trial", values, tab, 1000);
  assert.equal(consumeRegistrationDraft("trial", tab, 1000 + 30 * 60 * 1000), null);
  assert.equal(storeRegistrationDraft("trial", { ...values, parentName: "x".repeat(81) }, tab, 1000), false);
  assert.equal(storeRegistrationDraft("trial", { ...values, phoneCountry: "XX" }, tab, 1000), false);
  assert.equal(storeRegistrationDraft("coach", values, tab, 1000), false);
});

test("a receipt cannot show saved after an account change, sign-out, an edited form generation or closing the form", () => {
  const receipt = { submittedUserId: verified.id, verifiedUser: verified, generation: 3, currentGeneration: 3, active: true };
  assert.equal(canConfirmRegistrationReceipt(receipt), true);
  for (const change of [{ verifiedUser: null }, { verifiedUser: { ...verified, id: "different-user" } }, { verifiedUser: { ...verified, isGoogle: false } }, { currentGeneration: 4 }, { active: false }]) {
    assert.equal(canConfirmRegistrationReceipt({ ...receipt, ...change }), false);
  }
});

test("bound account sign-out/switch clears stored answers and return intent while first anonymous Google handoff survives", () => {
  assert.equal(shouldClearBoundRegistration(null, "first-google-user"), false);
  assert.equal(shouldClearBoundRegistration("account-a", "account-a"), false);
  assert.equal(shouldClearBoundRegistration("account-a", null), true);
  assert.equal(shouldClearBoundRegistration("account-a", "account-b"), true);
  const tab = storage();
  const draft = { ...createRegistrationDraft(), parentName: "Private parent", childName: "Private child", address: "Private address" };
  storeRegistrationDraft("trial", draft, tab, 1000); storeRegistrationDraft("enrol", draft, tab, 1000);
  storeAuthReturnTarget("/parent/?resume=enrol", tab, 1000);
  clearRegistrationDrafts(tab); clearAuthReturnTarget(tab);
  assert.equal(consumeRegistrationDraft("trial", tab, 1001), null);
  assert.equal(consumeRegistrationDraft("enrol", tab, 1001), null);
  assert.equal(consumeAuthReturnTarget(tab, 1001), null);
  storeRegistrationDraft("trial", draft, tab, 2000); storeAuthReturnTarget("/parent/?resume=trial", tab, 2000);
  // Anonymous -> first verified Google identity is not a bound-account transition.
  if (shouldClearBoundRegistration(null, "first-google-user")) { clearRegistrationDrafts(tab); clearAuthReturnTarget(tab); }
  assert.equal(consumeRegistrationDraft("trial", tab, 2001).parentName, "Private parent");
  assert.equal(consumeAuthReturnTarget(tab, 2001), "/parent/?resume=trial");
});

test("missing backend configuration rejects Google sign-in instead of silently locking the form", async () => {
  const [{ createServer }, React, { renderToStaticMarkup }] = await Promise.all([import("vite"), import("react"), import("react-dom/server")]);
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { AdminAuthProvider, useAdminAuth } = await vite.ssrLoadModule("/src/context/AdminAuth.jsx");
    let auth;
    function Capture() { auth = useAdminAuth(); return null; }
    renderToStaticMarkup(React.createElement(AdminAuthProvider, null, React.createElement(Capture)));
    await assert.rejects(auth.signIn("/parent/?resume=trial"), /Google sign-in is not configured/);
  } finally { await vite.close(); }
});
