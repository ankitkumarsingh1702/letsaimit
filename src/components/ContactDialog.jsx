import * as React from "react";
import { createInitialDrafts } from "../lib/formLogic.js";
import { fieldError } from "../lib/formLogic.js";
import { validateForm } from "../lib/formLogic.js";
import { createWhatsAppUrl } from "../lib/formLogic.js";
import { TRIAL_AGES } from "../lib/formLogic.js";
import { FORM_LINKS } from "../lib/formLogic.js";
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
  let dialogRef = React.useRef(null),
    headingRef = React.useRef(null),
    fieldRefs = React.useRef({}),
    [drafts, setDrafts] = React.useState(createInitialDrafts),
    [societyStep, setSocietyStep] = React.useState(1),
    [errors, setErrors] = React.useState({}),
    [handoffUrl, setHandoffUrl] = React.useState(""),
    mode = kind || "trial";
  React.useLayoutEffect(() => {
    let dialog = dialogRef.current;
    if (!kind) {
      dialog.open && dialog.close();
      document.body.classList.remove("form-open");
      return;
    }
    setErrors({});
    setHandoffUrl("");
    document.body.classList.add("form-open");
    dialog.open || dialog.showModal();
    dialog.scrollTop = 0;
    let focusFrame = requestAnimationFrame(() => {
      dialog.open &&
        headingRef.current?.focus({
          preventScroll: true,
        });
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [kind, societyStep]);
  React.useLayoutEffect(
    () => () => {
      document.body.classList.remove("form-open");
    },
    [],
  );
  function handleChange(name, value) {
    setDrafts((previousDrafts) => ({
      ...previousDrafts,
      [mode]: {
        ...previousDrafts[mode],
        [name]: value,
      },
    }));
    setErrors((previousErrors) =>
      previousErrors[name]
        ? {
            ...previousErrors,
            [name]: fieldError(name, value, name !== "message"),
          }
        : previousErrors,
    );
    setHandoffUrl("");
  }
  function handleSubmit(event) {
    event.preventDefault();
    let nextErrors = validateForm(mode, drafts[mode], societyStep);
    setErrors(nextErrors);
    let firstInvalidField = Object.keys(nextErrors).find(
      (name) => nextErrors[name],
    );
    if (firstInvalidField) {
      fieldRefs.current[firstInvalidField]?.focus();
      return;
    }
    if (mode === "society" && societyStep === 1) {
      setSocietyStep(2);
      return;
    }
    let url = createWhatsAppUrl(mode, drafts[mode]);
    setHandoffUrl(url);
    window.open(url, "_blank", "noopener,noreferrer");
  }
  function handleBackdropClick(event) {
    if (event.target !== event.currentTarget) return;
    let bounds = event.currentTarget.getBoundingClientRect();
    (event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom) &&
      onClose();
  }
  function fieldProps(name) {
    return {
      mode,
      name,
      value: drafts[mode][name],
      onChange: handleChange,
      error: errors[name],
      inputRef: (element) => {
        fieldRefs.current[name] = element;
      },
    };
  }
  return (
    <dialog
      ref={dialogRef}
      id="contact-dialog"
      className="contact-dialog"
      aria-labelledby="fm-dialog-title"
      data-mode={mode}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        dialogRef.current?.open ||
          (document.body.classList.remove("form-open"), kind && onClose());
      }}
      onClick={handleBackdropClick}
    >
      <div className="fm-shell">
        <button
          className="fm-close"
          type="button"
          data-form-action="close"
          aria-label="Close enquiry panel"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <FormSidebar mode={mode} societyStep={societyStep} />
        {mode === "trial" && (
          <div className="fm-content">
            <div className="fm-content-top">
              <h3 ref={headingRef} className="fm-main-heading" tabIndex={-1}>
                Your details
              </h3>
              <p className="fm-intro">The coach will help you find a time.</p>
            </div>
            <form
              className="fm-form"
              data-form-mode="trial"
              noValidate={true}
              onSubmit={handleSubmit}
            >
              <div className="fm-fields">
                <TextField
                  {...fieldProps("parentName")}
                  label="Parent or guardian name"
                  autoComplete="name"
                  placeholder="Your name"
                  max={80}
                />
                <TextField
                  {...fieldProps("phone")}
                  label="Parent phone number"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  max={24}
                />
                <div className="fm-field">
                  <label htmlFor="fm-trial-age">Child’s age</label>
                  <div className="fm-select-wrap">
                    <select
                      ref={(element) => {
                        fieldRefs.current.age = element;
                      }}
                      id="fm-trial-age"
                      name="age"
                      data-field="age"
                      required={true}
                      aria-describedby="fm-trial-age-error fm-age-note"
                      aria-invalid={errors.age ? "true" : void 0}
                      value={drafts.trial.age}
                      onChange={(event) =>
                        handleChange("age", event.target.value)
                      }
                    >
                      <option value="">Choose age</option>
                      {TRIAL_AGES.map((age) => (
                        <option value={age} key={age}>
                          {age}
                          {" years"}
                        </option>
                      ))}
                      <option value="other">Under 5 or over 13</option>
                    </select>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="m7 10 5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <span id="fm-trial-age-error" className="fm-error">
                    {errors.age || ""}
                  </span>
                  <span
                    id="fm-age-note"
                    className="fm-hint"
                    hidden={drafts.trial.age !== "other"}
                  >
                    The coach can help you check for a suitable group.
                  </span>
                </div>
                <TextField
                  {...fieldProps("community")}
                  label="Community"
                  placeholder="Your society or locality"
                  max={120}
                />
              </div>
              <div className="fm-form-footer">
                <p className="fm-handoff-note">
                  Review and send your message in WhatsApp.
                </p>
                <button className="fm-primary" type="submit">
                  <span data-trial-button-label="">
                    {drafts.trial.age === "other"
                      ? "Ask the coach in WhatsApp"
                      : "Continue in WhatsApp"}
                  </span>
                  <FormArrow />
                </button>
                <HandoffResult url={handoffUrl} />
                <button
                  className="fm-text-button"
                  type="button"
                  data-form-action="enroll"
                  onClick={() => onSwitchKind("enroll")}
                >
                  {"Ready to join? Enroll your child "}
                  <FormArrow />
                </button>
              </div>
            </form>
            <a
              className="fm-privacy"
              href={FORM_LINKS.privacy}
              target="_blank"
              rel="noopener noreferrer"
            >
              {"Privacy policy "}
              <FormArrow />
            </a>
          </div>
        )}
        {mode === "society" && (
          <div className="fm-content">
            <div className="fm-content-top">
              <p className="fm-mobile-step">
                {"Step "}
                {societyStep}
                {" of 2"}
              </p>
              <h3 ref={headingRef} className="fm-main-heading" tabIndex={-1}>
                {societyStep === 1 ? "Your society" : "Your contact details"}
              </h3>
              <p className="fm-intro">
                {societyStep === 1
                  ? "Tell us where you’d like to play."
                  : "Let’s start a conversation."}
              </p>
            </div>
            <form
              className="fm-form"
              data-form-mode="society"
              noValidate={true}
              onSubmit={handleSubmit}
            >
              <div className="fm-fields">
                {societyStep === 1 ? (
                  <>
                    <TextField
                      {...fieldProps("societyName")}
                      label="Society name"
                      placeholder="Your society"
                      full={true}
                      max={120}
                    />
                    <TextField
                      {...fieldProps("locality")}
                      label="Locality and city"
                      placeholder="Locality, city"
                      full={true}
                      max={120}
                    />
                  </>
                ) : (
                  <>
                    <TextField
                      {...fieldProps("contactName")}
                      label="Your name"
                      autoComplete="name"
                      placeholder="Your name"
                      max={80}
                    />
                    <TextField
                      {...fieldProps("phone")}
                      label="Phone number"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+91 98765 43210"
                      max={24}
                    />
                    <div className="fm-field fm-full">
                      <label htmlFor="fm-society-message">
                        {"Anything to add? "}
                        <span className="fm-optional">(optional)</span>
                      </label>
                      <textarea
                        ref={(element) => {
                          fieldRefs.current.message = element;
                        }}
                        id="fm-society-message"
                        name="message"
                        data-field="message"
                        maxLength={500}
                        rows={3}
                        placeholder="Tell us about your playing space or interested families."
                        value={drafts.society.message}
                        onChange={(event) =>
                          handleChange("message", event.target.value)
                        }
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="fm-form-footer">
                {societyStep === 2 && (
                  <p className="fm-handoff-note">
                    Review and send your message in WhatsApp.
                  </p>
                )}
                <div className="fm-actions">
                  {societyStep === 2 && (
                    <button
                      className="fm-back"
                      type="button"
                      data-form-action="back"
                      onClick={() => setSocietyStep(1)}
                    >
                      Back
                    </button>
                  )}
                  <button className="fm-primary" type="submit">
                    {societyStep === 1 ? "Next" : "Continue in WhatsApp"}
                    <FormArrow />
                  </button>
                </div>
                <HandoffResult url={handoffUrl} />
                <a
                  className="fm-alternative"
                  href={FORM_LINKS.societyEnquiry}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {"Use the society enquiry form "}
                  <FormArrow />
                </a>
              </div>
            </form>
          </div>
        )}
        {mode === "enroll" && (
          <div className="fm-content fm-enrollment">
            <div className="fm-content-top">
              <h3 ref={headingRef} className="fm-main-heading" tabIndex={-1}>
                A place to play and grow.
              </h3>
              <p className="fm-intro">
                Complete your details in the LetsAimIt registration form.
              </p>
            </div>
            <div className="fm-enroll-facts">
              <p>
                <span>Sessions</span>
                <strong>2 each week</strong>
              </p>
              <p>
                <span>Duration</span>
                <strong>45–60 minutes</strong>
              </p>
              <p>
                <span>Communities</span>
                <strong>
                  Nambiar Ellegenza
                  <br />
                  Nambiar Bellezea
                </strong>
              </p>
            </div>
            <p className="fm-enroll-note">
              The coach will confirm your community, batch and timing.
            </p>
            <a
              className="fm-primary"
              href={FORM_LINKS.registration}
              target="_blank"
              rel="noopener noreferrer"
            >
              {"Open registration form "}
              <FormArrow />
            </a>
            <button
              className="fm-text-button"
              type="button"
              data-form-action="trial"
              onClick={() => onSwitchKind("trial")}
            >
              {"Try a session first "}
              <FormArrow />
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
export {
  FormArrow,
  CloseIcon,
  TextField,
  FormSidebar,
  HandoffResult,
  ContactDialog,
};
export default ContactDialog;
