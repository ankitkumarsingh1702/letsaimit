import test from "node:test";
import assert from "node:assert/strict";
import { toAdminRequest, followUpPatch, filterRows, paginateRows, deriveSummary, periodForPreset, defaultFilters, buildRegisterCsv, formatAge } from "../src/features/admin/admin-model.js";
import { fetchSavedRequests, saveRequestFollowUp, mergeSavedRequests, SAFE_COLUMNS } from "../src/features/admin/adminTransport.js";

function record(id = "row-1", revision = 1) {
  return { id, submission_id: `submission-${id}`, full_name: "Parent, नाम", email: "parent@example.com", phone: "+919876543210", metadata: {
    formType: "enrol", childName: "Child", note: "Parent note", address: "Home", age: "9", sport: "Basketball", community: "Nambiar Ellegenza", phoneCountry: "IN", guardianConsent: true, termsAccepted: true, consentVersion: "2026-11-09", termsVersion: "2026-11-05",
  }, status: "new", notes: "Team note", assignee: "approved@example.com", created: "2026-11-09T01:00:00Z", updated: "2026-11-09T01:00:00Z", updated_by: "approved@example.com", revision };
}

test("age guidance reads naturally for the trial exception and never invents an age", () => {
  assert.equal(formatAge("other"), "Under 5 or over 14");
  assert.equal(formatAge("9"), "9 years");
  assert.equal(formatAge(undefined), "Not provided");
});

function fakeClient(responses) {
  const calls = [];
  const client = { from(table) {
    const call = { table }; calls.push(call);
    const builder = {};
    for (const method of ["select", "update", "eq", "order", "range", "maybeSingle"]) {
      builder[method] = (...args) => { (call[method] ||= []).push(args); return builder; };
    }
    builder.then = (resolve, reject) => Promise.resolve(responses.shift()).then(resolve, reject);
    return builder;
  } };
  return { client, calls };
}

test("live model maps canonical saved data and consent without trusting metadata identity or permissions", () => {
  const source = record();
  source.metadata.id = "spoof"; source.metadata.parentName = "spoof"; source.metadata.permissions = { readRegister: true };
  const row = toAdminRequest(source);
  assert.equal(row.id, "row-1");
  assert.equal(row.parentName, source.full_name);
  assert.equal(row.adminNotes, source.notes);
  assert.equal(row.parentNote, "Parent note");
  assert.equal(row.submittedAt, source.created);
  assert.equal(row.updatedAt, source.updated);
  assert.equal(row.consent.consentVersion, "2026-11-09");
  assert.equal(row.permissions, undefined);
  assert.equal(row.links.whatsapp, "https://wa.me/919876543210");
  assert.equal(toAdminRequest({ ...source, phone: "javascript:bad", email: "bad?body=private@example.com" }).links.email, null);
});

test("IST windows are runtime-based and use a half-open next-midnight boundary", () => {
  const period = periodForPreset("today", "2026-12-01T19:00:00Z");
  assert.deepEqual(period, { dateField: "created", startInclusiveUtc: "2026-12-01T18:30:00.000Z", endExclusiveUtc: "2026-12-02T18:30:00.000Z" });
  const rows = [
    { id: "before", submittedAt: "2026-12-01T18:29:59Z" },
    { id: "start", submittedAt: period.startInclusiveUtc },
    { id: "inside", submittedAt: "2026-12-02T18:29:59Z" },
    { id: "end", submittedAt: period.endExclusiveUtc },
  ];
  assert.deepEqual(filterRows(rows, { period }).map(row => row.id).sort(), ["inside", "start"]);
  assert.equal(periodForPreset("last7", "2026-12-02T00:00:00Z").startInclusiveUtc, "2026-11-25T18:30:00.000Z");
  assert.equal(defaultFilters().period.startInclusiveUtc, null);
});

test("summaries count the supplied saved population and keep engagement explicitly untracked", () => {
  const rows = [toAdminRequest(record("trial")), toAdminRequest(record("enrol"))];
  rows[0].formType = "trial"; rows[1].status = "confirmed";
  const summary = deriveSummary(rows);
  assert.equal(summary.savedRequests.value, 2);
  assert.equal(summary.trialRequests.value, 1);
  assert.equal(summary.confirmedEnrolmentRequests.value, 1);
  assert.equal(summary.websiteEngagement.averageActiveSessionSeconds.value, null);
  assert.equal(summary.websiteEngagement.averageActiveSessionSeconds.availability, "not_tracked");
  assert.equal(deriveSummary([]).savedRequests.value, 0);
});

test("search, structured filters and pagination preserve the same matching saved set", () => {
  const rows = Array.from({ length: 26 }, (_, i) => ({ ...toAdminRequest(record(`row-${i}`)), assignee: i === 0 ? "" : "team", status: i % 2 ? "contacted" : "new" }));
  const filtered = filterRows(rows, { query: "Parent नाम", status: "new" });
  assert.equal(filtered.length, 13);
  assert.equal(filterRows(rows, { query: "98765 43210" }).length, 26);
  assert.equal(filterRows(rows, { onlyUnassigned: true }).length, 1);
  assert.equal(paginateRows(filtered, 2, 10).rows.length, 3);
  assert.equal(paginateRows(filtered, 99, 10).page, 2);
});

test("CSV exports all filtered saved pages, escapes Unicode and formulas, and uses the runtime date", () => {
  const rows = Array.from({ length: 26 }, (_, i) => ({ ...toAdminRequest(record(`row-${i}`)), parentName: i === 0 ? '=HYPERLINK("bad")' : "Parent, नाम", adminNotes: 'line1\r\n"line2"' }));
  const csv = buildRegisterCsv(rows, { status: "new", page: 2, pageSize: 10 }, { referenceIso: "2026-12-01T19:00:00Z" });
  assert.equal(csv.rowCount, 26);
  assert.equal(csv.filename, "letsaimit-register-2026-12-02.csv");
  assert.match(csv.text, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv.text, /"Parent, नाम"/);
  assert.match(csv.text, /"line1\r\n""line2"""/);
  assert.match(csv.text, /"'\+919876543210"/);
  assert.ok(csv.text.startsWith("\uFEFF"));
  assert.equal(buildRegisterCsv(rows, { status: "closed" }).rowCount, 0);
});

test("only three follow-up fields map to a database patch; immutable input is rejected", () => {
  assert.deepEqual(followUpPatch({ status: "contacted", assignee: " team ", adminNotes: "note" }), { status: "contacted", assignee: "team", notes: "note" });
  assert.throws(() => followUpPatch({ status: "new", assignee: "", adminNotes: "", parentName: "overwrite" }), /Only follow-up/);
  assert.throws(() => followUpPatch({ status: "fake", assignee: "", adminNotes: "" }), /status/);
  assert.throws(() => followUpPatch({ status: "new", assignee: "", adminNotes: "x".repeat(2001) }), /notes/);
});

test("register transport loads every page and deduplicates overlapping page records", async () => {
  const first = Array.from({ length: 500 }, (_, i) => record(`row-${i}`));
  const { client, calls } = fakeClient([{ data: first }, { data: [first[499], record("last")] }]);
  const rows = await fetchSavedRequests(client);
  assert.equal(rows.length, 501);
  assert.deepEqual(calls.map(call => call.range[0]), [[0, 499], [500, 999]]);
  assert.equal(calls[0].select[0][0], SAFE_COLUMNS);
  assert.equal(calls[0].select[0][0].includes("fingerprint"), false);
});

test("save uses id and expected revision and acknowledges only an actual returned newer row", async () => {
  const { client, calls } = fakeClient([{ data: [record("row-1", 2)] }]);
  const patch = { status: "contacted", assignee: "team", adminNotes: "saved" };
  const result = await saveRequestFollowUp(client, "row-1", patch, 1);
  assert.equal(result.ok, true); assert.equal(result.row.revision, 2);
  assert.deepEqual(calls[0].eq, [["id", "row-1"], ["revision", 1]]);
  assert.deepEqual(calls[0].update[0][0], { status: "contacted", assignee: "team", notes: "saved" });
  assert.equal(calls[0].update[0][0].updated_by, undefined);
});

test("stale same-row edit returns latest saved row for review and never retries an overwrite", async () => {
  const { client, calls } = fakeClient([{ data: [] }, { data: record("row-1", 3) }]);
  const result = await saveRequestFollowUp(client, "row-1", { status: "closed", assignee: "", adminNotes: "my draft" }, 1);
  assert.equal(result.ok, false); assert.equal(result.code, "conflict"); assert.equal(result.latest.revision, 3);
  assert.equal(calls.filter(call => call.update).length, 1);
});

test("deleted row, unavailable server and invalid save acknowledgement never report success", async () => {
  const patch = { status: "new", assignee: "", adminNotes: "draft" };
  const missing = fakeClient([{ data: [] }, { data: null }]);
  assert.equal((await saveRequestFollowUp(missing.client, "row-1", patch, 1)).code, "not_found");
  const failed = fakeClient([{ error: new Error("offline") }]);
  await assert.rejects(saveRequestFollowUp(failed.client, "row-1", patch, 1), /offline/);
  const invalid = fakeClient([{ data: [record("wrong-id", 2)] }]);
  await assert.rejects(saveRequestFollowUp(invalid.client, "row-1", patch, 1), /could not be confirmed/);
  const readFailed = fakeClient([{ error: new Error("offline") }]);
  await assert.rejects(fetchSavedRequests(readFailed.client), /offline/);
});

test("a late refresh cannot roll a saved edit back, while server-deleted rows leave the register", () => {
  const saved = { id: "row", revision: 3, adminNotes: "new" };
  assert.deepEqual(mergeSavedRequests([saved, { id: "deleted", revision: 1 }], [{ id: "row", revision: 2, adminNotes: "old" }]), [saved]);
});
