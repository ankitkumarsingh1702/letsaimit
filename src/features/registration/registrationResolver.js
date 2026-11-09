import { registrationFieldErrors } from "../../lib/registrationSchema.js";

/** Match the rendered fields, independently of React Hook Form's registration order. */
export function firstInvalidRegistrationField(mode, errors) {
  const order = [
    ...(mode === "enroll" || mode === "enrol" ? ["childName"] : []),
    "parentName", "email", "phoneCountry", "phone", "age", "community", "otherCommunity", "sport",
    ...(mode === "enroll" || mode === "enrol" ? ["address", "note"] : []),
    "consent", ...(mode === "enroll" || mode === "enrol" ? ["terms", "billingConsent"] : []),
  ];
  return order.find(name => errors[name]);
}

/** Pure adapter keeps the browser validation contract testable without a DOM. */
export function parentRegistrationResolver(mode, { billingRequired = false } = {}) {
  return values => {
    const messages = registrationFieldErrors(mode, values);
    if (values.consent !== true) messages.consent = "Please confirm that you are the parent or guardian and agree.";
    if (["enroll", "enrol"].includes(mode) && values.terms !== true) messages.terms = "Please read and accept the programme terms.";
    if (["enroll", "enrol"].includes(mode) && billingRequired && values.billingConsent !== true) messages.billingConsent = "Please read and accept the monthly payment details.";
    return {
      values: Object.keys(messages).length ? {} : values,
      errors: Object.fromEntries(Object.entries(messages).map(([name, message]) => [name, { type: "validate", message }])),
    };
  };
}
