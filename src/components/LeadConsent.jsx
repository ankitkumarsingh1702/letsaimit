export default function LeadConsent({ id, checked, onChange, guardian = false, error, inputRef, disabled = false }) {
  return <div className="fm-full sk-consent">
    <label className="fm-consent" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} ref={inputRef} disabled={disabled} required aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
      <span>{guardian ? "I am the parent or guardian. I agree to use of these details for this enquiry and a reply from LetsAimIt." : "I agree to use of my details for this enquiry and a reply from LetsAimIt."} <a href="/privacy/" target="_blank" rel="noopener noreferrer">Privacy policy</a></span>
    </label>
    {error && <p className="fm-consent-error" id={`${id}-error`}>{error}</p>}
  </div>;
}
