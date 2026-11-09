export const FORM_LINKS = Object.freeze({
  whatsapp: "https://wa.me/918868886074",
  registration: "https://forms.gle/zNEWMbwzLcEiA3Ym8",
  societyEnquiry: "https://forms.gle/H6CmdvR8qxJ4UpVM9",
  privacy: "/privacy/",
});
export const TRIAL_AGES = Object.freeze(Array.from({ length: 10 }, (_, index) => String(index + 5)));
export function createInitialDrafts() {
  const parent = { parentName: "", phone: "", age: "", community: "", sport: "" };
  return {
    trial: { ...parent },
    enroll: { ...parent, childName: "" },
    society: { societyName: "", locality: "", contactName: "", phone: "", role: "", childrenCount: "", space: "", message: "" },
  };
}
const messages = {
  parentName: "Enter your name.", childName: "Enter your child’s name.", phone: "Enter a phone number.",
  age: "Choose your child’s age.", community: "Choose your community.", sport: "Choose a sport.",
  societyName: "Enter your society’s name.", locality: "Enter the locality and city.",
  contactName: "Enter your name.", role: "Enter your role.", childrenCount: "Enter an estimate, or Not sure.", space: "Tell us about the available space.",
};
export function fieldError(name, value, required = true) {
  const clean = String(value ?? "").trim();
  if (required && !clean) return messages[name] || "Complete this field.";
  if (clean.length > (name === "message" ? 500 : 120)) return "Please shorten this answer.";
  if (name === "phone" && clean && (!/^\+?[\d\s()\-]+$/.test(clean) || clean.replace(/\D/g, "").length < 8 || clean.replace(/\D/g, "").length > 15)) return "Enter a valid phone number.";
  if (name === "age" && clean && ![...TRIAL_AGES, "other"].includes(clean)) return messages.age;
  if (name === "sport" && clean && !["Football", "Basketball", "Not sure"].includes(clean)) return messages.sport;
  if (name === "childrenCount" && clean && !/^([1-9]\d{0,3}|not sure)$/i.test(clean)) return "Use a number, or Not sure.";
  return "";
}
export function visibleFieldNames(mode, societyStep = 1) {
  if (mode === "society") return societyStep === 1 ? ["societyName", "locality", "childrenCount", "space"] : ["contactName", "phone", "role", "message"];
  return [...(mode === "enroll" ? ["childName"] : []), "parentName", "phone", "age", "community", "sport"];
}
export function validateForm(mode, draft, societyStep = 1) {
  const errors = Object.fromEntries(visibleFieldNames(mode, societyStep).map(name => [name, fieldError(name, draft[name], name !== "message")]));
  if (mode === "enroll" && draft.age === "other") errors.age = "Registration is for ages 5–14. Please ask about a trial instead.";
  return errors;
}
export function prepareMessage(mode, draft) {
  const clean = name => String(draft[name] || "").trim();
  if (mode === "society") return [
    "Hi Coach Dhiraj, I’d like to discuss sport for our society.",
    `Society: ${clean("societyName")}`, `Location: ${clean("locality")}`,
    `Contact: ${clean("contactName")}`, `Role: ${clean("role")}`, `Phone: ${clean("phone")}`,
    `Interested children (estimate): ${clean("childrenCount")}`, `Available space: ${clean("space")}`,
    ...(clean("message") ? [`Message: ${clean("message")}`] : []),
    "Contact consent: agreed. Privacy version: 2026-11-05.",
  ].join("\n");
  return [
    mode === "enroll" ? "Hi Coach Dhiraj, I’d like to enrol my child with LetsAimIt." : "Hi Coach Dhiraj, I’d like to book a first free session with LetsAimIt.",
    `Parent/guardian: ${clean("parentName")}`, `Phone: ${clean("phone")}`,
    ...(mode === "enroll" ? [`Child: ${clean("childName")}`] : []),
    `Child’s age: ${draft.age === "other" ? "Under 5 or over 14 — please advise" : clean("age") + " years"}`,
    `Community: ${clean("community")}`, `Sport: ${clean("sport")}`,
    "Please confirm a suitable group and session time.",
    "Parent/guardian and contact consent: agreed. Privacy version: 2026-11-09.",
    ...(mode === "enroll" ? ["Programme terms and cancellation policy accepted: 2026-11-05."] : []),
  ].join("\n");
}
export function createWhatsAppUrl(mode, draft) { return `${FORM_LINKS.whatsapp}?text=${encodeURIComponent(prepareMessage(mode, draft))}`; }
