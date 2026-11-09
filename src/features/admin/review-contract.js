export const REVIEW_OPTIONS = [
  { value: "pending", label: "Pending review" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An email link carries navigation intent only. It never authorizes a write. */
export function readReviewIntent(search = "") {
  const params = new URLSearchParams(search);
  const id = params.get("requestId");
  if (!UUID.test(id || "") || params.getAll("requestId").length !== 1) return null;
  const intent = params.getAll("requestedDecision").length === 1 ? params.get("requestedDecision") : null;
  return { id, decision: intent === "accept" ? "accepted" : intent === "decline" ? "declined" : null };
}

export function reviewArguments(id, decision, revision) {
  if (!UUID.test(id || "") || !["accepted", "declined"].includes(decision) || !Number.isSafeInteger(revision) || revision < 1) {
    throw new TypeError("Refresh the saved request before reviewing it.");
  }
  return { p_id: id, p_decision: decision, p_expected_revision: revision };
}
