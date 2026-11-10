import * as React from "react";
import { captureReviewDraft, reviewDraftChanged, REVIEW_OPTIONS } from "./review-contract.js";
import { formatIST } from "./admin-model.js";
import { formatMoney } from "../billing/billingData.js";
import { DEFAULT_MONTHLY_FEE_PAISE, monthlyFeeInput, parseMonthlyFeeInput } from "../billing/fee-model.js";

/** Navigation never approves. An enrolment fee is explicit and saved with its review revision. */
export default function ReviewDecision({ row, initialDecision, canReview, onReview, onBusyChange }) {
  const enrol = row.formType === "enrol";
  const hasQuoteConsent = row.billing?.consentGiven === true && row.billing?.pricingModel === "custom_quote";
  const needsConsent = enrol && !hasQuoteConsent;
  const [draft, setDraft] = React.useState(() => initialDecision === "declined" || initialDecision === "accepted" && !needsConsent ? captureReviewDraft(row, initialDecision) : null);
  const choice = draft?.decision || null;
  const changed = reviewDraftChanged(draft, row);
  const [fee, setFee] = React.useState(() => monthlyFeeInput(DEFAULT_MONTHLY_FEE_PAISE));
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const sequence = React.useRef(0);
  const lock = React.useRef(false);
  const feeInput = React.useRef(null);
  const prefix = React.useId();
  let amountPaise = null;
  let feeError = "";
  try { amountPaise = parseMonthlyFeeInput(fee); } catch (cause) { feeError = cause.message; }
  React.useEffect(() => {
    ++sequence.current;
    setDraft(initialDecision === "declined" || initialDecision === "accepted" && !needsConsent ? captureReviewDraft(row, initialDecision) : null);
    setFee(monthlyFeeInput(DEFAULT_MONTHLY_FEE_PAISE)); setTouched(false); setError("");
    return () => { ++sequence.current; };
  }, [row.id, initialDecision, needsConsent]);
  async function confirm() {
    if (!canReview || lock.current || !choice || changed || row.reviewDecision !== "pending") return;
    if (choice === "accepted" && enrol && (needsConsent || feeError)) { setTouched(true); feeInput.current?.focus(); return; }
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy(true); setError(""); onBusyChange?.(true);
    try {
      const result = await onReview(draft.id, choice, draft.expectedRevision, choice === "accepted" && enrol ? amountPaise : null);
      if (sequence.current !== ticket) return;
      if (!result?.ok) setError(result?.error || "Couldn’t confirm. Refresh the request.");
      else setDraft(null);
    } catch {
      if (sequence.current === ticket) setError("Couldn’t confirm. Check your connection and retry.");
    } finally {
      lock.current = false;
      if (sequence.current === ticket) { setBusy(false); onBusyChange?.(false); }
    }
  }
  const decided = row.reviewDecision !== "pending";
  return <section className="adm-detail-section adm-review" aria-labelledby={`${prefix}-title`}>
    <div className="adm-detail-section-heading"><h3 id={`${prefix}-title`}>Review</h3><span className="adm-detail-edit-state">{REVIEW_OPTIONS.find(item => item.value === row.reviewDecision)?.label || "Pending review"}</span></div>
    {decided ? <p className="adm-review-note">{row.reviewDecision === "accepted" ? "Accepted" : "Declined"}{row.reviewedAt ? ` · ${formatIST(row.reviewedAt)} IST` : ""}. {row.reviewDecision === "accepted" && (enrol ? "View invoices in Billing." : "Free trial.")}</p> : <>
      {!enrol && <p className="adm-review-note">Free trial. No fee.</p>}
      {needsConsent && <p className="adm-review-note">New consent needed. Ask the parent to send a new enrolment.</p>}
      {!canReview && <p className="adm-review-note">Save or cancel your edits first.</p>}
      {changed && !decided && <p className="adm-detail-error" role="status">Request changed. Your fee draft is kept. <button type="button" className="adm-text-button" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>Review latest</button></p>}
      {choice ? <div className="adm-review-confirm" role="group" aria-label="Confirm request review">
        {choice === "accepted" && enrol ? <>
          <label className="adm-review-fee" htmlFor={`${prefix}-fee`}><span>Monthly fee · INR</span><div><span aria-hidden="true">₹</span><input ref={feeInput} id={`${prefix}-fee`} inputMode="decimal" autoComplete="off" maxLength={9} value={fee} required disabled={busy} aria-invalid={touched && feeError ? true : undefined} aria-describedby={`${prefix}-fee-note${touched && feeError ? ` ${prefix}-fee-error` : ""}`} onBlur={() => setTouched(true)} onChange={event => { setFee(event.target.value); setTouched(true); setError(""); }} /></div></label>
          <p className="adm-review-note" id={`${prefix}-fee-note`}>Quoted fee. Parent pays on Razorpay.</p>
          {touched && feeError && <p className="adm-detail-error" id={`${prefix}-fee-error`} role="alert">{feeError}</p>}
          <p>Approve {row.parentName}’s enrolment{amountPaise !== null ? ` at ${formatMoney(amountPaise)}/month` : ""}?</p>
        </> : <p>{choice === "accepted" ? "Accept" : "Decline"} {row.parentName}’s {enrol ? "enrolment" : "trial"}?</p>}
        <div className="adm-detail-footer-actions"><button type="button" className="adm-detail-button adm-detail-button--quiet" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>Cancel</button><button type="button" className="adm-detail-button adm-detail-button--primary" disabled={busy || changed || !canReview || choice === "accepted" && enrol && (needsConsent || Boolean(feeError))} onClick={confirm}>{busy ? "Saving…" : choice === "accepted" && enrol && amountPaise !== null ? `Approve · ${formatMoney(amountPaise)}/month` : choice === "accepted" ? "Confirm acceptance" : "Confirm decline"}</button></div>
      </div> : <div className="adm-review-actions"><button type="button" className="adm-detail-button adm-detail-button--primary" disabled={!canReview || busy || needsConsent} onClick={() => setDraft(captureReviewDraft(row, "accepted"))}>Accept</button><button type="button" className="adm-detail-button adm-detail-button--quiet" disabled={!canReview || busy} onClick={() => setDraft(captureReviewDraft(row, "declined"))}>Decline</button></div>}
    </>}
    {error && <p className="adm-detail-error" role="alert">{error}</p>}
  </section>;
}
