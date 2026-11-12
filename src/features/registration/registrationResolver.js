import { registrationFieldErrors } from "../../lib/registrationSchema.js";

/** Match the rendered fields, independently of React Hook Form's registration order. */
export function firstInvalidRegistrationField(mode, errors) {
  const order = ["enroll", "enrol"].includes(mode)
    ? ["childName", "age", "sport", "community", "otherCommunity", "address", "note", "parentName", "email", "phoneCountry", "phone", "consent", "terms", "billingConsent"]
    : ["parentName", "email", "phoneCountry", "phone", "age", "community", "otherCommunity", "sport", "consent"];
  return order.find(name => errors[name]);
}

/** Pure adapter keeps the browser validation contract testable without a DOM. */
export function parentRegistrationResolver(mode, { billingRequired = false, requireConsent = true } = {}) {
  const enrol = ["enroll", "enrol"].includes(mode);
  return values => {
    const messages = registrationFieldErrors(mode, values);
    if (requireConsent && values.consent !== true) messages.consent = "Confirm that you’re the parent or guardian.";
    if (requireConsent && enrol && values.terms !== true) messages.terms = "Accept the programme terms to continue.";
    if (requireConsent && enrol && billingRequired && values.billingConsent !== true) messages.billingConsent = "Accept the monthly payment terms to continue.";
    return {
      values: Object.keys(messages).length ? {} : values,
      errors: Object.fromEntries(Object.entries(messages).map(([name, message]) => [name, { type: "validate", message }])),
    };
  };
}
