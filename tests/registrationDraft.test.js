import test from "node:test";
import assert from "node:assert/strict";
import { clearRegistrationDraft, createRegistrationDraft, filterPhoneCountries, nationalPhoneLimit, readRegistrationDraft, sanitizePhoneInput, storeRegistrationDraft } from "../src/features/registration/registrationDraft.js";
import { firstInvalidRegistrationField, parentRegistrationResolver } from "../src/features/registration/registrationResolver.js";

const complete = { ...createRegistrationDraft(), parentName: "Asha", email: "asha@example.com", phone: "9876543210", age: "8", sport: "Football", community: "Nambiar Ellegenza", consent: true };
test("enrolment handoff preserves its details through review while trial has its own draft", () => {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  const values = { ...complete, childName: "Dev", address: "Elm West", community: "Another community", otherCommunity: "Elm West", terms: true, billingConsent: true };
  assert.equal(storeRegistrationDraft("trial", complete, storage, 1000), true);
  assert.equal(readRegistrationDraft("enrol", storage, 1100), null);
  assert.equal(storeRegistrationDraft("enrol", values, storage, 1100), true);
  const resumed = readRegistrationDraft("enrol", storage, 1200);
  assert.equal(resumed.childName, "Dev");
  assert.equal(resumed.otherCommunity, "Elm West");
  assert.equal(resumed.consent, false);
  assert.equal(resumed.terms, false);
  assert.equal(resumed.billingConsent, false);
  assert.deepEqual(readRegistrationDraft("enroll", storage, 1300), resumed);
  clearRegistrationDraft("enrol", storage);
  assert.equal(readRegistrationDraft("enrol", storage, 1400), null);
  assert.equal(readRegistrationDraft("trial", storage, 1400).parentName, "Asha");
  assert.equal(readRegistrationDraft("trial", storage, 1000 + 30 * 60 * 1000), null);
  assert.equal(entries.size, 0, "expired private draft is discarded");
});
test("fresh drafts are independent, memory-only and start with an Indian country selection", () => {
  const first = createRegistrationDraft(); first.parentName = "Asha";
  assert.equal(createRegistrationDraft().parentName, ""); assert.equal(createRegistrationDraft().phoneCountry, "IN");
});
test("phone masking strips formatting and letters and caps India at ten national digits", () => {
  assert.equal(sanitizePhoneInput("98a765-43210more99").phone.replace(/\D/g, ""), "9876543210");
  assert.equal(nationalPhoneLimit("IN"), 10);
  assert.deepEqual(sanitizePhoneInput(""), { phoneCountry: "IN", phone: "" });
});
test("country digit caps use actual significant-number lengths, not parsed dummy prefixes", () => {
  for (const country of ["US", "CA", "GB", "IN"]) assert.equal(nationalPhoneLimit(country), 10, country);
  assert.equal(nationalPhoneLimit("BR"), 11);
  assert.equal(nationalPhoneLimit("AT"), 13);
  assert.equal(nationalPhoneLimit("DE"), 13, "Germany remains within the 15-digit E.164 total including +49");
});
test("US and Canadian masks cap national input at ten digits while valid dial-code pastes normalize", () => {
  for (const [country, national, international] of [["US", "2025550123", "+1 202 555 0123"], ["CA", "4165550123", "+1 416 555 0123"]]) {
    assert.equal(sanitizePhoneInput(national + "99", country).phone.replace(/\D/g, ""), national, country);
    const pasted = sanitizePhoneInput(international, "IN", { preserveOverflow: true });
    assert.equal(pasted.phoneCountry, country);
    assert.equal(pasted.phone.replace(/\D/g, ""), national);
  }
});
test("international paste removes the dial code without losing the national digits", () => {
  assert.equal(sanitizePhoneInput("+91 (98765) 43210").phone.replace(/\D/g, ""), "9876543210");
  const british = sanitizePhoneInput("+44 7400 123456", "IN");
  assert.equal(british.phoneCountry, "GB"); assert.equal(british.phone.replace(/\D/g, ""), "7400123456");
  assert.equal(nationalPhoneLimit("DE") > 10, true);
});
test("country search understands dial codes, names and ISO country codes", () => {
  assert.equal(filterPhoneCountries("+91")[0].code, "IN");
  assert.equal(filterPhoneCountries("United Kingdom")[0].code, "GB");
  assert.equal(filterPhoneCountries("impossiblecountry").length, 0);
});
test("full pasted numbers normalize domestic trunk and international prefixes before masking", () => {
  for (const input of ["07400 123456", "0044 7400 123456"]) {
    const result = sanitizePhoneInput(input, "GB", { preserveOverflow: true });
    assert.equal(result.phoneCountry, "GB");
    assert.equal(result.phone.replace(/\D/g, ""), "7400123456");
  }
  for (const input of ["91 98765 43210", "0091 98765 43210", "+91 98765 43210"]) {
    const result = sanitizePhoneInput(input, "IN", { preserveOverflow: true });
    assert.equal(result.phone.replace(/\D/g, ""), "9876543210");
  }
});
test("ambiguous overlong paste is kept invalid instead of silently becoming a different number", () => {
  const result = sanitizePhoneInput("98765432101", "IN", { preserveOverflow: true });
  assert.equal(result.phone.replace(/\D/g, ""), "98765432101");
  assert.ok(parentRegistrationResolver("trial")({ ...complete, ...result }).errors.phone);
});
test("resolver blocks unchecked consent and enrolment terms and reports field errors", () => {
  const resolver = parentRegistrationResolver("trial");
  assert.deepEqual(resolver(complete).errors, {});
  assert.ok(resolver({ ...complete, consent: false }).errors.consent);
  const invalid = resolver({ ...complete, phone: "987" });
  assert.ok(invalid.errors.phone); assert.deepEqual(invalid.values, {});
  const enrol = parentRegistrationResolver("enroll")({ ...complete, childName: "Dev", address: "Elm West" });
  assert.ok(enrol.errors.terms);
  assert.deepEqual(parentRegistrationResolver("enroll")({ ...complete, childName: "Dev", address: "Elm West", terms: true }).errors, {});
});
test("enrolment details can continue to Google without consent and review requires fresh consent", () => {
  const values = { ...complete, childName: "Dev", address: "Elm West", consent: false };
  const details = parentRegistrationResolver("enroll", { requireConsent: false, billingRequired: true });
  const review = parentRegistrationResolver("enroll", { billingRequired: true });
  assert.deepEqual(details(values).errors, {});
  assert.ok(details({ ...values, childName: "" }).errors.childName);
  assert.deepEqual(Object.keys(review(values).errors).sort(), ["billingConsent", "consent", "terms"]);
  assert.deepEqual(review({ ...values, consent: true, terms: true, billingConsent: true }).errors, {});
});
test("first invalid focus follows visible form order, regardless of error insertion order", () => {
  assert.equal(firstInvalidRegistrationField("trial", { phone: {}, email: {}, parentName: {} }), "parentName");
  assert.equal(firstInvalidRegistrationField("enroll", { terms: {}, parentName: {}, childName: {} }), "childName");
  assert.equal(firstInvalidRegistrationField("enroll", { address: {}, age: {}, email: {} }), "age");
  assert.equal(firstInvalidRegistrationField("trial", { phone: {}, phoneCountry: {} }), "phoneCountry");
  assert.equal(firstInvalidRegistrationField("trial", { sport: {}, otherCommunity: {} }), "otherCommunity");
  assert.equal(firstInvalidRegistrationField("trial", { consent: {} }), "consent");
  assert.equal(firstInvalidRegistrationField("enroll", { terms: {} }), "terms");
  assert.equal(firstInvalidRegistrationField("enroll", { terms: {}, consent: {} }), "consent");
  assert.equal(firstInvalidRegistrationField("trial", {}), undefined);
});
