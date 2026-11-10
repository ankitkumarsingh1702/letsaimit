import { validMonthlyFeePaise } from "../billing/fee-model.js";

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

export function reviewArguments(id, decision, revision, monthlyAmountPaise = null) {
  if (!UUID.test(id || "") || !["accepted", "declined"].includes(decision) || !Number.isSafeInteger(revision) || revision < 1) {
    throw new TypeError("Refresh the saved request before reviewing it.");
  }
  if (monthlyAmountPaise !== null && (decision !== "accepted" || !validMonthlyFeePaise(monthlyAmountPaise))) throw new TypeError("Enter a valid monthly fee.");
  return { p_id: id, p_decision: decision, p_expected_revision: revision, p_monthly_amount_paise: monthlyAmountPaise };
}

export function captureReviewDraft(row, decision) {
  reviewArguments(row.id, decision, row.revision);
  return Object.freeze({ id: row.id, decision, expectedRevision: row.revision });
}

export function reviewDraftChanged(draft, row) {
  return Boolean(draft && (draft.id !== row.id || draft.expectedRevision !== row.revision || row.reviewDecision !== "pending"));
}
