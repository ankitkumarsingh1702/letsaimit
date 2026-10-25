import { useLayoutEffect, useRef, useState } from 'react';
import {
  FORM_LINKS,
  TRIAL_AGES,
  createInitialDrafts,
  createWhatsAppUrl,
  fieldError,
  validateForm,
} from '../lib/formLogic.js';

function FormArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h15M13 5l7 7-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Field({ mode, name, label, value, onChange, inputRef, error, type = 'text', placeholder = '', autoComplete, full = false, optional = false, max = 100 }) {
  const id = `fm-${mode}-${name}`;
  return (
    <div className={`fm-field${full ? ' fm-full' : ''}`}>
      <label htmlFor={id}>{label}{optional && <> <span className="fm-optional">(optional)</span></>}</label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        data-field={name}
        type={type}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={type === 'tel' ? 'tel' : undefined}
        maxLength={max}
        required={!optional}
        aria-describedby={`${id}-error`}
        aria-invalid={error ? 'true' : undefined}
      />
      <span id={`${id}-error`} className="fm-error">{error || ''}</span>
    </div>
  );
}

function Sidebar({ mode, societyStep }) {
  const content = {
    trial: {
      title: <>Let’s get<br /> playing.</>,
      copy: <>A little football.<br /> A lot to look forward to.</>,
      label: 'Your free trial',
      footer: <>Nambiar Ellegenza<br /> Bengaluru</>,
    },
    society: {
      title: <>Bring the<br /> game home.</>,
      copy: <>Your space.<br /> Our coaching.</>,
      label: 'For your society',
      footer: 'Let’s make room for play.',
    },
    enroll: {
      title: <>Join the<br /> team.</>,
      copy: <>New skills.<br /> New friends.<br /> A game to love.</>,
      label: 'Child registration',
      footer: <>Nambiar Ellegenza<br /> Bengaluru</>,
    },
  }[mode];

  return (
    <aside className="fm-aside">
      <p className="fm-aside-label">{content.label}</p>
      <h2 id="fm-dialog-title" className="fm-title">{content.title}</h2>
      <p className="fm-aside-copy">{content.copy}</p>
      {mode === 'society' && (
        <ol className="fm-step-list" aria-label="Enquiry steps">
          <li aria-current={societyStep === 1 ? 'step' : undefined}><span>{societyStep > 1 ? '✓' : '1'}</span>Your society</li>
          <li aria-current={societyStep === 2 ? 'step' : undefined}><span>2</span>Your details</li>
        </ol>
      )}
      <p className="fm-aside-footer">{content.footer}</p>
    </aside>
  );
}

function HandoffResult({ url }) {
  return (
    <div className="fm-handoff-result" role="status" hidden={!url}>
      {url && <>
        <span>Your message is ready. Review and send it in WhatsApp.</span>
        <a href={url} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>
      </>}
    </div>
  );
}

/**
 * Drafts and the society step deliberately live above the individual views.
 * Keep this component mounted when `kind` is null to preserve them on reopen.
 */
export default function ContactDialog({ kind, onClose, onSwitchKind }) {
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  const fieldRefs = useRef({});
  const [drafts, setDrafts] = useState(createInitialDrafts);
  const [societyStep, setSocietyStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [handoffUrl, setHandoffUrl] = useState('');
  const mode = kind || 'trial';

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!kind) {
      if (dialog.open) dialog.close();
      document.body.classList.remove('form-open');
      return undefined;
    }

    // The original re-render clears validation/results on open or step change.
    setErrors({});
    setHandoffUrl('');
    document.body.classList.add('form-open');
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    const frame = requestAnimationFrame(() => {
      if (dialog.open) headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [kind, societyStep]);

  useLayoutEffect(() => () => {
    document.body.classList.remove('form-open');
  }, []);

  function updateField(name, value) {
    setDrafts((previous) => ({
      ...previous,
      [mode]: { ...previous[mode], [name]: value },
    }));
    setErrors((previous) => previous[name]
      ? { ...previous, [name]: fieldError(name, value, name !== 'message') }
      : previous);
    setHandoffUrl('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateForm(mode, drafts[mode], societyStep);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors).find((name) => nextErrors[name]);
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
      return;
    }
    if (mode === 'society' && societyStep === 1) {
      setSocietyStep(2);
      return;
    }

    const url = createWhatsAppUrl(mode, drafts[mode]);
    setHandoffUrl(url);
    // Open only from this valid, explicit submit gesture. Sending stays in WhatsApp.
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handleBackdropClick(event) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      onClose();
    }
  }

  function fieldProps(name) {
    return {
      mode,
      name,
      value: drafts[mode][name],
      onChange: updateField,
      error: errors[name],
      inputRef: (node) => { fieldRefs.current[name] = node; },
    };
  }

  return (
    <dialog
      ref={dialogRef}
      id="contact-dialog"
      className="contact-dialog"
      aria-labelledby="fm-dialog-title"
      data-mode={mode}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={() => {
        // A queued close event must not unlock a dialog that has already reopened.
        if (!dialogRef.current?.open) {
          document.body.classList.remove('form-open');
          // Respect a native close without firing twice after kind becomes null.
          if (kind) onClose();
        }
      }}
      onClick={handleBackdropClick}
    >
      <div className="fm-shell">
        <button className="fm-close" type="button" data-form-action="close" aria-label="Close enquiry panel" onClick={onClose}><CloseIcon /></button>
        <Sidebar mode={mode} societyStep={societyStep} />

        {mode === 'trial' && (
          <div className="fm-content">
            <div className="fm-content-top">
              <h3 ref={headingRef} className="fm-main-heading" tabIndex={-1}>Your details</h3>
              <p className="fm-intro">The coach will help you find a time.</p>
            </div>
            <form className="fm-form" data-form-mode="trial" noValidate onSubmit={handleSubmit}>
              <div className="fm-fields">
                <Field {...fieldProps('parentName')} label="Parent or guardian name" autoComplete="name" placeholder="Your name" max={80} />
                <Field {...fieldProps('phone')} label="Parent phone number" type="tel" autoComplete="tel" placeholder="+91 98765 43210" max={24} />
                <div className="fm-field">
                  <label htmlFor="fm-trial-age">Child’s age</label>
                  <div className="fm-select-wrap">
                    <select
                      ref={(node) => { fieldRefs.current.age = node; }}
                      id="fm-trial-age"
                      name="age"
                      data-field="age"
                      required
                      aria-describedby="fm-trial-age-error fm-age-note"
                      aria-invalid={errors.age ? 'true' : undefined}
                      value={drafts.trial.age}
                      onChange={(event) => updateField('age', event.target.value)}
                    >
                      <option value="">Choose age</option>
                      {TRIAL_AGES.map((age) => <option key={age} value={age}>{age} years</option>)}
                      <option value="other">Under 5 or over 13</option>
                    </select>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                  <span id="fm-trial-age-error" className="fm-error">{errors.age || ''}</span>
                  <span id="fm-age-note" className="fm-hint" hidden={drafts.trial.age !== 'other'}>The coach can help you check for a suitable group.</span>
                </div>
                <Field {...fieldProps('community')} label="Community" placeholder="Your society or locality" max={120} />
              </div>
              <div className="fm-form-footer">
                <p className="fm-handoff-note">Review and send your message in WhatsApp.</p>
                <button className="fm-primary" type="submit"><span data-trial-button-label="">{drafts.trial.age === 'other' ? 'Ask the coach in WhatsApp' : 'Continue in WhatsApp'}</span><FormArrow /></button>
                <HandoffResult url={handoffUrl} />
                <button className="fm-text-button" type="button" data-form-action="enroll" onClick={() => onSwitchKind('enroll')}>Ready to join? Enroll your child <FormArrow /></button>
              </div>
            </form>
            <a className="fm-privacy" href={FORM_LINKS.privacy} target="_blank" rel="noopener noreferrer">Privacy policy <FormArrow /></a>
          </div>
        )}

        {mode === 'society' && (
          <div className="fm-content">
            <div className="fm-content-top">
              <p className="fm-mobile-step">Step {societyStep} of 2</p>
              <h3 ref={headingRef} className="fm-main-heading" tabIndex={-1}>{societyStep === 1 ? 'Your society' : 'Your contact details'}</h3>
              <p className="fm-intro">{societyStep === 1 ? 'Tell us where you’d like to play.' : 'Let’s start a conversation.'}</p>
            </div>
            <form className="fm-form" data-form-mode="society" noValidate onSubmit={handleSubmit}>
              <div className="fm-fields">
                {societyStep === 1 ? <>
                  <Field {...fieldProps('societyName')} label="Society name" placeholder="Your society" full max={120} />
                  <Field {...fieldProps('locality')} label="Locality and city" placeholder="Locality, city" full max={120} />
                </> : <>
                  <Field {...fieldProps('contactName')} label="Your name" autoComplete="name" placeholder="Your name" max={80} />
                  <Field {...fieldProps('phone')} label="Phone number" type="tel" autoComplete="tel" placeholder="+91 98765 43210" max={24} />
                  <div className="fm-field fm-full">
                    <label htmlFor="fm-society-message">Anything to add? <span className="fm-optional">(optional)</span></label>
                    <textarea
                      ref={(node) => { fieldRefs.current.message = node; }}
                      id="fm-society-message"
                      name="message"
                      data-field="message"
                      maxLength={500}
                      rows={3}
                      placeholder="Tell us about your playing space or interested families."
                      value={drafts.society.message}
                      onChange={(event) => updateField('message', event.target.value)}
                    />
                  </div>
                </>}
              </div>
              <div className="fm-form-footer">
                {societyStep === 2 && <p className="fm-handoff-note">Review and send your message in WhatsApp.</p>}
                <div className="fm-actions">
                  {societyStep === 2 && <button className="fm-back" type="button" data-form-action="back" onClick={() => setSocietyStep(1)}>Back</button>}
                  <button className="fm-primary" type="submit">{societyStep === 1 ? 'Next' : 'Continue in WhatsApp'}<FormArrow /></button>
                </div>
                <HandoffResult url={handoffUrl} />
                <a className="fm-alternative" href={FORM_LINKS.societyEnquiry} target="_blank" rel="noopener noreferrer">Use the society enquiry form <FormArrow /></a>
              </div>
            </form>
          </div>
        )}

        {mode === 'enroll' && (
          <div className="fm-content fm-enrollment">
            <div className="fm-content-top">
              <h3 ref={headingRef} className="fm-main-heading" tabIndex={-1}>A place to play and grow.</h3>
              <p className="fm-intro">Complete your details in the LetsAimIt registration form.</p>
            </div>
            <div className="fm-enroll-price"><strong>₹5,000</strong><span>/ month</span></div>
            <div className="fm-enroll-facts">
              <p><span>Sessions</span><strong>2 each week</strong></p>
              <p><span>Duration</span><strong>45–60 minutes</strong></p>
              <p><span>Location</span><strong>Nambiar Ellegenza</strong></p>
            </div>
            <p className="fm-enroll-note">The coach confirms your batch and payment details.</p>
            <a className="fm-primary" href={FORM_LINKS.registration} target="_blank" rel="noopener noreferrer">Open registration form <FormArrow /></a>
            <button className="fm-text-button" type="button" data-form-action="trial" onClick={() => onSwitchKind('trial')}>Try a session first <FormArrow /></button>
          </div>
        )}
      </div>
    </dialog>
  );
}
