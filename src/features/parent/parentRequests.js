const decisions = new Set(["pending", "accepted", "declined"]);
const text = value => typeof value === "string" ? value : "";

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
  if (!before?.isGoogle || before.id !== userId) throw new Error("Sign in with your Google account to load your requests.");
  const { data, error } = await client.rpc("list_my_registrations");
  if (error || !Array.isArray(data)) throw new Error("Your requests could not load. Please retry.");
  const after = await verifyGoogleUser();
  if (!after?.isGoogle || after.id !== userId) throw new Error("Your Google account changed. Reload your requests.");
  return data.map(parentRequestRow);
}
