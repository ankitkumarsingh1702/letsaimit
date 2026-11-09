import test from "node:test";
import assert from "node:assert/strict";
import { mergeSavedRegistrations, normalizeRegistration, safeCsvValue } from "../src/features/admin/adminData.js";

test("Supabase registrations retain canonical contact fields and immutable consent metadata", () => {
  const record = {
    id: "0b686774-3e51-47fb-81f6-96b573bf8c87", submission_id: "source-submission-uuid", created: "2026-11-09 12:00:00.000Z", updated: "2026-11-09 12:05:00.000Z",
    full_name: "Parent name", email: "parent@example.com", phone: "+919876543210", status: "contacted", notes: "Call tomorrow", assignee: "team@example.com",
    metadata: { id: "not-the-record-id", submissionId: "submission-123", formType: "enrol", childName: "Child name", age: "8", community: "Nambiar Ellegenza", sport: "Basketball", email: "old@example.com", consent: { accepted: true, version: "2026-11" } },
  };
  const row = normalizeRegistration(record);
  assert.equal(row.id, record.id);
  assert.equal(row.parentName, "Parent name");
  assert.equal(row.email, "parent@example.com");
  assert.equal(row.childName, "Child name");
  assert.equal(row.submissionId, "source-submission-uuid");
  assert.equal(row.formType, "enrol");
  assert.equal(row.revision, record.updated);
  assert.deepEqual(row.consent, { accepted: true, version: "2026-11" });
  assert.equal(row.status, "contacted");
  assert.equal(row.notes, "Call tomorrow");
  assert.equal(row.assignee, "team@example.com");
  assert.equal(record.metadata.email, "old@example.com");
});

test("Supabase record revision is used when supplied and missing metadata is harmless", () => {
  const row = normalizeRegistration({ id: "record1", revision: "12", updated: "old", created: "created", full_name: "Contact" });
  assert.equal(row.revision, "12");
  assert.equal(row.submissionId, "record1");
  assert.equal(row.savedAt, "created");
  assert.equal(row.status, "new");
  assert.equal(row.notes, "");
});

test("CSV export neutralises spreadsheet formulas including leading whitespace", () => {
  for (const value of ["=1+1", "+919876543210", "-2+3", "@SUM(1)", "  =HYPERLINK(\"https://example.com\")", "\ttext", "\rtext", "\ntext"]) {
    assert.equal(safeCsvValue(value), "'" + value);
  }
  assert.equal(safeCsvValue("Call tomorrow"), "Call tomorrow");
  assert.equal(safeCsvValue("text, with a comma"), "text, with a comma");
  assert.equal(safeCsvValue(null), "");
  assert.equal(safeCsvValue({ accepted: true }), '{"accepted":true}');
});


test("an in-flight list response cannot roll back a newer saved row revision", () => {
  const saved = { id: "same-row", revision: 2, notes: "Just saved" };
  const removed = { id: "removed-row", revision: 1 };
  const late = { id: "same-row", revision: 1, notes: "Old note" };
  const newRow = { id: "new-row", revision: 1 };
  assert.deepEqual(mergeSavedRegistrations([saved, removed], [newRow, late]), [newRow, saved]);
  const newer = { ...saved, revision: 3, notes: "Another admin update" };
  assert.deepEqual(mergeSavedRegistrations([saved], [newer]), [newer]);
});
