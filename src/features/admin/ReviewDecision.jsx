import * as React from "react";
import { REVIEW_OPTIONS } from "./review-contract.js";
import { formatIST } from "./admin-model.js";

/** Review is a separate, explicitly confirmed action from follow-up editing. */
export default function ReviewDecision({ row, initialDecision, canReview, onReview, onBusyChange }) {
  const [choice, setChoice] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const sequence = React.useRef(0);
  const lock = React.useRef(false);
  const prefix = React.useId();
  React.useEffect(() => {
    ++sequence.current;
    setChoice(["accepted", "declined"].includes(initialDecision) ? initialDecision : null);
    setError("");
    return () => { ++sequence.current; };
  }, [row.id, initialDecision]);
  async function confirm() {
    if (!canReview || lock.current || !choice || row.reviewDecision !== "pending") return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy(true); setError(""); onBusyChange?.(true);
    try {
      const result = await onReview(row.id, choice, row.revision);
      if (sequence.current !== ticket) return;
      if (!result?.ok) setError(result?.error || "The decision could not be confirmed. Review the latest request before retrying.");
      else setChoice(null);
    } catch {
      if (sequence.current === ticket) setError("The decision could not be confirmed. Please check your connection and retry.");
    } finally {
      lock.current = false;
      if (sequence.current === ticket) { setBusy(false); onBusyChange?.(false); }
    }
  }
  const decided = row.reviewDecision !== "pending";
  return <section className="adm-detail-section adm-review" aria-labelledby={`${prefix}-title`}>
    <div className="adm-detail-section-heading"><h3 id={`${prefix}-title`}>Request review</h3><span className="adm-detail-edit-state">{REVIEW_OPTIONS.find(item => item.value === row.reviewDecision)?.label || "Pending review"}</span></div>
    {decided ? <p className="adm-review-note">{row.reviewDecision === "accepted" ? "Accepted" : "Declined"}{row.reviewedAt ? ` · ${formatIST(row.reviewedAt)} IST` : ""}{row.reviewedBy ? ` · ${row.reviewedBy}` : ""}. {row.reviewDecision === "accepted" && "Payment has not been requested."}</p> : <>
      <p className="adm-review-note">Review this {row.formType === "enrol" ? "enrolment" : "trial"} request. Accepting records the decision; it does not request or collect payment.</p>
      {!canReview && <p className="adm-review-note">Save or cancel your follow-up changes before reviewing.</p>}
      {choice ? <div className="adm-review-confirm" role="group" aria-label="Confirm request review">
        <p>{choice === "accepted" ? "Accept" : "Decline"} this request for {row.parentName}?</p>
        <div className="adm-detail-footer-actions"><button type="button" className="adm-detail-button adm-detail-button--quiet" disabled={busy} onClick={() => { setChoice(null); setError(""); }}>Cancel review</button><button type="button" className="adm-detail-button adm-detail-button--primary" disabled={busy || !canReview} onClick={confirm}>{busy ? "Saving decision…" : choice === "accepted" ? "Confirm acceptance" : "Confirm decline"}</button></div>
      </div> : <div className="adm-review-actions"><button type="button" className="adm-detail-button adm-detail-button--primary" disabled={!canReview || busy} onClick={() => setChoice("accepted")}>Accept</button><button type="button" className="adm-detail-button adm-detail-button--quiet" disabled={!canReview || busy} onClick={() => setChoice("declined")}>Decline</button></div>}
    </>}
    {error && <p className="adm-detail-error" role="alert">{error}</p>}
  </section>;
}
