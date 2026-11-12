import { AsYouType, getCountries, getCountryCallingCode, Metadata, parsePhoneNumberFromString } from "libphonenumber-js/max";

export function createRegistrationDraft() {
  return { childName: "", parentName: "", phone: "", phoneCountry: "IN", age: "", community: "", otherCommunity: "", sport: "", email: "", address: "", note: "", consent: false, terms: false, billingConsent: false, billingTermsVersion: "" };
}

const DRAFT_AGE_MS = 30 * 60 * 1000;
const draftLimits = { childName: 80, parentName: 80, phone: 40, phoneCountry: 2, age: 10, community: 120, otherCommunity: 120, sport: 40, email: 254, address: 500, note: 500 };
function draftStorage() { try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; } }
function draftKey(mode) { return ["trial", "enrol", "enroll"].includes(mode) ? `letsaimit.parent.draft.${mode === "trial" ? "trial" : "enrol"}.v1` : null; }
function boundedDraft(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const clean = createRegistrationDraft();
  for (const [key, max] of Object.entries(draftLimits)) {
    if (typeof values[key] !== "string" || values[key].length > max) return null;
    clean[key] = values[key];
  }
  if (!getCountries().includes(clean.phoneCountry)) return null;
  // Consent must be reviewed again after leaving the site for Google.
  clean.consent = false; clean.terms = false; clean.billingConsent = false; clean.billingTermsVersion = "";
  return clean;
}

/** Preserve only bounded answers in this tab; never an auth token or a prior consent/save. */
export function storeRegistrationDraft(mode, values, storage = draftStorage(), now = Date.now()) {
  const key = draftKey(mode); const draft = boundedDraft(values);
  if (!key || !draft || !storage || !Number.isFinite(now)) return false;
  try { storage.setItem(key, JSON.stringify({ savedAt: now, expiresAt: now + DRAFT_AGE_MS, values: draft })); return true; }
  catch { return false; }
}

function getRegistrationDraft(mode, storage, now, consume) {
  const key = draftKey(mode);
  if (!key) return null;
  try {
    const raw = storage?.getItem(key);
    if (consume) storage?.removeItem(key);
    if (!raw || !Number.isFinite(now)) return null;
    const entry = JSON.parse(raw);
    const validTime = entry && Number.isFinite(entry.savedAt) && entry.expiresAt === entry.savedAt + DRAFT_AGE_MS && now >= entry.savedAt && now < entry.expiresAt;
    const draft = validTime ? boundedDraft(entry.values) : null;
    if (!draft && !consume) clearRegistrationDraft(mode, storage);
    return draft;
  } catch {
    if (!consume) clearRegistrationDraft(mode, storage);
    return null;
  }
}

export function readRegistrationDraft(mode, storage = draftStorage(), now = Date.now()) {
  return getRegistrationDraft(mode, storage, now, false);
}

export function consumeRegistrationDraft(mode, storage = draftStorage(), now = Date.now()) {
  return getRegistrationDraft(mode, storage, now, true);
}

export function clearRegistrationDraft(mode, storage = draftStorage()) {
  try { const key = draftKey(mode); if (key) storage?.removeItem(key); } catch { /* No persistent fallback. */ }
}
export function clearRegistrationDrafts(storage = draftStorage()) {
  clearRegistrationDraft("trial", storage); clearRegistrationDraft("enrol", storage);
}
export function shouldClearBoundRegistration(previousUserId, nextGoogleUserId) {
  return Boolean(previousUserId && previousUserId !== nextGoogleUserId);
}

/** A saved response belongs only to the still-active submission and freshly verified Google actor. */
export function canConfirmRegistrationReceipt({ submittedUserId, verifiedUser, generation, currentGeneration, active }) {
  return active === true && Boolean(submittedUserId) && verifiedUser?.isGoogle === true &&
    verifiedUser.id === submittedUserId && generation === currentGeneration;
}

const limits = new Map();
export function nationalPhoneLimit(country = "IN") {
  if (!limits.has(country)) {
    // Read significant-number lengths directly. Parsing a fabricated number can
    // remove national/calling prefixes and overestimate the allowed digit count.
    const metadata = new Metadata();
    metadata.selectNumberingPlan(country);
    const maximum = country === "IN" ? 10 : Math.min(
      Math.max(...metadata.numberingPlan.possibleLengths()),
      15 - getCountryCallingCode(country).length,
    );
    limits.set(country, maximum);
  }
  return limits.get(country);
}

/** Strip formatting, recognise international pastes, then mask the national part. */
export function sanitizePhoneInput(raw, country = "IN", { preserveOverflow = false } = {}) {
  const input = String(raw || "").trim();
  let digits = input.replace(/\D/g, "");
  let phoneCountry = country;
  const internationalInput = input.startsWith("00") ? `+${input.slice(2)}` : input;
  // Parse before masking: country/trunk prefixes are not national-number digits.
  const complete = parsePhoneNumberFromString(internationalInput, { defaultCountry: country, extract: false });
  if (complete?.isValid()) {
    phoneCountry = complete.country || country;
    digits = complete.nationalNumber;
  } else if (/^\+/.test(internationalInput)) {
    const international = parsePhoneNumberFromString(internationalInput, { extract: false });
    if (international?.country) {
      phoneCountry = international.country;
      digits = international.nationalNumber;
    } else {
      const callingCode = getCountryCallingCode(country);
      if (digits.startsWith(callingCode)) digits = digits.slice(callingCode.length);
    }
  }
  // An unrecognised paste must stay invalid, rather than become someone else's number.
  digits = digits.slice(0, preserveOverflow ? 16 : nationalPhoneLimit(phoneCountry));
  return { phoneCountry, phone: new AsYouType(phoneCountry).input(digits) };
}

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
export const PHONE_COUNTRIES = Object.freeze(getCountries().map(code => ({
  code,
  name: displayNames.of(code),
  dialCode: `+${getCountryCallingCode(code)}`,
  flag: String.fromCodePoint(...code.split("").map(letter => 127397 + letter.charCodeAt(0))),
})).sort((a, b) => a.name.localeCompare(b.name, "en")));

export function filterPhoneCountries(query) {
  const needle = query.trim().toLocaleLowerCase("en");
  return PHONE_COUNTRIES.filter(country => `${country.name} ${country.code} ${country.dialCode}`.toLocaleLowerCase("en").includes(needle));
}
