import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNT_DELETION_POLICY_VERSION, AccountDeletionError, accountDeletionErrorMessage, requestAccountDeletion } from "../src/features/account/accountDeletion.js";

const userId = "199e2509-611c-420e-87b0-8d3bdd0223e3";
const otherId = "6dc48f51-e34c-4d12-be9f-9292835872aa";
const confirmation = { expectedUserId: userId, confirmPermanent: true, acceptForfeit: true };
const receipt = (status = "deleted") => ({ ok: true, status, deletedUserId: userId });
const failure = code => cause => cause instanceof AccountDeletionError && cause.code === code;

test("account deletion requires the displayed identity and both explicit confirmations before any request", async () => {
  const client = { functions: { invoke: () => assert.fail("unconfirmed deletion must never reach the server") } };
  for (const patch of [{ expectedUserId: "" }, { expectedUserId: "not-a-uuid" }, { expectedUserId: undefined }]) {
    await assert.rejects(requestAccountDeletion(client, { ...confirmation, ...patch }), failure("identity_changed"));
  }
  for (const patch of [{ confirmPermanent: false }, { acceptForfeit: false }, { confirmPermanent: "true" }, { acceptForfeit: 1 }, { acceptForfeit: undefined }]) {
    await assert.rejects(requestAccountDeletion(client, { ...confirmation, ...patch }), failure("confirmation_required"));
  }
});

test("the installed Supabase client sends one authenticated, versioned deletion request and accepts 202 as pending", async () => {
  let calls = 0;
  const client = createClient("https://deletion-fixture.example.test", "public-fixture-key", {
    accessToken: async () => "fixture-access-token",
    global: { fetch: async (url, options) => {
      ++calls;
      assert.equal(String(url), "https://deletion-fixture.example.test/functions/v1/delete-account");
      assert.equal(options.method, "POST");
      assert.equal(new Headers(options.headers).get("authorization"), "Bearer fixture-access-token");
      assert.deepEqual(JSON.parse(options.body), { ...confirmation, policyVersion: "2026-11-11" });
      return new Response(JSON.stringify(receipt("deleting")), { status: 202, headers: { "Content-Type": "application/json" } });
    } },
  });
  assert.deepEqual(await requestAccountDeletion(client, confirmation), receipt("deleting"));
  assert.equal(calls, 1);
  assert.equal(ACCOUNT_DELETION_POLICY_VERSION, "2026-11-11");
});

test("success requires a complete matching receipt; a different account or partial DTO never confirms deletion", async () => {
  for (const data of [null, {}, { ok: true }, { ...receipt(), status: "accepted" }, { ...receipt(), deletedUserId: otherId }, { ...receipt(), ok: "true" }]) {
    await assert.rejects(requestAccountDeletion({ functions: { invoke: async () => ({ data }) } }, confirmation), failure("deletion_unavailable"));
  }
  for (const status of ["deleted", "deleting"]) {
    assert.deepEqual(await requestAccountDeletion({ functions: { invoke: async () => ({ data: { ...receipt(status), private: "not returned" } }) } }, confirmation), receipt(status));
  }
});

test("an authoritative owner conflict remains a safe refusal through real FunctionsHttpError handling", async () => {
  const response = new Response(JSON.stringify({ ok: false, code: "owner_protected", message: "private provider detail" }), { status: 409, headers: { "Content-Type": "application/json" } });
  const client = createClient("https://deletion-fixture.example.test", "public-fixture-key", {
    accessToken: async () => "fixture-access-token", global: { fetch: async () => response },
  });
  await assert.rejects(requestAccountDeletion(client, confirmation), cause => {
    assert.equal(cause.code, "owner_protected");
    assert.match(cause.message, /Transfer ownership/);
    assert.doesNotMatch(cause.message, /private provider detail/);
    return true;
  });
  assert.equal(response.bodyUsed, false, "error mapping reads a clone, leaving the response intact");
});

test("identity changes and permission errors are mapped without exposing server details", async () => {
  for (const code of ["identity_changed", "confirmation_required", "unauthorized", "deletion_unavailable"]) {
    await assert.rejects(requestAccountDeletion({ functions: { invoke: async () => ({ data: { ok: false, code, message: "private detail" } }) } }, confirmation), failure(code));
  }
  assert.equal(accountDeletionErrorMessage({ code: "provider_debug", message: "private detail" }), "Couldn’t confirm deletion. Try again.");
  assert.equal(accountDeletionErrorMessage(new Error("private detail")), "Couldn’t confirm deletion. Try again.");
});

test("a dropped or invalid server response never asserts that account deletion failed or completed", async () => {
  const clients = [null, { functions: { invoke: async () => { throw new Error("private network endpoint"); } } }, { functions: { invoke: async () => undefined } }, { functions: { invoke: async () => ({ error: { context: new Response("not JSON", { status: 503 }) } }) } }];
  for (const client of clients) await assert.rejects(requestAccountDeletion(client, confirmation), cause => {
    assert.equal(cause.code, "deletion_unavailable");
    assert.equal(cause.message, "Couldn’t confirm deletion. Try again.");
    return true;
  });
});

test("actual deletion components expose one unchecked irreversible confirmation and hide another identity", async () => {
  const [{ createServer }, React, { renderToStaticMarkup }] = await Promise.all([import("vite"), import("react"), import("react-dom/server")]);
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { default: DeleteAccountPanel, DeleteAccountConfirmation, AccountDeletionNotice } = await vite.ssrLoadModule("/src/features/account/DeleteAccountPanel.jsx");
    const auth = { phase: "denied", user: { id: userId, email: "parent@example.test", isGoogle: true }, deleteAccount: () => assert.fail("rendering must not delete") };
    const identity = { id: userId, email: auth.user.email };
    const panel = renderToStaticMarkup(React.createElement(DeleteAccountPanel, { auth }));
    assert.match(panel, /Account settings/); assert.match(panel, />Delete account</);
    assert.doesNotMatch(panel, /<dialog|type="checkbox"/);
    const confirm = renderToStaticMarkup(React.createElement(DeleteAccountConfirmation, { auth, identity, onClose: () => {} }));
    assert.match(confirm, /Delete LetsAimIt account\?/);
    assert.match(confirm, /parent@example.test/);
    assert.match(confirm, /Parent, Admin and Coach access/);
    assert.match(confirm, /paid fees are not refunded/);
    assert.match(confirm, /type="checkbox"[^>]*required=""/);
    assert.doesNotMatch(confirm, /checked=""/);
    assert.match(confirm, /type="submit"[^>]*disabled=""/);
    const switched = renderToStaticMarkup(React.createElement(DeleteAccountConfirmation, { auth: { ...auth, user: { ...auth.user, id: otherId } }, identity, onClose: () => {} }));
    assert.equal(switched, "");
    const deleted = renderToStaticMarkup(React.createElement(AccountDeletionNotice, { status: "deleted" }));
    const pending = renderToStaticMarkup(React.createElement(AccountDeletionNotice, { status: "deleting" }));
    assert.match(deleted, /Account deleted/); assert.match(deleted, /signed out/);
    assert.match(pending, /deletion is in progress/); assert.doesNotMatch(pending, /Account deleted/);
    assert.equal(renderToStaticMarkup(React.createElement(AccountDeletionNotice, { status: "failed" })), "");
  } finally { await vite.close(); }
});
