import ParentRegistration from "../features/registration/ParentRegistration.jsx";
import LeadConsent from "./LeadConsent.jsx";
import { leadCaptureConfigured, saveLead, newSubmissionId } from "../lib/leadCapture.js";
import { trackEvent } from "../lib/analytics.js";
import * as React from "react";
import { createInitialDrafts } from "../lib/formLogic.js";
import { fieldError } from "../lib/formLogic.js";
import { validateForm } from "../lib/formLogic.js";
import { createWhatsAppUrl } from "../lib/formLogic.js";
function FormArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12h15M13 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function TextField({
  mode,
  name,
  label,
  value,
  onChange,
  inputRef,
  error,
  type = "text",
  placeholder = "",
  autoComplete,
  full = false,
  optional = false,
  max = 100,
}) {
  let inputId = `fm-${mode}-${name}`;
  return (
    <div className={`fm-field${full ? " fm-full" : ""}`}>
      <label htmlFor={inputId}>
        {label}
        {optional && (
          <>
            {" "}
            <span className="fm-optional">(optional)</span>
          </>
        )}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        data-field={name}
        type={type}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={type === "tel" ? "tel" : void 0}
        maxLength={max}
        required={!optional}
        aria-describedby={`${inputId}-error`}
        aria-invalid={error ? "true" : void 0}
      />
      <span id={`${inputId}-error`} className="fm-error">
        {error || ""}
      </span>
    </div>
  );
}
function FormSidebar({ mode, societyStep }) {
  let content = {
    trial: {
      title: (
        <>
          Let’s get
          <br />
          {" playing."}
        </>
      ),
      copy: (
        <>
          Football. Basketball. Fitness.
          <br />
          {" A lot to look forward to."}
        </>
      ),
      label: "Your free trial",
      footer: (
        <>
          Nambiar Ellegenza
          <br />
          Nambiar Bellezea
          <br />
          Bengaluru
        </>
      ),
    },
    society: {
      title: (
        <>
          Bring the
          <br />
          {" game home."}
        </>
      ),
      copy: (
        <>
          Your space.
          <br />
          {" Our coaching."}
        </>
      ),
      label: "For your society",
      footer: "Let’s make room for play.",
    },
    enroll: {
      title: (
        <>
          Join the
          <br />
          {" team."}
        </>
      ),
      copy: (
        <>
          New skills.
          <br />
          {" New friends."}
          <br />
          {" More ways to move."}
        </>
      ),
      label: "Child registration",
      footer: (
        <>
          Nambiar Ellegenza
          <br />
          Nambiar Bellezea
          <br />
          Bengaluru
        </>
      ),
    },
  }[mode];
  return (
    <aside className="fm-aside">
      <p className="fm-aside-label">{content.label}</p>
      <h2 id="fm-dialog-title" className="fm-title">
        {content.title}
      </h2>
      <p className="fm-aside-copy">{content.copy}</p>
      {mode === "society" && (
        <ol className="fm-step-list" aria-label="Enquiry steps">
          <li aria-current={societyStep === 1 ? "step" : void 0}>
            <span>{societyStep > 1 ? "✓" : "1"}</span>Your society
          </li>
          <li aria-current={societyStep === 2 ? "step" : void 0}>
            <span>2</span>Your details
          </li>
        </ol>
      )}
      <p className="fm-aside-footer">{content.footer}</p>
    </aside>
  );
}
function HandoffResult({ url }) {
  return (
    <div className="fm-handoff-result" role="status" hidden={!url}>
      {url && (
        <>
          <span>Your message is ready. Review and send it in WhatsApp.</span>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open WhatsApp
          </a>
        </>
      )}
    </div>
  );
}
function ContactDialog({ kind, onClose, onSwitchKind }) {
  const dialogRef = React.useRef(null);
  const parentForms = React.useRef({});
  const headingRef = React.useRef(null);
  const fieldRefs = React.useRef({});
  const submissionIds = React.useRef({});
  const requestGeneration = React.useRef(0);
  const [drafts, setDrafts] = React.useState(createInitialDrafts);
  const [consents, setConsents] = React.useState({ trial: false, enroll: false, society: false });
  const [terms, setTerms] = React.useState(false);
  const [societyStep, setSocietyStep] = React.useState(1);
  const [errors, setErrors] = React.useState({});
  const [handoffUrl, setHandoffUrl] = React.useState("");
  const [status, setStatus] = React.useState("idle");
  const [saveError, setSaveError] = React.useState("");
  const mode = kind || "trial";
  const finalStep = mode !== "society" || societyStep === 2;
  const isParent = mode !== "society";

  React.useLayoutEffect(() => {
    requestGeneration.current += 1;
    const dialog = dialogRef.current;
    if (!kind) {
      if (dialog.open) dialog.close();
      document.body.classList.remove("form-open");
      return;
    }
    setErrors({}); setSaveError(""); setHandoffUrl(""); setStatus("idle");
    document.body.classList.add("form-open");
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => { cancelAnimationFrame(frame); requestGeneration.current += 1; };
  }, [kind]);
  React.useEffect(() => {
    if (dialogRef.current?.open) dialogRef.current.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [societyStep]);
  React.useEffect(() => () => document.body.classList.remove("form-open"), []);
  React.useEffect(() => {
    if (kind === "enroll" && parentForms.current.trial && parentForms.current.enroll) {
      parentForms.current.enroll.carryTrial(parentForms.current.trial.getValues());
    }
  }, [kind]);

  function handleChange(name, value) {
    setDrafts(previous => ({ ...previous, [mode]: { ...previous[mode], [name]: value } }));
    setErrors(previous => ({ ...previous, [name]: "" }));
    setSaveError(""); setHandoffUrl(""); setStatus("idle");
    delete submissionIds.current[mode];
  }
  function changeConsent(value) {
    setConsents(previous => ({ ...previous, [mode]: value }));
    setErrors(previous => ({ ...previous, consent: "" }));
    setStatus("idle"); setHandoffUrl(""); setSaveError(""); delete submissionIds.current[mode];
  }
  function checkConsent(nextErrors) {
    if (!consents[mode]) nextErrors.consent = isParent ? "Please confirm that you are the parent or guardian and agree." : "Please agree before continuing.";
    if (mode === "enroll" && !terms) nextErrors.terms = "Please read and accept the programme terms.";
  }
  function focusError(nextErrors) {
    const field = Object.keys(nextErrors).find(name => nextErrors[name]);
    if (field) fieldRefs.current[field]?.focus();
    return Boolean(field);
  }
  async function handleSubmit(event) {
    event.preventDefault();
    if (status === "saving") return;
    const nextErrors = validateForm(mode, drafts[mode], societyStep);
    if (finalStep) checkConsent(nextErrors);
    setErrors(nextErrors);
    if (focusError(nextErrors)) return;
    if (!finalStep) { setSocietyStep(2); return; }
    const url = createWhatsAppUrl(mode, drafts[mode]);
    setHandoffUrl(url); setSaveError("");
    if (!leadCaptureConfigured) {
      trackEvent("whatsapp_click");
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setStatus("saving");
    const id = submissionIds.current[mode] ||= newSubmissionId();
    const generation = requestGeneration.current;
    try {
      await saveLead(mode === "enroll" ? "enrol" : mode, drafts[mode], {
        agreed: true, guardian: isParent, terms: mode === "enroll" && terms,
      }, id);
      if (requestGeneration.current === generation) setStatus("saved");
    } catch (error) { if (requestGeneration.current === generation) { setSaveError(error.message); setStatus("error"); } }
  }
  function fieldProps(name) {
    return { mode, name, value: drafts[mode][name], onChange: handleChange, error: errors[name], inputRef: element => { fieldRefs.current[name] = element; } };
  }
  function consentControls() {
    return <>
      <LeadConsent id={`fm-${mode}-consent`} checked={consents[mode]} onChange={changeConsent} guardian={isParent} error={errors.consent} inputRef={element => { fieldRefs.current.consent = element; }} />
      {mode === "enroll" && <div>
        <label className="fm-consent"><input type="checkbox" checked={terms} onChange={event => { setTerms(event.target.checked); setErrors(previous => ({ ...previous, terms: "" })); setStatus("idle"); setHandoffUrl(""); setSaveError(""); delete submissionIds.current.enroll; }} ref={element => { fieldRefs.current.terms = element; }} aria-describedby={errors.terms ? "fm-terms-error" : undefined} aria-invalid={errors.terms ? true : undefined} />
          <span>I accept the <a href="/terms/" target="_blank" rel="noopener noreferrer">programme terms</a> and <a href="/refunds/" target="_blank" rel="noopener noreferrer">cancellation policy</a>. Paid enrolment is non-refundable for personal absence or withdrawal.</span></label>
        {errors.terms && <p id="fm-terms-error" className="fm-consent-error">{errors.terms}</p>}
      </div>}
    </>;
  }
  function result() {
    if (status === "saved") return <div className="fm-success" role="status"><h4>Thank you. Details saved.</h4><p>We’ll be in touch to confirm the next step.</p><a href={handoffUrl} target="_blank" rel="noopener noreferrer">Continue in WhatsApp</a><p className="fm-handoff-note">Opens WhatsApp with a pre-filled message.</p></div>;
    if (saveError) return <div className="fm-save-error" role="alert"><p>{saveError}</p><a href={handoffUrl} target="_blank" rel="noopener noreferrer">Contact us in WhatsApp</a><p>Send the message to share your details.</p></div>;
    if (!leadCaptureConfigured) return <HandoffResult url={handoffUrl} />;
    return null;
  }
  return <dialog ref={dialogRef} id="contact-dialog" className="contact-dialog" aria-labelledby="fm-dialog-title" data-mode={mode}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClose={() => { document.body.classList.remove("form-open"); if (kind && !dialogRef.current?.open) onClose(); }}
    onClick={event => { if (event.target !== event.currentTarget) return; const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); }}>
    <div className="fm-shell">
      <button className="fm-close" type="button" aria-label="Close enquiry panel" onClick={onClose}><CloseIcon /></button>
      <FormSidebar mode={mode} societyStep={societyStep} />
      <div className="fm-content">
        <div className="fm-content-top">
          {mode === "society" && <p className="fm-mobile-step">Step {societyStep} of 2</p>}
          <h3 ref={headingRef} className="fm-main-heading" tabIndex={-1}>{mode === "society" ? societyStep === 1 ? "Your society" : "Your contact details" : mode === "enroll" ? "Join the programme." : "Your first session. Free."}</h3>
          <p className="fm-intro">{mode === "society" ? "Make room for play." : mode === "enroll" ? "Register with a parent or guardian." : "Choose a sport. We’ll confirm a time."}</p>
        </div>
        <ParentRegistration ref={form => { parentForms.current.trial = form; }} mode="trial" active={kind === "trial"} onSwitchKind={onSwitchKind} Arrow={FormArrow} />
        <ParentRegistration ref={form => { parentForms.current.enroll = form; }} mode="enroll" active={kind === "enroll"} onSwitchKind={onSwitchKind} Arrow={FormArrow} />
        {!isParent &&<form className="fm-form" data-form-mode={mode} noValidate onSubmit={handleSubmit}>
          <fieldset className="fm-fieldset" disabled={status === "saving"}>
            <div className="fm-fields">
              {societyStep === 1 ? <>
                <TextField {...fieldProps("societyName")} label="Society name" full max={120} />
                <TextField {...fieldProps("locality")} label="Locality and city" full max={120} />
                <TextField {...fieldProps("childrenCount")} label="Interested children" placeholder="Estimate, or Not sure" max={20} />
                <TextField {...fieldProps("space")} label="Available space" placeholder="Court, ground or Not sure" max={120} />
              </> : <>
                <TextField {...fieldProps("contactName")} label="Your name" autoComplete="name" max={80} />
                <TextField {...fieldProps("phone")} label="Phone number" type="tel" autoComplete="tel" max={24} />
                <TextField {...fieldProps("role")} label="Your role" placeholder="Committee, resident or manager" full max={80} />
                <div className="fm-field fm-full"><label htmlFor="fm-society-message">Anything to add? <span className="fm-optional">(optional)</span></label><textarea id="fm-society-message" name="message" value={drafts.society.message} onChange={event => handleChange("message", event.target.value)} maxLength={500} rows={3} /><span className="fm-error">{errors.message || ""}</span></div>
              </>}
            </div>
            <div className="fm-form-footer">
              {finalStep && consentControls()}
              {status !== "saved" && <>
                {finalStep && <p className="fm-handoff-note">{leadCaptureConfigured ? "Save your details. Then chat, if you like." : "Opens WhatsApp with a pre-filled message. Send it to share your details."}</p>}
                <div className="fm-actions">
                  {mode === "society" && societyStep === 2 && <button className="fm-back" type="button" onClick={() => { setSocietyStep(1); setErrors({}); }}>Back</button>}
                  <button className="fm-primary" type="submit" disabled={status === "saving"}><span>{!finalStep ? "Next" : status === "saving" ? "Saving…" : leadCaptureConfigured ? saveError ? "Retry save" : mode === "enroll" ? "Send registration" : "Send enquiry" : "Continue in WhatsApp"}</span><FormArrow /></button>
                </div>
              </>}
              {result()}
            </div>
          </fieldset>
        </form>}
      </div>
    </div>
  </dialog>;
}
export { FormArrow, CloseIcon, TextField, FormSidebar, HandoffResult, ContactDialog };
export default ContactDialog;
