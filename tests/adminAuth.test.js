import test from "node:test";
import assert from "node:assert/strict";
import { accessRequestHref, createAuthorizationGate, createSingleFlight, googleSignInOptions, readAdminSession, readGuardedAdminSession, googleProfilePresentation, googleAvatarUrl, profileInitials } from "../src/lib/adminAuth.js";

function clientFor({ user = null, authError = null, listed = true, owner = false, rpcError = null, membership = true } = {}) {
  const calls = [];
  return {
    calls,
    auth: { async getUser() { calls.push("getUser"); return { data: { user }, error: authError }; } },
    async rpc(name) { calls.push(name); return { data: listed, error: rpcError }; },
    from(table) {
      calls.push(table);
      return { select(field) {
        calls.push(field);
        return { eq(key, value) {
          calls.push([key, value]);
          return { async maybeSingle() { return { data: membership ? { is_owner: owner } : null, error: null }; } };
        } };
      } };
    },
  };
}
const googleUser = { id: "verified-user", email: "Staff@Company.test", app_metadata: { provider: "google" }, user_metadata: { name: "Staff", role: "owner" } };

test("an unconfigured or signed-out client never reads the private allowlist", async () => {
  assert.equal((await readAdminSession(null)).phase, "not_configured");
  const client = clientFor({ authError: { name: "AuthSessionMissingError" } });
  assert.equal((await readAdminSession(client)).phase, "signed_out");
  assert.deepEqual(client.calls, ["getUser"]);
});

test("Google Workspace identity uses verified user plus live membership; editable metadata cannot grant owner", async () => {
  const client = clientFor({ user: googleUser });
  const result = await readAdminSession(client);
  assert.equal(result.phase, "authorized");
  assert.equal(result.user.role, "admin");
  assert.equal(result.user.email, "staff@company.test");
  assert.deepEqual(client.calls, ["getUser", "is_admin", "allowed_admins", "is_owner", ["email", "staff@company.test"]]);
  assert.equal((await readAdminSession(clientFor({ user: googleUser, owner: true }))).user.role, "owner");
});

test("the current Google profile supplies presentation while verified auth email and database role remain authoritative", async () => {
  const user = { ...googleUser,
    identities: [
      { provider: "email", identity_data: { full_name: "Wrong provider", picture: "https://lh3.googleusercontent.com/wrong" } },
      { provider: "google", identity_data: { full_name: "  Google   Name  ", picture: "https://lh3.googleusercontent.com/a/profile=s96-c", email: "different@example.com", role: "owner" } },
    ],
    user_metadata: { full_name: "Editable name", email: "attacker@example.com", avatar_url: "https://lh3.googleusercontent.com/old", role: "owner" },
  };
  const result = await readAdminSession(clientFor({ user }));
  assert.equal(result.user.displayName, "Google Name");
  assert.equal(result.user.avatarUrl, "https://lh3.googleusercontent.com/a/profile=s96-c");
  assert.equal(result.user.email, "staff@company.test");
  assert.equal(result.user.role, "admin");
  assert.equal((await readAdminSession(clientFor({ user, listed: false }))).phase, "denied");
});

test("legacy profile aliases and missing or malformed fields have harmless presentation fallbacks", () => {
  const profile = googleProfilePresentation({ user_metadata: { name: "Legacy Name", picture: "https://lh5.googleusercontent.com/photo.jpg" } }, "primary@example.com");
  assert.deepEqual(profile, { displayName: "Legacy Name", avatarUrl: "https://lh5.googleusercontent.com/photo.jpg" });
  assert.deepEqual(googleProfilePresentation({ identities: "invalid", user_metadata: { full_name: {}, name: [], avatar_url: {} } }, "primary@example.com"), { displayName: "primary@example.com", avatarUrl: null });
  assert.deepEqual(googleProfilePresentation(null, "primary@example.com"), { displayName: "primary@example.com", avatarUrl: null });
  const fallback = googleProfilePresentation({ identities: [{ provider: "google", identity_data: { full_name: 123, name: "Valid name", avatar_url: "javascript:alert(1)" } }], user_metadata: { avatar_url: "https://lh3.googleusercontent.com/photo" } }, "primary@example.com");
  assert.equal(fallback.displayName, "Valid name");
  assert.equal(fallback.avatarUrl, "https://lh3.googleusercontent.com/photo");
});

test("profile image URLs allow only HTTPS Google photo hosts and reject arbitrary requests", () => {
  assert.equal(googleAvatarUrl(" https://lh3.googleusercontent.com/a/photo=s96-c "), "https://lh3.googleusercontent.com/a/photo=s96-c");
  for (const value of [null, {}, "", "http://lh3.googleusercontent.com/photo", "https://tracker.example.com/photo", "https://googleusercontent.com.evil.test/photo", "https://evilgoogleusercontent.com/photo", "https://lh3.googleusercontent.com@evil.test/photo", "https://user:secret@lh3.googleusercontent.com/photo", "https://lh3.googleusercontent.com:444/photo", "javascript:alert(1)", "data:image/svg+xml,bad", "//lh3.googleusercontent.com/photo", "https://lh3.googleusercontent.com/photo\n", "https://lh3.googleusercontent.com/" + "a".repeat(2048)]) {
    assert.equal(googleAvatarUrl(value), null, String(value));
  }
});

test("initials and malformed profile values cannot break rendering or promote access", async () => {
  assert.equal(profileInitials("  Ankit   Kumar Singh "), "AK");
  assert.equal(profileInitials("नाम सिंह"), "नस");
  assert.equal(profileInitials(null), "?");
  assert.equal(profileInitials({ full_name: "unsafe object" }), "?");
  const forged = { ...googleUser, app_metadata: { provider: "email" }, identities: [{ provider: "google", identity_data: { name: "Owner", role: "owner", is_admin: true } }] };
  const client = clientFor({ user: forged, listed: true, owner: true });
  const result = await readAdminSession(client);
  assert.equal(result.phase, "denied");
  assert.equal(result.user.role, null);
  assert.deepEqual(client.calls, ["getUser"]);
});

test("Google sign-in alone does not grant private access or read membership", async () => {
  const client = clientFor({ user: googleUser, listed: false });
  const result = await readAdminSession(client);
  assert.equal(result.phase, "denied");
  assert.equal(result.user.role, null);
  assert.deepEqual(client.calls, ["getUser", "is_admin"]);
});

test("missing current membership denies a previously approved identity", async () => {
  assert.equal((await readAdminSession(clientFor({ user: googleUser, membership: false }))).phase, "denied");
});

test("browser role choices and user metadata cannot bypass Google identity checks", async () => {
  for (const user of [
    { ...googleUser, app_metadata: { provider: "email" }, user_metadata: { provider: "google", is_admin: true } },
    { ...googleUser, id: "" },
    { ...googleUser, email: "" },
  ]) {
    const client = clientFor({ user });
    assert.equal((await readAdminSession(client)).phase, "denied");
    assert.deepEqual(client.calls, ["getUser"]);
  }
});

test("transient failures are surfaced rather than presented as authorization success", async () => {
  const failure = new Error("Connection unavailable");
  await assert.rejects(readAdminSession(clientFor({ authError: failure })), failure);
  await assert.rejects(readAdminSession(clientFor({ user: googleUser, rpcError: failure })), failure);
});

test("Google flow uses existing Supabase provider with a fixed same-origin admin callback", () => {
  assert.deepEqual(googleSignInOptions("https://uat.letsaimit.com"), { provider: "google", options: { redirectTo: "https://uat.letsaimit.com/admin/", queryParams: { prompt: "select_account" } } });
  assert.equal(googleSignInOptions("http://127.0.0.1:4178").options.redirectTo, "http://127.0.0.1:4178/admin/");
  for (const invalid of ["https://uat.letsaimit.com/path", "http://example.com", "javascript:alert(1)", "ftp://localhost"]) assert.throws(() => googleSignInOptions(invalid));
});

test("sign-out blocks queued checks and late authorization until an explicit next sign-in", async () => {
  const gate = createAuthorizationGate();
  const client = clientFor({ user: googleUser });
  let finishVerification;
  client.auth.getUser = () => new Promise(resolve => { finishVerification = resolve; });
  const pending = readGuardedAdminSession(client, gate);
  gate.block(); // A deferred SDK signOut may still have the previous session.
  assert.equal(await readGuardedAdminSession(client, gate), null);
  finishVerification({ data: { user: googleUser }, error: null });
  assert.equal(await pending, null);
  assert.equal(await readGuardedAdminSession(clientFor({ user: googleUser }), gate), null);
  gate.allowSignIn();
  assert.equal((await readGuardedAdminSession(clientFor({ user: googleUser }), gate)).phase, "authorized");
});

test("a check from an older auth generation cannot restore access after signing in again", async () => {
  const gate = createAuthorizationGate();
  const client = clientFor({ user: googleUser });
  let finishVerification;
  client.auth.getUser = () => new Promise(resolve => { finishVerification = resolve; });
  const pending = readGuardedAdminSession(client, gate);
  gate.block();
  gate.allowSignIn();
  finishVerification({ data: { user: googleUser }, error: null });
  assert.equal(await pending, null);
});

test("overlapping slow membership checks share the actual revoked result instead of stale authorization", async () => {
  const gate = createAuthorizationGate();
  const coalesce = createSingleFlight();
  const client = clientFor({ user: googleUser });
  let finishAccess;
  let rpcCalls = 0;
  client.rpc = async () => { ++rpcCalls; return new Promise(resolve => { finishAccess = resolve; }); };
  const verify = () => coalesce(gate.ticket(), () => readGuardedAdminSession(client, gate));
  const first = verify();
  await new Promise(resolve => setImmediate(resolve));
  const intervalTick = verify();
  const consumerCheck = verify();
  assert.equal(first, intervalTick);
  assert.equal(first, consumerCheck);
  assert.equal(rpcCalls, 1);
  finishAccess({ data: false, error: null });
  assert.deepEqual((await Promise.all([first, intervalTick, consumerCheck])).map(result => result.phase), ["denied", "denied", "denied"]);
  assert.equal(client.calls.filter(call => call === "getUser").length, 1);
  client.rpc = async () => ({ data: true, error: null });
  assert.equal((await verify()).phase, "authorized");
});

test("request access opens an encoded email draft and does not grant membership", () => {
  const url = new URL(accessRequestHref("staff+test@company.test"));
  assert.equal(url.protocol, "mailto:");
  assert.equal(url.pathname, "dhirajkmishra184@gmail.com");
  assert.match(url.searchParams.get("body"), /staff\+test@company\.test/);
  assert.match(url.searchParams.get("subject"), /admin access request/);
});
