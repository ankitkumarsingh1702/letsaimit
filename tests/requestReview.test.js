import test from "node:test";
import assert from "node:assert/strict";
import { readReviewIntent, reviewArguments } from "../src/features/admin/review-contract.js";
import { saveRequestReview } from "../src/features/admin/adminTransport.js";
import { toAdminRequest, filterRows, buildRegisterCsv } from "../src/features/admin/admin-model.js";

const id = "0d2560a9-0049-45e1-8ea0-4a6e016b374c";
const accepted = { id, revision: 3, review_decision: "accepted", reviewed_at: "2026-11-10T10:00:00Z", reviewed_by: "reviewer@example.test", status: "new", metadata: {} };

test("the authorized dashboard renders without an email intent or selected request", async () => {
  const [{ createServer }, React, { renderToStaticMarkup }] = await Promise.all([import("vite"), import("react"), import("react-dom/server")]);
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { AuthorizedAdmin } = await vite.ssrLoadModule("/src/features/admin/AdminPage.jsx");
    const auth = { client: null, user: { id: "authorized-admin", email: "admin@example.test", displayName: "Test admin" }, checkAccess: async () => true, signOut: async () => {} };
    const html = renderToStaticMarkup(React.createElement(AuthorizedAdmin, { auth }));
    assert.match(html, /Dashboard/);
    assert.match(html, /Loading saved requests/);
    assert.doesNotMatch(html, /Confirm acceptance|Confirm decline/);
  } finally { await vite.close(); }
});

test("email GET parameters are only validated navigation intent, never review RPC calls", () => {
  assert.deepEqual(readReviewIntent(`?requestId=${id}&requestedDecision=accept`), { id, decision: "accepted" });
  assert.deepEqual(readReviewIntent(`?requestId=${id}&requestedDecision=decline`), { id, decision: "declined" });
  assert.deepEqual(readReviewIntent(`?requestId=${id}&requestedDecision=delete`), { id, decision: null });
  assert.equal(readReviewIntent("?requestId=javascript:bad&requestedDecision=accept"), null);
  assert.equal(readReviewIntent(`?requestId=${id}&requestId=${id}`), null);
  assert.deepEqual(readReviewIntent(`?requestId=${id}&requestedDecision=accept&requestedDecision=decline`), { id, decision: null });
});

test("review arguments allow only an explicit terminal decision and saved positive revision", () => {
  assert.deepEqual(reviewArguments(id, "accepted", 2), { p_id: id, p_decision: "accepted", p_expected_revision: 2, p_monthly_amount_paise: null });
  for (const args of [[id, "pending", 2], [id, "accepted", 0], [id, "accepted", 1.1], ["not-an-id", "accepted", 2]]) assert.throws(() => reviewArguments(...args));
});

test("a review requires a saved matching server decision and audit timestamp", async () => {
  let calls = 0;
  const client = { rpc: async (name, args) => { ++calls; assert.equal(name, "review_registration"); assert.equal(args.p_expected_revision, 2); return { data: accepted, error: null }; } };
  const result = await saveRequestReview(client, id, "accepted", 2);
  assert.equal(calls, 1); assert.equal(result.ok, true); assert.equal(result.row.reviewDecision, "accepted");
  assert.equal(result.row.status, "new", "review must not silently change follow-up or payment state");
  for (const record of [{ ...accepted, id: "wrong" }, { ...accepted, review_decision: "declined" }, { ...accepted, reviewed_at: null }, { ...accepted, revision: 1 }]) {
    await assert.rejects(saveRequestReview({ rpc: async () => ({ data: record, error: null }) }, id, "accepted", 2), /could not be confirmed/);
  }
});

test("conflicting review reads the latest saved row for explicit review instead of overwriting", async () => {
  const latest = { ...accepted, review_decision: "declined", revision: 4 };
  const client = { rpc: async () => ({ error: { code: "PT409" } }), from: table => {
    assert.equal(table, "registrations"); return { select: () => ({ eq: (key, value) => {
      assert.equal(key, "id"); assert.equal(value, id); return { maybeSingle: async () => ({ data: latest, error: null }) };
    } }) };
  } };
  const result = await saveRequestReview(client, id, "accepted", 2);
  assert.equal(result.ok, false); assert.equal(result.code, "conflict"); assert.equal(result.latest.reviewDecision, "declined");
});

test("revoked access cannot be represented as a successful review", async () => {
  await assert.rejects(saveRequestReview({ rpc: async () => ({ error: { code: "42501" } }) }, id, "accepted", 2), { code: "42501" });
});

test("review values extend saved CSV and filters without changing old follow-up meanings", () => {
  const rows = [toAdminRequest(accepted), toAdminRequest({ id: "old", revision: 1, metadata: {}, status: "confirmed" })];
  assert.equal(rows[1].reviewDecision, "pending");
  assert.equal(filterRows(rows, { reviewDecision: "accepted" }).length, 1);
  const csv = buildRegisterCsv(rows, { reviewDecision: "accepted" });
  assert.equal(csv.rowCount, 1); assert.match(csv.text, /review_decision/); assert.match(csv.text, /accepted/);
});
