import test from "node:test";
import assert from "node:assert/strict";
import { parseRegistration, registrationFieldErrors } from "../src/lib/registrationSchema.js";

const trial = {
  parentName: " Asha D’Souza ", email: " Asha+trial@example.technology ", phone: "+91 98765 43210",
  phoneCountry: "IN", age: "8", community: "Nambiar Ellegenza", sport: "Football",
};
const enrol = { ...trial, childName: " Dev ", address: "Flat 4, Elm Road\nBengaluru", note: "  Please call in the evening.  " };
function invalidField(kind, data, field) {
  assert.throws(() => parseRegistration(kind, data), error => error.issues?.some(issue => issue.path[0] === field));
}

test("trial canonical data trims fields, keeps email plus tags and emits E.164", () => {
  assert.deepEqual(parseRegistration("trial", trial), {
    parentName: "Asha D’Souza", email: "Asha+trial@example.technology", phone: "+919876543210",
    phoneCountry: "IN", age: "8", community: "Nambiar Ellegenza", sport: "Football",
  });
});
test("frontend enroll alias and enrol API spelling have the same full registration contract", () => {
  assert.deepEqual(parseRegistration("enroll", enrol), parseRegistration("enrol", enrol));
  const parsed = parseRegistration("enrol", enrol);
  assert.equal(parsed.childName, "Dev");
  assert.equal(parsed.address, "Flat 4, Elm Road\nBengaluru");
  assert.equal(parsed.note, "Please call in the evening.");
});
test("unknown form types, arrays and missing payloads fail with validation errors", () => {
  for (const kind of ["society", "admin", "__proto__", "constructor", undefined]) {
    assert.throws(() => parseRegistration(kind, trial), error => Array.isArray(error.issues));
  }
  for (const value of [null, undefined, [], "value"]) assert.throws(() => parseRegistration("trial", value));
});
test("all shared parent fields are required, including email for the private register", () => {
  for (const field of ["parentName", "email", "phone", "age", "community", "sport"]) invalidField("trial", { ...trial, [field]: "" }, field);
  for (const field of ["childName", "address"]) invalidField("enrol", { ...enrol, [field]: "   " }, field);
  assert.equal(parseRegistration("enrol", { ...enrol, note: undefined }).note, "");
});
test("approved age boundaries apply to registration; other remains a trial enquiry", () => {
  for (const age of ["5", "14"]) {
    assert.equal(parseRegistration("trial", { ...trial, age }).age, age);
    assert.equal(parseRegistration("enrol", { ...enrol, age }).age, age);
  }
  assert.equal(parseRegistration("trial", { ...trial, age: "other" }).age, "other");
  for (const age of ["4", "15", "banana", "other"]) invalidField("enrol", { ...enrol, age }, "age");
});
test("prospective community locality is retained and other selection needs its actual text", () => {
  assert.equal(parseRegistration("trial", { ...trial, community: " Elm / West " }).community, "Elm / West");
  assert.equal(parseRegistration("trial", { ...trial, community: "Another community", otherCommunity: " Elm / West " }).community, "Elm / West");
  invalidField("trial", { ...trial, community: "Another community" }, "otherCommunity");
  for (const sport of ["Football", "Basketball", "Not sure"]) assert.equal(parseRegistration("trial", { ...trial, sport }).sport, sport);
  invalidField("trial", { ...trial, sport: "Cricket" }, "sport");
});
test("India requires a valid ten-digit national number and accepts common formatting", () => {
  for (const phone of ["9876543210", "98765 43210", "+91 (98765) 43210"]) assert.equal(parseRegistration("trial", { ...trial, phone }).phone, "+919876543210");
  for (const phone of ["987654321", "98765432101", "0000000000", "call 9876543210", "98765.43210", "9876543210 ext 12"]) invalidField("trial", { ...trial, phone }, "phone");
});
test("international countries use their own validity rules rather than an India-only cap", () => {
  const examples = [["US", "(202) 555-0123", "+12025550123"], ["GB", "7400 123456", "+447400123456"], ["DE", "1512 3456789", "+4915123456789"]];
  for (const [phoneCountry, phone, canonical] of examples) assert.equal(parseRegistration("trial", { ...trial, phoneCountry, phone }).phone, canonical);
  invalidField("trial", { ...trial, phoneCountry: "ZZ" }, "phoneCountry");
  invalidField("trial", { ...trial, phoneCountry: "US", phone: "+447400123456" }, "phoneCountry");
});
test("email validation accepts plus tags and subdomains and rejects malformed input", () => {
  for (const email of ["name+child@example.com", "parent@school.example.org", "First.Last@example.technology"]) assert.equal(parseRegistration("enrol", { ...enrol, email }).email, email);
  for (const email of ["name", "a@@example.com", "a b@example.com", "a@", "a@example..com", "a\nb@example.com"]) invalidField("enrol", { ...enrol, email }, "email");
});
test("length and control-character limits are enforced without deleting real content", () => {
  for (const [field, length] of [["parentName", 80], ["childName", 80], ["address", 500], ["note", 500]]) {
    assert.equal(parseRegistration("enrol", { ...enrol, [field]: "x".repeat(length) })[field].length, length);
    invalidField("enrol", { ...enrol, [field]: "x".repeat(length + 1) }, field);
  }
  invalidField("enrol", { ...enrol, note: "text\u0000hidden" }, "note");
});
test("unknown client attributes are discarded and field errors keep the first useful message", () => {
  assert.equal(Object.hasOwn(parseRegistration("trial", { ...trial, role: "owner", status: "approved" }), "role"), false);
  const errors = registrationFieldErrors("trial", { ...trial, phone: "" });
  assert.equal(errors.phone, "Enter a phone number.");
  assert.deepEqual(registrationFieldErrors("trial", trial), {});
});
