# Legacy Google Sheets intake: society and school only

This Apps Script package accepts **society and school enquiries only**. Parent trial and enrolment requests belong on the [canonical LetsAimIt website](https://letsaimit.com/), where Google sign-in is required before final submission. This package contains no credentials, response exports or customer records.

`trial`, `enrol` and `enroll` requests now return `PARENT_REGISTRATION_RETIRED` with the canonical website address and Google sign-in requirement. This happens before configuration lookup, duplicate-receipt lookup or a Sheet write, including retries of old parent submission IDs. A GET never saves or returns responses.

## Current callers and retired routes

- `src/features/registration/ParentRegistration.jsx` uses the Supabase registration flow through `saveRegistration`. It must not fall back to this anonymous endpoint or a native Google Form for a final parent save.
- `src/components/ContactDialog.jsx` reaches `saveLead` only through its society form; its parent forms are separate `ParentRegistration` components.
- `src/features/schools/SchoolEnquiry.js` uses `saveLead` for school enquiries.
- `setupRegistrationForms()` now creates or reuses native forms for `society` and `school` only. Direct parent-mode calls to the native configuration helper also reject with the retirement error.

Historical Trial and Enrolment tab metadata remains solely for existing-workbook compatibility and cross-type submission-ID checks. `setupLeadSheet()` preserves its four-tab layout and existing records; only Societies and Schools accept new web-app writes. Retiring a route does not delete historical responses.

**Published-version boundary:** this source change does not update an already published Apps Script deployment, stop responses on an existing Google Form or prove that older endpoints/forms are undeployed. No live Google account, published version or response destination was audited or changed for this update. The owner must inventory old parent endpoints, embeds and native forms, retire their parent intake, and verify the updated deployed contract separately. Do not republish an older script version or link an old parent form as a fallback. Society and school intake must remain available.

## What remains supported

- Fixed, validated society/school fields and explicit contact consent.
- Private workbook, server timestamps, literal spreadsheet cells and submission-ID/fingerprint retry checks.
- Serialized writes and readable receipts only after saved-row readback.
- No public read, export, edit or delete operation; no email alerts or payment processing.
- Optional native society/school forms linked to the private workbook. These use separate Google-managed response tabs.

## Owner setup and deployment

1. Open [Google Apps Script](https://script.google.com/) in the intended owner account and use this `Code.gs` with the V8 runtime.
2. Run `setupLeadSheet()`. It creates or checks **LetsAimIt — Registrations**, stores `LETSAIMIT_LEAD_SHEET_ID`, preserves records and checks headers. Keep workbook General access **Restricted**, with only the staff access needed for these enquiries.
3. Update the intended Web app deployment to this source version, executing as the owner. Anonymous access, if allowed by the account, is for society/school enquiries only. Review every older published parent-capable deployment separately; changing source or creating a new deployment does not retire the others.
4. Use its `/exec` URL as the website lead endpoint for society/school. `/dev` is editor-only. Never put Sheet IDs, passwords, OAuth tokens or other secrets in the React client.
5. Verify browser acknowledgement from the actual published website origin. Script-editor runs and command-line responses do not prove that the page can read the receipt.

Google account limits and Apps Script quotas still apply. This package is not an anti-spam service or an authenticated parent database.

## Request contract

Send `POST` JSON with `Content-Type: text/plain;charset=utf-8`. Reuse a submission ID only for unchanged details; generate a new ID after edits. Never put answers in URLs, logs or analytics.

```js
const payload = {
  submissionId: crypto.randomUUID(),
  formType: 'school',
  consent: { agreed: true, version: '2026-11-05' },
  data: {
    schoolName: 'Synthetic Example School',
    city: 'Example City',
    contactName: 'Synthetic Example Contact',
    phone: '+12025550123',
    role: '',
    needs: 'Synthetic test enquiry; do not contact.',
  },
};
const response = await fetch(leadEndpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  credentials: 'omit',
  redirect: 'follow',
  body: JSON.stringify(payload),
});
if (!response.ok) throw new Error('Save not confirmed.');
const receipt = await response.json();
if (receipt.ok !== true || receipt.submissionId !== payload.submissionId ||
    typeof receipt.duplicate !== 'boolean' || !Number.isFinite(Date.parse(receipt.savedAt))) {
  throw new Error(receipt.message || 'Save not confirmed.');
}
// Only here: show the enquiry receipt and optional contact follow-up.
```

The example is fictional and is never authority to contact anyone.

| Form type | Required `data` fields | Optional fields |
| --- | --- | --- |
| `society` | `societyName`, `locality`, `contactName`, `phone`, `role`, `childrenCount`, `space` | `message` |
| `school` | `schoolName`, `city`, `contactName`, `phone` | `role`, `needs` |

`childrenCount` accepts 1–9999 or `Not sure`. Phone numbers permit 8–15 digits with formatting and an initial `+`; storage normalizes formatting. Both forms require an initially unchecked contact-consent checkbox, `consent.agreed: true` and the current consent version. They do not require a guardian declaration or enrolment terms. Leave child names, health information, identity documents and home addresses out of these adult-contact enquiries.

New success is `{ok:true,submissionId,savedAt,duplicate:false}`. An unchanged retry returns the original receipt with `duplicate:true`; changed details under the same ID return `SUBMISSION_CONFLICT` without overwriting. The fingerprint is private. Errors return `{ok:false,code,message}` and optionally `field`. Codes include `PARENT_REGISTRATION_RETIRED`, `INVALID_REQUEST`, `VALIDATION_ERROR`, `CONSENT_REQUIRED`, `SUBMISSION_CONFLICT`, `NOT_CONFIGURED` and `SERVICE_UNAVAILABLE`. Check `ok` even when Apps Script returns HTTP success.

Never treat `no-cors`, an unreadable response, a timeout or an iframe load as a saved enquiry. Keep the unchanged ID for a safe retry. Emit `lead_saved` only after a matching readable receipt, with no personal data in analytics.

## Optional native society/school forms

`setupRegistrationForms()` creates/reuses only those two forms, adds contact consent and links them to the private workbook. It returns their actual responder/editor URLs; it never returns parent form links. No email address or email alert is added, and response summaries/editing remain disabled. A Workspace policy can still restrict responder access; never make the response Sheet public to bypass it.

The default privacy link is `https://letsaimit.com/privacy/`. An explicit `LETSAIMIT_SITE_ORIGIN` HTTPS property can select another intended site origin. Existing form descriptions are not silently rewritten when that property changes.

Completed forms reuse `LETSAIMIT_FORM_SOCIETY` / `LETSAIMIT_FORM_SCHOOL` and their `_READY_VERSION` properties. Interrupted setup or a version mismatch stops for owner review instead of duplicating questions. Existing `TRIAL`/`ENROL` properties and older published parent forms are not opened, changed or closed by this setup; audit and retire them separately while retaining their private records.

## Verification

1. Send each retired parent mode (`trial`, `enrol`, `enroll`), including an old submission ID. Confirm a retirement error with the canonical website/Google requirement and no receipt or Sheet access.
2. Submit a labelled synthetic society/school enquiry from the published website. Confirm the matching row, consent version/time and readable receipt; do not contact test details.
3. Retry unchanged and then change a field under the same ID. Confirm one saved row, a duplicate receipt and then a conflict.
4. Check missing/stale consent, malformed input and formula-like text. Invalid input must not be saved; permitted formula-like text must remain literal.
5. Block/disconnect the endpoint. Confirm no saved message or `lead_saved` event. Check workbook privacy and society/school native forms if used.
6. Inventory older Apps Script deployment versions and parent Google Forms. A passing local regression test does not establish that those external routes have been retired.

## Google references

- [Apps Script web apps and deployment permissions](https://developers.google.com/apps-script/guides/web)
- [Content responses](https://developers.google.com/apps-script/guides/content)
- [Script locks](https://developers.google.com/apps-script/reference/lock/lock-service)
- [Google Forms destinations](https://support.google.com/docs/answer/2917686?hl=en)
- [Form creation](https://developers.google.com/apps-script/reference/forms/form-app)
- [Form settings](https://developers.google.com/apps-script/reference/forms/form)
