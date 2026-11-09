import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { createWhatsAppUrl } from "../../lib/formLogic.js";
import { newSubmissionId, saveRegistration } from "../../lib/leadCapture.js";
import { parseRegistration, REGISTRATION_AGES, REGISTRATION_COMMUNITIES, REGISTRATION_SPORTS } from "../../lib/registrationSchema.js";
import { carryTrialToEnrol, createRegistrationDraft, nationalPhoneLimit, sanitizePhoneInput } from "./registrationDraft.js";
import { firstInvalidRegistrationField, parentRegistrationResolver } from "./registrationResolver.js";
import CountryCombobox from "./CountryCombobox.jsx";
import "./registration.css";

const ParentRegistration = forwardRef(function ParentRegistration({ mode, active, onSwitchKind, Arrow }, ref) {
  const { register, control, handleSubmit, getValues, reset, setValue, setError, setFocus, getFieldState, formState: { errors } } = useForm({
    defaultValues: createRegistrationDraft(), mode: "onTouched", reValidateMode: "onChange",
    resolver: parentRegistrationResolver(mode), shouldFocusError: false,
  });
  const phoneCountry = useWatch({ control, name: "phoneCountry" });
  const community = useWatch({ control, name: "community" });
  const [status, setStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [handoffUrl, setHandoffUrl] = useState("");
  const submissionId = useRef(null);
  const pending = useRef(false);
  const requestGeneration = useRef(0);
  const activeRef = useRef(active);
  const isEnrol = mode === "enroll";
  useLayoutEffect(() => {
    activeRef.current = active;
    requestGeneration.current += 1;
    if (active) {
      setStatus(pending.current ? "saving" : "idle");
      setSaveError(""); setHandoffUrl("");
    }
    return () => { activeRef.current = false; requestGeneration.current += 1; };
  }, [active]);
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
    setStatus("saving"); setSaveError("");
    const id = submissionId.current ||= newSubmissionId();
    const generation = requestGeneration.current;
    try {
      const data = parseRegistration(mode, values);
      await saveRegistration(isEnrol ? "enrol" : "trial", data, { agreed: true, guardian: true, terms: isEnrol }, id);
      if (!activeRef.current || requestGeneration.current !== generation) return;
      setHandoffUrl(createWhatsAppUrl(mode, data));
      setStatus("saved");
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
    <fieldset className="fm-fieldset" disabled={!active || status === "saving"}>
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
          <button className="fm-primary" type="submit" disabled={status === "saving"}>
            <span>{status === "saving" ? "Saving…" : saveError ? "Retry save" : isEnrol ? "Send registration" : "Request a free trial"}</span><Arrow />
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
