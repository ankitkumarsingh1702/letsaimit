import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, validatePhoneNumberLength } from "libphonenumber-js/max";

export const SHARED_PARENT_FIELDS = Object.freeze(["parentName", "email", "phone", "phoneCountry", "age", "community", "otherCommunity", "sport"]);
export function createRegistrationDraft() {
  return { childName: "", parentName: "", phone: "", phoneCountry: "IN", age: "", community: "", otherCommunity: "", sport: "", email: "", address: "", note: "", consent: false, terms: false };
}

/** Seed blank registration answers; never transfer consent, terms or a previous save. */
export function carryTrialToEnrol(trial, enrol = createRegistrationDraft()) {
  const result = { ...enrol };
  for (const field of SHARED_PARENT_FIELDS) {
    if (field === "phoneCountry") continue;
    if (!result[field] && trial[field]) result[field] = trial[field];
  }
  if (!enrol.phone && trial.phone) result.phoneCountry = trial.phoneCountry || "IN";
  if (result.age === "other") result.age = "";
  return result;
}

const limits = new Map();
export function nationalPhoneLimit(country = "IN") {
  if (!limits.has(country)) {
    let maximum = country === "IN" ? 10 : 15 - getCountryCallingCode(country).length;
    if (country !== "IN") {
      while (maximum > 1 && validatePhoneNumberLength("1".repeat(maximum), country) === "TOO_LONG") maximum -= 1;
    }
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
