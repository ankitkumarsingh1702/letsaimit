import test from "node:test";
import assert from "node:assert/strict";
import { toAdminRequest, followUpPatch, filterRows, paginateRows, deriveSummary, periodForPreset, defaultFilters, buildRegisterCsv, formatAge, validateAdminInvite, toAdminMember } from "../src/features/admin/admin-model.js";
import { fetchSavedRequests, saveRequestFollowUp, mergeSavedRequests, SAFE_COLUMNS, MEMBER_COLUMNS, inviteAdminMembership, removeAdminMembership } from "../src/features/admin/adminTransport.js";
import { settleMembershipFailure, subscribeAdminRefreshEvents } from "../src/features/admin/useAdminRegister.js";

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
    for (const method of ["select", "update", "insert", "delete", "eq", "order", "range", "maybeSingle"]) {
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
  rows[0].formType = "trial"; rows[1].status = "confirmed"; rows[1].reviewDecision = "accepted";
  const summary = deriveSummary(rows);
  assert.equal(summary.savedRequests.value, 2);
  assert.equal(summary.trialRequests.value, 1);
  assert.equal(summary.approvedEnrolmentRequests.value, 1);
  assert.equal(summary.websiteEngagement.averageActiveSessionSeconds.value, null);
  assert.equal(summary.websiteEngagement.averageActiveSessionSeconds.availability, "not_tracked");
  assert.equal(deriveSummary([]).savedRequests.value, 0);
});

test("approved enrolments use the saved review decision, independently of follow-up status", () => {
  const rows = [
    { ...toAdminRequest(record("confirmed-pending")), status: "confirmed", reviewDecision: "pending" },
    { ...toAdminRequest(record("new-approved")), status: "new", reviewDecision: "accepted" },
    { ...toAdminRequest(record("closed-approved")), status: "closed", reviewDecision: "accepted" },
    { ...toAdminRequest(record("trial-approved")), formType: "trial", status: "confirmed", reviewDecision: "accepted" },
    { ...toAdminRequest(record("confirmed-declined")), status: "confirmed", reviewDecision: "declined" },
  ];
  const summary = deriveSummary(rows);
  assert.equal(summary.approvedEnrolmentRequests.value, 2);
  assert.equal(summary.byStatus.confirmed, 3, "follow-up counts retain the existing stored meaning");
  assert.deepEqual(filterRows(rows, { formType: "enrol", reviewDecision: "accepted" }).map(row => row.id).sort(), ["closed-approved", "new-approved"]);
  const csv = buildRegisterCsv(rows, { status: "confirmed", reviewDecision: "pending" });
  assert.equal(csv.rowCount, 1); assert.match(csv.text, /"status"/); assert.match(csv.text, /"confirmed"/); assert.match(csv.text, /"pending"/);
});

test("focus and registration saves invalidate the guarded refresh without trusting event row payloads", () => {
  const target = new EventTarget();
  const calls = [];
  const stop = subscribeAdminRefreshEvents((...args) => calls.push(args), target);
  target.dispatchEvent(new Event("focus"));
  const saved = new Event("letsaimit:registration-saved");
  Object.defineProperty(saved, "detail", { value: { rows: [{ id: "untrusted-row" }], userId: "different-parent" } });
  target.dispatchEvent(saved);
  assert.deepEqual(calls, [[], []], "events request a fresh authorized read; no payload is merged into private data");
  stop();
  target.dispatchEvent(new Event("focus")); target.dispatchEvent(saved);
  assert.equal(calls.length, 2, "listeners are removed when the authorized register unmounts");
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

test("Gmail invitations normalize identity and reject malformed, company, control and duplicate input", () => {
  assert.deepEqual(validateAdminInvite("  New.Admin+trial@GMAIL.COM  "), { ok: true, email: "new.admin+trial@gmail.com" });
  for (const value of ["", "ankit@hushh.ai", "bad name@gmail.com", ".name@gmail.com", "name.@gmail.com", "na..me@gmail.com", "name@@gmail.com", "name@gmail.com.evil.test", "name@gmail.com\n", "\tname@gmail.com", "na\u0085me@gmail.com", `${"a".repeat(65)}@gmail.com`]) {
    assert.equal(validateAdminInvite(value).ok, false, value);
  }
  assert.equal(validateAdminInvite(" EXISTING@GMAIL.COM ", [{ email: "existing@gmail.com" }]).code, "duplicate");
  assert.equal(toAdminMember({ email: "company@hushh.ai", is_owner: false }).email, "company@hushh.ai");
});

test("invitation writes only the normalized email and returns confirmed server audit metadata", async () => {
  const saved = { email: "new@gmail.com", is_owner: false, created_at: "2026-11-09T12:00:00Z", created_by: "current@gmail.com" };
  const { client, calls } = fakeClient([{ data: [saved] }, { data: saved }]);
  const member = await inviteAdminMembership(client, " New@Gmail.com ");
  assert.deepEqual(calls[0].insert[0], [{ email: "new@gmail.com" }]);
  assert.equal(calls[0].select[0][0], MEMBER_COLUMNS);
  assert.deepEqual(calls[1].eq[0], ["email", "new@gmail.com"]);
  assert.equal(member.role, "admin"); assert.equal(member.addedAt, saved.created_at); assert.equal(member.addedBy, saved.created_by);
});

test("duplicate races, server failures and missing confirmation never fabricate an invitation", async () => {
  const duplicate = fakeClient([{ error: { code: "23505", message: "duplicate" } }]);
  await assert.rejects(inviteAdminMembership(duplicate.client, "new@gmail.com"), error => error.code === "23505");
  const localDuplicate = fakeClient([]);
  await assert.rejects(inviteAdminMembership(localDuplicate.client, "new@gmail.com", [{ email: "new@gmail.com" }]), error => error.code === "duplicate");
  assert.equal(localDuplicate.calls.length, 0);
  const noAck = fakeClient([{ data: [] }]);
  await assert.rejects(inviteAdminMembership(noAck.client, "new@gmail.com"), /could not be confirmed/);
  const saved = { email: "new@gmail.com", is_owner: false, created_at: "2026-11-09T12:00:00Z" };
  const failedRead = fakeClient([{ data: [saved] }, { error: new Error("offline") }]);
  await assert.rejects(inviteAdminMembership(failedRead.client, "new@gmail.com"), /offline/);
});

test("removing another member requires the exact returned deleted row and a confirmed absence", async () => {
  const saved = { email: "other@gmail.com", is_owner: false };
  const { client, calls } = fakeClient([{ data: [saved] }, { data: null }]);
  assert.deepEqual(await removeAdminMembership(client, { email: saved.email, role: "admin" }), { email: saved.email, self: false });
  assert.deepEqual(calls[0].eq[0], ["email", saved.email]);
  assert.equal(calls[0].delete.length, 1); assert.equal(calls.length, 2);
  const stillPresent = fakeClient([{ data: [saved] }, { data: saved }]);
  await assert.rejects(removeAdminMembership(stillPresent.client, { email: saved.email, role: "admin" }), /still has access/);
});

test("owner removal, missing delete acknowledgements and network errors never report revoked access", async () => {
  const owner = fakeClient([]);
  await assert.rejects(removeAdminMembership(owner.client, { email: "owner@gmail.com", role: "owner" }), /owner keeps access/);
  assert.equal(owner.calls.length, 0);
  const noAck = fakeClient([{ data: [] }]);
  await assert.rejects(removeAdminMembership(noAck.client, { email: "other@gmail.com", role: "admin" }), /could not be removed/);
  const failed = fakeClient([{ error: new Error("offline") }]);
  await assert.rejects(removeAdminMembership(failed.client, { email: "other@gmail.com", role: "admin" }), /offline/);
});

test("self-removal requires a delete acknowledgement and leaves authorization confirmation to the shared auth check", async () => {
  const member = { email: "self@gmail.com", role: "admin" };
  const { client, calls } = fakeClient([{ data: [{ email: member.email, is_owner: false }] }]);
  assert.deepEqual(await removeAdminMembership(client, member, { self: true }), { email: member.email, self: true });
  assert.equal(calls.length, 1, "a removed account must not query the private table anonymously");
});

test("ambiguous issued self-removal signs out before either a stale allowed result or a failed access check", async () => {
  for (const checkFails of [false, true]) {
    const events = [];
    await settleMembershipFailure({ selfRemovalIssued: true,
      signOut: async () => { events.push("sign_out"); },
      checkAccess: async () => { events.push("check_access"); if (checkFails) throw new Error("offline"); return true; },
    });
    assert.deepEqual(events, ["sign_out", "check_access"]);
  }
});

test("another account's failed removal or an unissued self-removal preserves the current sign-in", async () => {
  let signOuts = 0;
  let checks = 0;
  await settleMembershipFailure({ selfRemovalIssued: false,
    signOut: async () => { signOuts += 1; },
    checkAccess: async () => { checks += 1; return true; },
  });
  assert.equal(signOuts, 0); assert.equal(checks, 1);
});
