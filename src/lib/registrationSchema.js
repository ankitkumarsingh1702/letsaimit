import { z } from "zod";
import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js/max";

export const REGISTRATION_AGES = Object.freeze(Array.from({ length: 10 }, (_, index) => String(index + 5)));
export const REGISTRATION_SPORTS = Object.freeze(["Football", "Basketball", "Not sure"]);
export const REGISTRATION_COMMUNITIES = Object.freeze(["Nambiar Ellegenza", "Nambiar Bellezea", "Another community"]);

const text = (label, maximum) => z.string({ error: `Enter ${label}.` }).trim()
  .min(1, `Enter ${label}.`).max(maximum, `Use ${maximum} characters or fewer.`)
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported control characters.");
const optionalText = maximum => z.string().trim().max(maximum, `Use ${maximum} characters or fewer.`)
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported control characters.")
  .optional().default("");

function registrationSchema(formType) {
  const enrol = formType === "enrol" || formType === "enroll";
  if (formType !== "trial" && !enrol) {
    return z.never({ error: "Choose a trial or child registration." });
  }
  return z.object({
    ...(enrol ? { childName: text("your child’s name", 80) } : {}),
    parentName: text("the parent or guardian’s name", 80),
    phoneCountry: z.string().refine(isSupportedCountry, "Choose a country.").default("IN"),
    phone: text("a phone number", 40),
    email: text("an email address", 254).pipe(z.email({ error: "Enter a valid email address." })),
    age: z.string().refine(value => REGISTRATION_AGES.includes(value) || (!enrol && value === "other"),
      enrol ? "Registration is for ages 5–14. Please ask about a trial instead." : "Choose your child’s age."),
    community: text("your community or locality", 120),
    otherCommunity: optionalText(120),
    sport: z.string().refine(value => REGISTRATION_SPORTS.includes(value), "Choose a sport."),
    ...(enrol ? {
      address: text("your address", 500),
      note: optionalText(500),
    } : {}),
  }).superRefine((data, context) => {
    if (data.community === "Another community" && !data.otherCommunity) {
      context.addIssue({ code: "custom", path: ["otherCommunity"], message: "Enter your society or locality." });
    }
    if (!isSupportedCountry(data.phoneCountry)) return;
    if (!/^\+?[\d ()-]+$/.test(data.phone)) {
      context.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid phone number." });
      return;
    }
    const number = parsePhoneNumberFromString(data.phone, { defaultCountry: data.phoneCountry, extract: false });
    if (!number || !number.isValid() || (data.phoneCountry === "IN" && number.nationalNumber.length !== 10)) {
      context.addIssue({ code: "custom", path: ["phone"], message: data.phoneCountry === "IN" ? "Enter a valid 10-digit Indian phone number." : "Enter a valid phone number for the selected country." });
    } else if (number.country && number.country !== data.phoneCountry) {
      context.addIssue({ code: "custom", path: ["phoneCountry"], message: "Choose the country that matches this phone number." });
    }
  }).transform(({ otherCommunity, ...data }) => ({
    ...data,
    community: data.community === "Another community" ? otherCommunity : data.community,
    phone: parsePhoneNumberFromString(data.phone, { defaultCountry: data.phoneCountry, extract: false }).number,
  }));
}

const schemas = { trial: registrationSchema("trial"), enrol: registrationSchema("enrol") };

/** Shared browser/API contract. Returns canonical data, or throws a ZodError. */
export function parseRegistration(formType, data) {
  const kind = formType === "enroll" ? "enrol" : formType;
  return (Object.hasOwn(schemas, kind) ? schemas[kind] : registrationSchema(formType)).parse(data);
}

export function registrationFieldErrors(formType, values) {
  try { parseRegistration(formType, values); return {}; }
  catch (error) {
    if (!Array.isArray(error.issues)) throw error;
    const errors = {};
    for (const issue of error.issues) {
      const name = String(issue.path[0] || "root");
      if (!Object.hasOwn(errors, name)) errors[name] = issue.message;
    }
    return errors;
  }
}
