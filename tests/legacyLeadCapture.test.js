import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";

const source = readFileSync(new URL("../integrations/google-sheets/Code.gs", import.meta.url), "utf8");

function legacyFixture() {
  let storageAccesses = 0;
  const properties = new Map([["LETSAIMIT_LEAD_SHEET_ID", "private-fixture-workbook"]]);
  const sheets = new Map();
  function sheetFor(rows) {
    return {
      rows,
      getLastRow: () => rows.length,
      getMaxRows: () => 1000,
      getRange(row, column, height = 1, width = 1) {
        return {
          setNumberFormat() { return this; },
          setValues(values) { values.forEach((valuesRow, i) => { rows[row - 1 + i] = [...valuesRow]; }); return this; },
          getValues: () => Array.from({ length: height }, (_, i) => (rows[row - 1 + i] || []).slice(column - 1, column - 1 + width)),
          createTextFinder(value) {
            return { matchEntireCell() { return this; }, findNext() {
              const index = rows.findIndex((values, i) => i >= row - 1 && i < row - 1 + height && values[column - 1] === value);
              return index < 0 ? null : { getRow: () => index + 1 };
            } };
          },
        };
      },
    };
  }
  const context = vm.createContext({
    console: { log() {} },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput(content) { return { content, setMimeType() { return this; } }; } },
    PropertiesService: { getScriptProperties() { storageAccesses += 1; return { getProperty: key => properties.get(key) || null }; } },
    LockService: { getScriptLock() { return { tryLock: () => true, waitLock() {}, releaseLock() {} }; } },
    SpreadsheetApp: { openById() { storageAccesses += 1; return { getSheetByName: name => sheets.get(name) }; }, flush() {} },
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" }, computeDigest: (_algorithm, input) => [...createHash("sha256").update(input).digest()] },
  });
  vm.runInContext(source, context);
  for (const kind of ["trial", "enrol", "society", "school"]) {
    const name = vm.runInContext(`LEAD_SCHEMAS.${kind}.tab`, context);
    sheets.set(name, sheetFor([Array.from(context.headersFor_(kind))]));
  }
  const post = payload => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).content);
  return { context, properties, sheets, post, storageAccesses: () => storageAccesses };
}

test("legacy parent saves and native form routes retire before storage while society/school saves and retries remain supported", () => {
  const fixture = legacyFixture();
  const parent = {
    submissionId: "19a00c42-e05f-4fd4-998a-523eb2c3d4e8",
    consent: { agreed: true, guardian: true, terms: true, version: "2026-11-05" },
    data: { parentName: "Synthetic Parent", childName: "Synthetic Child", phone: "+12025550123", age: "9", community: "Synthetic Community", sport: "Basketball" },
  };
  const archivedTrial = { formType: "trial", guardian: true, terms: false, data: { parentName: parent.data.parentName, phone: parent.data.phone, age: "9", community: parent.data.community, sport: "Basketball" } };
  fixture.sheets.get("Trial").rows.push([
    parent.submissionId, "2026-11-05T10:00:00.000Z", "2026-11-05", "2026-11-05T10:00:00.000Z", "Yes", "Not applicable", "",
    ...Object.values(archivedTrial.data), fixture.context.payloadFingerprint_(archivedTrial),
  ]);
  // An old matching receipt cannot bypass retirement because no storage is read.
  for (const kind of ["trial", "enrol", "enroll"]) {
    const result = fixture.post({ ...parent, formType: kind });
    assert.equal(result.ok, false);
    assert.equal(result.code, "PARENT_REGISTRATION_RETIRED");
    assert.match(result.message, /https:\/\/letsaimit\.com\//);
    assert.match(result.message, /Google/);
    assert.equal(Object.hasOwn(result, "savedAt"), false);
    assert.equal(Object.hasOwn(result, "duplicate"), false);
    assert.throws(() => fixture.context.configureNativeForm_({}, kind, {}), error => error.leadCode === result.code && /Google/.test(error.message));
  }
  assert.equal(fixture.storageAccesses(), 0);

  const requests = [
    { formType: "society", submissionId: "45e0bdba-9345-4ec3-98b8-9397cc438b07", data: { societyName: "Synthetic Society", locality: "Example City", contactName: "=1+1", phone: "+1 (202) 555-0123", role: "Resident", childrenCount: "Not sure", space: "Synthetic court", message: "" } },
    { formType: "school", submissionId: "f84940a4-e4cb-4ebf-88cb-e63537834565", data: { schoolName: "Synthetic School", city: "Example City", contactName: "Synthetic Contact", phone: "+12025550123", role: "", needs: "" } },
  ];
  for (const request of requests) {
    const payload = { ...request, consent: { agreed: true, version: "2026-11-05" } };
    const result = fixture.post(payload);
    assert.equal(result.ok, true);
    assert.equal(result.duplicate, false);
    assert.equal(result.submissionId, request.submissionId);
    assert.equal(Number.isFinite(Date.parse(result.savedAt)), true);
    assert.equal(fixture.post(payload).duplicate, true);
    assert.equal(fixture.post({ ...payload, data: { ...request.data, contactName: "Changed contact" } }).code, "SUBMISSION_CONFLICT");
    assert.equal(fixture.post({ ...payload, consent: { agreed: false, version: "2026-11-05" } }).code, "CONSENT_REQUIRED");
  }
  assert.equal(fixture.sheets.get("Societies").rows.length, 2);
  assert.equal(fixture.sheets.get("Schools").rows.length, 2);
  assert.equal(fixture.sheets.get("Societies").rows[1].includes("'=1+1"), true);
  assert.equal(fixture.sheets.get("Trial").rows.length, 2);
  assert.equal(fixture.sheets.get("Enrolment").rows.length, 1);

  // Existing parent form properties must not cause even an open/read of those forms.
  for (const kind of ["TRIAL", "ENROL", "SOCIETY", "SCHOOL"]) {
    fixture.properties.set(`LETSAIMIT_FORM_${kind}`, kind);
    fixture.properties.set(`LETSAIMIT_FORM_${kind}_READY_VERSION`, "2026-11-05");
  }
  const opened = [];
  fixture.context.setupLeadSheet = () => {};
  fixture.context.FormApp = { DestinationType: { SPREADSHEET: "sheet" }, openById(id) {
    opened.push(id);
    return { getDestinationId: () => "private-fixture-workbook", getDestinationType: () => "sheet", getPublishedUrl: () => "https://forms.example.test/" + id, getEditUrl: () => "https://forms.example.test/edit/" + id };
  } };
  const forms = fixture.context.setupRegistrationForms();
  assert.deepEqual(opened, ["SOCIETY", "SCHOOL"]);
  assert.deepEqual(Object.keys(forms), ["society", "school"]);
});
