const decisions = new Set(["pending", "accepted", "declined"]);
const text = value => typeof value === "string" ? value : "";
const registrationReceiptKey = "letsaimit.parent.registration-received.v1";
const registrationReceiptLifetime = 5 * 60 * 1000;

function receiptStorage() {
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}

/** Carry the confirmed row reference across navigation without putting it in the URL. */
export function rememberParentRegistration({ userId, requestId }, storage = receiptStorage(), now = Date.now()) {
  if (!storage || !userId || !requestId || !Number.isFinite(now)) return false;
  try {
    storage.setItem(registrationReceiptKey, JSON.stringify({ userId, requestId, savedAt: now }));
    return true;
  } catch { return false; }
}

export function takeParentRegistration(userId, storage = receiptStorage(), now = Date.now()) {
  try {
    const raw = storage?.getItem(registrationReceiptKey);
    if (!raw) return null;
    storage.removeItem(registrationReceiptKey);
    const receipt = JSON.parse(raw);
    return receipt?.userId === userId && Number.isFinite(now) && Number.isFinite(receipt.savedAt)
      && now >= receipt.savedAt && now - receipt.savedAt < registrationReceiptLifetime
      && typeof receipt.requestId === "string" && receipt.requestId ? receipt.requestId : null;
  } catch { return null; }
}

export function parentRequestRow(record) {
  if (!record || typeof record.id !== "string" || !record.id || !decisions.has(record.review_decision) || !Number.isFinite(Date.parse(record.created))) throw new Error("The request list could not be confirmed.");
  const meta = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  return { id: record.id, submissionId: text(record.submission_id), submittedAt: record.created,
    reviewDecision: record.review_decision, reviewedAt: record.reviewed_at || null,
    formType: meta.formType === "enrol" ? "enrol" : "trial", childName: text(meta.childName),
    age: text(meta.age), community: text(meta.community), sport: text(meta.sport) };
}

/** Parent reads use the ownership-enforcing RPC, never the private admin table API. */
export async function fetchMyRegistrations({ client, verifyGoogleUser, userId }) {
  const before = await verifyGoogleUser();
  if (!before?.isGoogle || before.id !== userId) throw Object.assign(new Error("Sign in with your Google account to load your requests."), { code: "identity_changed" });
  const { data, error } = await client.rpc("list_my_registrations");
  if (error || !Array.isArray(data)) throw Object.assign(new Error("Your requests could not load. Please retry."), {
    code: ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(error?.code) ? "access_denied" : "request_failed",
  });
  const after = await verifyGoogleUser();
  if (!after?.isGoogle || after.id !== userId) throw Object.assign(new Error("Your Google account changed. Reload your requests."), { code: "identity_changed" });
  return data.map(parentRequestRow);
}
