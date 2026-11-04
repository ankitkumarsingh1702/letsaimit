var FORM_LINKS = Object.freeze({
  whatsapp: "https://wa.me/918868886074",
  registration: "https://forms.gle/zNEWMbwzLcEiA3Ym8",
  societyEnquiry: "https://forms.gle/H6CmdvR8qxJ4UpVM9",
  privacy: "https://letsaimit.com/privacy-policy",
});
var TRIAL_AGES = Object.freeze(
  Array.from(
    {
      length: 9,
    },
    (unused, index) => String(index + 5),
  ),
);
function createInitialDrafts() {
  return {
    trial: {
      parentName: "",
      phone: "",
      age: "",
      community: "",
    },
    society: {
      societyName: "",
      locality: "",
      contactName: "",
      phone: "",
      message: "",
    },
  };
}
function fieldError(name, value, required = true) {
  let trimmedValue = value.trim();
  if (required && !trimmedValue)
    return name === "age"
      ? "Choose your child’s age."
      : name === "phone"
        ? "Enter a phone number."
        : name === "community"
          ? "Enter your society or locality."
          : name === "societyName"
            ? "Enter your society’s name."
            : name === "locality"
              ? "Enter the locality and city."
              : "Enter your name.";
  if (name === "phone" && trimmedValue) {
    let digits = trimmedValue.replace(/\D/g, "");
    if (
      !/^\+?[\d\s()\-]+$/.test(trimmedValue) ||
      digits.length < 8 ||
      digits.length > 15
    )
      return "Enter a valid phone number, with country code if needed.";
  }
  return name === "age" &&
    trimmedValue &&
    ![...TRIAL_AGES, "other"].includes(trimmedValue)
    ? "Choose your child’s age."
    : "";
}
function visibleFieldNames(mode, societyStep = 1) {
  return mode === "trial"
    ? ["parentName", "phone", "age", "community"]
    : mode === "society"
      ? societyStep === 1
        ? ["societyName", "locality"]
        : ["contactName", "phone", "message"]
      : [];
}
function validateForm(mode, draft, societyStep = 1) {
  return Object.fromEntries(
    visibleFieldNames(mode, societyStep).map((name) => [
      name,
      fieldError(name, draft[name], name !== "message"),
    ]),
  );
}
function prepareMessage(mode, draft) {
  return mode === "trial"
    ? [
        "Hi Coach Dhiraj, I’d like to ask about a free LetsAimIt trial.",
        `Parent/guardian: ${draft.parentName.trim()}`,
        `Phone: ${draft.phone.trim()}`,
        `Child’s age: ${draft.age === "other" ? "Under 5 or over 13 — please advise on a suitable group" : `${draft.age} years`}`,
        `Community: ${draft.community.trim()}`,
        "Please tell me which football, basketball or fitness session is suitable, and the current timing.",
      ].join("\n")
    : [
        "Hi Coach Dhiraj, I’d like to discuss football, basketball and fitness sessions in our society.",
        `Society: ${draft.societyName.trim()}`,
        `Location: ${draft.locality.trim()}`,
        `Contact: ${draft.contactName.trim()}`,
        `Phone: ${draft.phone.trim()}`,
        ...(draft.message.trim() ? [`Message: ${draft.message.trim()}`] : []),
      ].join("\n");
}
function createWhatsAppUrl(mode, draft) {
  return `${FORM_LINKS.whatsapp}?text=${encodeURIComponent(prepareMessage(mode, draft))}`;
}
export {
  FORM_LINKS,
  TRIAL_AGES,
  createInitialDrafts,
  fieldError,
  visibleFieldNames,
  validateForm,
  prepareMessage,
  createWhatsAppUrl,
};
