import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { createWhatsAppUrl } from "../../lib/formLogic.js";
import { newSubmissionId, saveRegistration } from "../../lib/leadCapture.js";
import { parseRegistration, REGISTRATION_AGES, REGISTRATION_COMMUNITIES, REGISTRATION_SPORTS } from "../../lib/registrationSchema.js";
import { carryTrialToEnrol, createRegistrationDraft, nationalPhoneLimit, sanitizePhoneInput } from "./registrationDraft.js";
import { firstInvalidRegistrationField, parentRegistrationResolver } from "./registrationResolver.js";
import CountryCombobox from "./CountryCombobox.jsx";
import { useAdminAuth } from "../../context/AdminAuth.jsx";
import { storeRegistrationDraft, consumeRegistrationDraft, clearRegistrationDraft, clearRegistrationDrafts, shouldClearBoundRegistration, canConfirmRegistrationReceipt } from "./registrationDraft.js";
import "./registration.css";

const ParentRegistration = forwardRef(function ParentRegistration({ mode, active, onSwitchKind, Arrow }, ref) {
  const auth = useAdminAuth();
  const { register, control, handleSubmit, getValues, reset, setValue, setError, setFocus, getFieldState, formState: { errors } } = useForm({
    defaultValues: createRegistrationDraft(), mode: "onTouched", reValidateMode: "onChange",
    resolver: parentRegistrationResolver(mode), shouldFocusError: false,
  });
  const phoneCountry = useWatch({ control, name: "phoneCountry" });
  const community = useWatch({ control, name: "community" });
  const [status, setStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [handoffUrl, setHandoffUrl] = useState("");
  const [restored, setRestored] = useState(false);
  const submissionId = useRef(null);
  const submissionUserId = useRef(null);
  const pending = useRef(false);
  const requestGeneration = useRef(0);
  const activeRef = useRef(active);
  const googleUserId = auth.user?.isGoogle ? auth.user.id : null;
  const boundAccount = useRef(googleUserId);
  const isEnrol = mode === "enroll";
  useLayoutEffect(() => {
    activeRef.current = active;
    requestGeneration.current += 1;
    if (active) {
      const kept = consumeRegistrationDraft(mode);
      if (kept) { reset(kept); setRestored(true); submissionId.current = null; submissionUserId.current = null; }
      setStatus(pending.current ? "saving" : "idle");
      setSaveError(""); setHandoffUrl("");
    }
    return () => { activeRef.current = false; requestGeneration.current += 1; };
  }, [active]);
  useLayoutEffect(() => {
    if (shouldClearBoundRegistration(boundAccount.current, googleUserId)) {
      reset(createRegistrationDraft()); clearRegistrationDrafts(); setRestored(false);
    }
    boundAccount.current = googleUserId;
    requestGeneration.current += 1;
    submissionId.current = null; submissionUserId.current = null;
    setStatus("idle"); setSaveError(""); setHandoffUrl("");
    setValue("consent", false); setValue("terms", false);
  }, [googleUserId, reset, setValue]);
  useImperativeHandle(ref, () => ({
    getValues,
    carryTrial: trial => {
      const existing = getValues();
      const seeded = carryTrialToEnrol(trial, existing);
      if (JSON.stringify(seeded) !== JSON.stringify(existing)) {
        reset(seeded); submissionId.current = null; setStatus("idle"); setHandoffUrl(""); setSaveError("");
      }
    },
  }), [getValues, reset]);

  function markEdited() {
    requestGeneration.current += 1;
    submissionId.current = null;
    setStatus("idle"); setSaveError(""); setHandoffUrl("");
  }
  const fieldId = name => `fm-${mode}-${name}`;
  function errorMessage(name) {
    return <span className="fm-error" id={`${fieldId(name)}-error`} aria-live="polite">{errors[name]?.message || ""}</span>;
  }
  function input(name, label, options = {}) {
    const { multiline, optional, full, ...attributes } = options;
    const shared = { id: fieldId(name), ...register(name), ...attributes, required: !optional,
      "aria-invalid": errors[name] ? true : undefined, "aria-describedby": `${fieldId(name)}-error` };
    return <div className={`fm-field${full ? " fm-full" : ""}`}>
      <label htmlFor={fieldId(name)}>{label}{optional && <span className="fm-optional"> (optional)</span>}</label>
      {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} />}
      {errorMessage(name)}
    </div>;
  }
  function select(name, label, options) {
    return <div className="fm-field"><label htmlFor={fieldId(name)}>{label}</label><div className="fm-select-wrap">
      <select id={fieldId(name)} {...register(name)} required aria-invalid={errors[name] ? true : undefined} aria-describedby={`${fieldId(name)}-error`}>
        <option value="">Choose {name === "age" ? "age" : name}</option>
        {options.map(option => <option key={option.value || option} value={option.value || option}>{option.label || option}</option>)}
      </select><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.6" /></svg>
    </div>{errorMessage(name)}</div>;
  }

  async function submit(values) {
    if (!active || pending.current) return;
    pending.current = true;
    setStatus("verifying"); setSaveError("");
    const generation = requestGeneration.current;
    try {
      const data = parseRegistration(mode, values);
      const actor = await auth.verifyGoogleUser();
      if (!activeRef.current || requestGeneration.current !== generation) return;
      if (!actor) {
        if (auth.user?.isGoogle) throw new Error("Your Google account changed. Sign in again before sending.");
        if (!storeRegistrationDraft(mode, values)) throw new Error("Your browser could not keep these answers for sign-in. Allow this site's session storage and try again.");
        setStatus("signing_in");
        await auth.signIn(`/parent/?resume=${isEnrol ? "enrol" : "trial"}`);
        return;
      }
      if (!auth.user?.isGoogle || auth.user.id !== actor.id) {
        setValue("consent", false); setValue("terms", false);
        setSaveError("Check the Google account shown below and confirm consent again before sending.");
        setStatus("idle");
        return;
      }
      if (submissionUserId.current !== actor.id) { submissionId.current = null; submissionUserId.current = actor.id; }
      const id = submissionId.current ||= newSubmissionId();
      setStatus("saving");
      const receipt = await saveRegistration(isEnrol ? "enrol" : "trial", data, { agreed: true, guardian: true, terms: isEnrol }, id);
      const currentActor = await auth.verifyGoogleUser();
      if (!currentActor || currentActor.id !== actor.id) throw new Error("Your Google account changed. Check the account and submit again.");
      if (!canConfirmRegistrationReceipt({ submittedUserId: actor.id, verifiedUser: currentActor, generation, currentGeneration: requestGeneration.current, active: activeRef.current })) return;
      clearRegistrationDraft(mode); setRestored(false);
      setHandoffUrl(createWhatsAppUrl(mode, data));
      setStatus("saved");
      window.dispatchEvent(new CustomEvent("letsaimit:registration-saved", { detail: { userId: actor.id, requestId: receipt.id } }));
    } catch (error) {
      if (!activeRef.current || requestGeneration.current !== generation) return;
      if (typeof error.field === "string" && Object.hasOwn(createRegistrationDraft(), error.field)) {
        setError(error.field, { type: "server", message: error.message }, { shouldFocus: true });
      }
      setSaveError(error.message || "We couldn’t confirm a save. Please retry.");
      setStatus("error");
    } finally {
      pending.current = false;
      if (activeRef.current && requestGeneration.current !== generation) setStatus("idle");
    }
  }
  function focusInvalid(nextErrors) {
    const first = firstInvalidRegistrationField(mode, nextErrors);
    if (first) setFocus(first);
  }
  const phoneField = register("phone");
  function phoneChange(event) {
    const country = getValues("phoneCountry");
    const correctingOverflow = getValues("phone").replace(/\D/g, "").length > nationalPhoneLimit(country);
    const next = sanitizePhoneInput(event.target.value, country, { preserveOverflow: correctingOverflow });
    event.target.value = next.phone;
    if (next.phoneCountry !== getValues("phoneCountry")) setValue("phoneCountry", next.phoneCountry, { shouldDirty: true, shouldValidate: true });
    phoneField.onChange(event);
  }
  function phonePaste(event) {
    const pasted = event.clipboardData.getData("text");
    event.preventDefault();
    const input = event.currentTarget;
    const replacement = /^(?:\+|00)/.test(pasted.trim()) ? pasted :
      `${input.value.slice(0, input.selectionStart ?? 0)}${pasted}${input.value.slice(input.selectionEnd ?? input.value.length)}`;
    const next = sanitizePhoneInput(replacement, getValues("phoneCountry"), { preserveOverflow: true });
    setValue("phoneCountry", next.phoneCountry, { shouldDirty: true, shouldValidate: true });
    setValue("phone", next.phone, { shouldDirty: true, shouldValidate: getFieldState("phone").isTouched });
    markEdited();
  }

  return <form className="fm-form registration-form" data-form-mode={mode} hidden={!active} style={!active ? { display: "none" } : undefined}
    noValidate onSubmit={handleSubmit(submit, focusInvalid)} onChange={event => { if (event.target.name) markEdited(); }}>
    <fieldset className="fm-fieldset" disabled={!active || ["verifying", "saving", "signing_in"].includes(status)}>
      <div className="fm-fields">
        {isEnrol && input("childName", "Child’s name", { maxLength: 80, autoComplete: "off" })}
        {input("parentName", "Parent or guardian name", { maxLength: 80, autoComplete: "name" })}
        {input("email", "Email address", { type: "email", inputMode: "email", maxLength: 254, autoComplete: "email" })}
        <div className="fm-field"><label htmlFor={fieldId("phoneCountry")}>Phone country</label>
          <Controller control={control} name="phoneCountry" render={({ field }) => <CountryCombobox id={fieldId("phoneCountry")} value={field.value} inputRef={field.ref} error={errors.phoneCountry} onBlur={field.onBlur}
            onChange={code => { field.onChange(code); setValue("phone", getValues("phone"), { shouldValidate: getFieldState("phone").isTouched }); markEdited(); }} />} />
          {errorMessage("phoneCountry")}
        </div>
        <div className="fm-field"><label htmlFor={fieldId("phone")}>Parent phone number</label>
          <input id={fieldId("phone")} type="tel" inputMode="numeric" autoComplete="tel-national" {...phoneField} onChange={phoneChange} onPaste={phonePaste} required
            maxLength={25} aria-invalid={errors.phone ? true : undefined} aria-describedby={`${fieldId("phone")}-hint ${fieldId("phone")}-error`} />
          <span className="fm-hint registration-phone-hint" id={`${fieldId("phone")}-hint`}>{phoneCountry === "IN" ? "10 digits. Country code is selected separately." : `Enter the national number, up to ${nationalPhoneLimit(phoneCountry)} digits.`}</span>
          {errorMessage("phone")}
        </div>
        {select("age", "Child’s age", [...REGISTRATION_AGES.map(age => ({ value: age, label: `${age} years` })), ...(!isEnrol ? [{ value: "other", label: "Under 5 or over 14" }] : [])])}
        {select("community", "Community", REGISTRATION_COMMUNITIES)}
        {community === "Another community" && input("otherCommunity", "Your society or locality", { full: true, maxLength: 120, autoComplete: "address-level3" })}
        {select("sport", "Sport", REGISTRATION_SPORTS)}
        {isEnrol && input("address", "Address", { full: true, multiline: true, maxLength: 500, autoComplete: "street-address" })}
        {isEnrol && input("note", "Note for the coach", { full: true, multiline: true, optional: true, maxLength: 500 })}
      </div>
      <div className="fm-form-footer">
        {restored && <p className="fm-handoff-note" role="status">Your answers are back. Please review them and confirm consent again before sending.</p>}
        {auth.user?.isGoogle ? <p className="fm-handoff-note">Submitting as {auth.user.email}. <a href="/parent/">My requests</a></p> : <p className="fm-handoff-note">Continue with Google before sending. We will keep these answers in this tab for 30 minutes.</p>}
        <div className="fm-full sk-consent"><label className="fm-consent" htmlFor={fieldId("consent")}>
          <input id={fieldId("consent")} type="checkbox" {...register("consent")} required aria-invalid={errors.consent ? true : undefined} aria-describedby={`${fieldId("consent")}-error`} />
          <span>I am the parent or guardian. I agree to use of these details for this enquiry and a reply from LetsAimIt. <a href="/privacy/" target="_blank" rel="noopener noreferrer">Privacy policy</a></span>
        </label>{errorMessage("consent")}</div>
        {isEnrol && <div className="registration-terms"><label className="fm-consent" htmlFor={fieldId("terms")}>
          <input id={fieldId("terms")} type="checkbox" {...register("terms")} required aria-invalid={errors.terms ? true : undefined} aria-describedby={`${fieldId("terms")}-error`} />
          <span>I accept the <a href="/terms/" target="_blank" rel="noopener noreferrer">programme terms</a> and <a href="/refunds/" target="_blank" rel="noopener noreferrer">cancellation policy</a>. Paid enrolment is non-refundable for personal absence or withdrawal.</span>
        </label>{errorMessage("terms")}</div>}
        {status !== "saved" && <>
          <p className="fm-handoff-note">Your details are saved before we show confirmation.</p>
          <button className="fm-primary" type="submit" disabled={["verifying", "saving", "signing_in"].includes(status) || ["checking", "signing_in", "signing_out"].includes(auth.phase)}>
            <span>{status === "verifying" ? "Checking Google…" : status === "saving" ? "Saving…" : status === "signing_in" ? "Opening Google…" : !auth.user?.isGoogle ? "Continue with Google" : saveError ? "Retry save" : isEnrol ? "Send registration" : "Request a free trial"}</span><Arrow />
          </button>
        </>}
        {saveError && <div className="fm-save-error" role="alert"><p>{saveError}</p><p>Your answers are still here. Please retry to confirm the save.</p></div>}
        {status === "saved" && <div className="fm-success registration-result" role="status">
          <h4>{isEnrol ? "Registration received." : "Trial request received."}</h4>
          <p>Your details are saved. The coach will confirm the next step.</p>
          <a href={handoffUrl} target="_blank" rel="noopener noreferrer">Chat in WhatsApp (optional)</a>
        </div>}
        <button className="fm-text-button" type="button" onClick={() => onSwitchKind(isEnrol ? "trial" : "enroll")}>
          {isEnrol ? "Try a session first" : "Ready to join? Enrol your child"}<Arrow />
        </button>
      </div>
    </fieldset>
  </form>;
});

export default ParentRegistration;
