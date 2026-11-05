# Google registration and Sheets

This is the ready-to-deploy Google Apps Script backend for the website. **It is not connected to a live Google account yet.** The existing public registration link works as a Google Form, but its response Sheet and editor access have not been verified. This package contains no credentials, response exports, or customer records.

## What it does

- Saves trial, enrolment, society and school requests to four private Sheet tabs.
- Records the server time, consent version and parent/guardian declaration. Enrolment also requires acceptance of the terms.
- Validates a small, fixed field list and escapes spreadsheet formula prefixes.
- Uses a script lock and a submission ID to prevent duplicate rows when a save is retried.
- Returns a success receipt only after writing and reading back the saved row.
- Sends no email. A phone or WhatsApp follow-up remains optional after the save.
- Provides an optional setup function for four native Google Forms linked to the same workbook.

The web app accepts new submissions only. It has no public read, export, edit or delete operation. A GET request returns a generic method message, never saved data.

## Connect the website

1. Open [Google Apps Script](https://script.google.com/) in the Google account that should own the registrations. Create a project and paste `Code.gs` into it. Use the V8 runtime.
2. Run `setupLeadSheet` from the editor. Review Google’s requested permissions. The function creates **LetsAimIt — Registrations** and stores its ID in the project’s `LETSAIMIT_LEAD_SHEET_ID` script property. It can be rerun safely; existing headers and records are preserved. Open the returned workbook and keep General access **Restricted**. Give editor access only to the staff who handle registrations.
3. Choose **Deploy → New deployment → Web app**. Select **Execute as: Me** and the access option that allows visitors without Google accounts to submit (usually **Anyone**). This exposes the submit-only web app; it does not make the workbook public. Account or organisation rules may prevent anonymous deployment.
4. Copy the deployed web app URL ending in `/exec` into the website’s lead endpoint configuration. A `/dev` URL is for script editors and must not be used by the public site. No password, API key, OAuth token or Sheet ID belongs in the React client.
5. Run the verification below from the actual `.chatgpt.site` origin before enabling the form. Republish the website after setting the endpoint. For subsequent script changes, edit the existing deployment to use a new version, retaining its URL where possible.

The script uses the account’s standard Google Apps Script and Sheets services; it does not require a paid messaging or email API. Google account limits and Apps Script quotas still apply.

### Request contract

Send `POST` JSON with a `text/plain;charset=utf-8` content type. Keep the same `submissionId` for retries of **unchanged** details. Generate a new ID after the user changes the request. Do not put answers in URL parameters, browser logs, analytics events or persistent browser storage.

```js
const payload = {
  submissionId: crypto.randomUUID(),
  formType: 'trial',
  consent: {
    agreed: true,
    guardian: true,
    version: '2026-11-05',
  },
  data: {
    parentName: 'Test parent',
    phone: '+910000000000',
    age: '9',
    community: 'Nambiar Ellegenza',
    sport: 'Basketball',
  },
};

const response = await fetch(leadEndpoint, {
  method: 'POST',
  headers: {'Content-Type': 'text/plain;charset=utf-8'},
  credentials: 'omit',
  redirect: 'follow',
  body: JSON.stringify(payload),
});
if (!response.ok) throw new Error('The save could not be confirmed.');
const result = await response.json();
if (result.ok !== true || result.submissionId !== payload.submissionId) {
  throw new Error(result.message || 'The save could not be confirmed.');
}
// Only here: show the thank-you message and optional WhatsApp follow-up.
```

The example contains synthetic data only. It is not a lead and must not be used to contact anyone.

| Form type | Required `data` fields | Optional fields |
| --- | --- | --- |
| `trial` | `parentName`, `phone`, `age`, `community`, `sport` | None |
| `enrol` | `parentName`, `phone`, `childName`, `age`, `community`, `sport` | None |
| `society` | `societyName`, `locality`, `contactName`, `phone`, `role`, `childrenCount`, `space` | `message` |
| `school` | `schoolName`, `city`, `contactName`, `phone` | `role`, `needs` |

`age` accepts `5` through `14`, as strings or numbers. Trial enquiries also accept `other`; this is an enquiry, not confirmation of eligibility. `sport` is `Football`, `Basketball` or `Not sure`. `community` accepts the visitor’s community or locality as text. `childrenCount` accepts an integer from 1 to 9999 or `Not sure`. Phone numbers allow 8–15 digits, spaces, parentheses, hyphens and an initial `+`; storage normalises them to digits and the optional initial `+`.

Every form requires `consent.agreed: true` and the exact current `consent.version`. Trial and enrolment also require `consent.guardian: true`. Enrolment additionally requires **`consent.terms: true`**. The server stores the current terms version alongside that acceptance.

The checkbox must be unchecked initially and show the relevant privacy/contact explanation. Parent forms must state that the person submitting is the child’s parent or legal guardian. Enrolment needs a separate terms checkbox linking to `/terms/` and `/refunds/`. School and society forms need contact consent, not a guardian declaration. Do not collect health details, identity documents, dates of birth or home addresses in these lead forms.

Successful new submission:

```json
{"ok":true,"submissionId":"<same UUID>","savedAt":"<server UTC timestamp>","duplicate":false}
```

A retry of the same ID and normalised payload returns the original receipt with `duplicate:true`, without another row. Reusing the ID with changed details returns `SUBMISSION_CONFLICT`; it does not overwrite the original request. This also applies across form types. The stored fingerprint is used only for retry checks and is never returned publicly.

Errors return `{ "ok": false, "code": "...", "message": "...", "field": "..." }`; `field` appears only for relevant input errors. Codes include `INVALID_REQUEST`, `VALIDATION_ERROR`, `CONSENT_REQUIRED`, `SUBMISSION_CONFLICT`, `NOT_CONFIGURED` and `SERVICE_UNAVAILABLE`. Apps Script text responses do not provide an application-specific HTTP status, so the frontend must check `ok` even when HTTP succeeds.

### Browser acknowledgement and CORS

`text/plain` avoids an unnecessary JSON preflight. Google serves Apps Script responses through its deployment infrastructure; cross-origin response readability must still be verified with the actual account, deployment and website origin. A successful editor run or command-line POST alone does not prove that the React page can read the receipt.

Never use `fetch(..., {mode: 'no-cors'})` as a success path: its opaque response cannot prove a save. A timeout, unreadable response or connection loss means **save not confirmed**, even if the server may have stored the row. Keep the same ID and offer retry. Show “Request saved” and fire any `lead_saved` analytics event only after a matching readable success receipt. Do not send parent/child details, phone numbers or free text to analytics.

If the deployment does not allow the browser to read the response, use the native Google Forms route below, or a real same-origin server endpoint that validates and relays the request. Do not claim a Sheet connection is live until one of those complete paths has been tested.

## Optional native Google Forms

Run `setupRegistrationForms` in the Apps Script editor only if you want native Google Forms as well. It creates four forms, adds required consent, links each to the private workbook and returns actual responder/editor URLs. It does not alter the old public forms or import their responses.

- Trial: parent contact, child age, community and sport. The introduction says the first session is free.
- Enrolment: the same fields plus child name and separate terms acceptance.
- Society: society/locality, contact role, expected children and available space.
- School: school/city, adult contact and optional support needs.

No email address is required and no email alerts are created. Form response summaries and response editing are disabled. The setup does not grant anyone access to the response workbook. Google creates separate response tabs for its forms; these are additional to the four direct web-app tabs. Google’s native confirmation appears after submission. The website cannot infer that a cross-origin embedded form was submitted merely because its iframe loaded.

The form URLs returned by setup are real outputs, not placeholders to predict. Set those responder URLs in the website only after testing each form while signed out. A Google Workspace administrator may restrict responder access despite the script settings. Never make the response Sheet public to resolve a responder-access issue.

The defaults link to `https://letsaimit-review.one92843.chatgpt.site/privacy/`, `/terms/` and `/refunds/`. Before generating forms for another domain, set the script property `LETSAIMIT_SITE_ORIGIN` to that HTTPS origin. Changing the property later does not silently rewrite already created forms; review their existing descriptions and links explicitly.

Setup stores each form ID and its ready version. Rerunning reuses completed forms. If a run stops partway or the consent version changes, it stops for owner review instead of adding duplicate questions or deleting answers. Open that form in the Google Forms editor, finish or update the required questions, links, consent and response destination, then update its `LETSAIMIT_FORM_<TYPE>_READY_VERSION` script property to the current version. The `<TYPE>` values are `TRIAL`, `ENROL`, `SOCIETY` and `SCHOOL`.

## Verify before use

1. Submit one clearly labelled synthetic request from the published website. Verify one matching row, the consent version/time and the corresponding thank-you message. Do not contact the test phone number.
2. Retry the identical payload and submission ID. Verify `duplicate:true` and no second row. Change a field with the same ID; verify a conflict instead of an overwrite.
3. Leave consent unchecked, send a stale version, omit a required field and use a formula-like name such as `=1+1`. Confirm rejected inputs are not stored, and the accepted name is stored as literal text rather than executed.
4. Block the request or use a disconnected test endpoint. Confirm no “saved” message and no `lead_saved` event appears. Restore the correct endpoint and retry the original ID.
5. Open the Sheet’s sharing settings and confirm General access is Restricted. Open every public native form signed out if those forms are enabled. Keep response summaries off.

The endpoint is an anonymous intake route, not an authenticated customer database. It caps payload size and serialises writes, but it is not a full anti-spam service. Keep access limited to the expected launch volume and review unexpected submissions. Native Google Forms is the simpler fallback when account restrictions or browser delivery prevent reliable direct saves.

## Access checked for this package

On 5 November 2026, the connected Drive account returned no matching LetsAimIt form or response Sheet in targeted searches. The available connector has no Google Forms creation/editing/link-destination action, and the cloud browser was signed out of Google. No account sign-in, form change, Sheet creation or test submission was performed.

- The existing registration link resolved to [Parents-Player Required Information](https://docs.google.com/forms/d/e/1FAIpQLSegPyakGhVrCiGlxtea43wI1IuILlCr6GSEbM-fyLBH1LrT9g/viewform). The responder page was accessible without signing in. It requires email, child name/age, parent name, full address and phone, and has no consent checkbox. Its Sheet destination remains unverified.
- The existing society link resolved to [Bring LetsAimIt to Your Community](https://docs.google.com/forms/d/e/1FAIpQLScLZglfwW1Jwd8XenIkgpvW9jq5_xdr-VJcDq5R1v8I-cyqVQ/viewform). It required Google sign-in before responding. Its Sheet destination remains unverified.

Those older forms are not evidence that the new website’s direct saves are connected. To complete live integration, the owner must deploy this script in the intended Google account, or provide editor access to the intended Forms and response Sheet through an accessible signed-in session.

## Google references

- [Apps Script web apps and execution permissions](https://developers.google.com/apps-script/guides/web)
- [Apps Script content responses](https://developers.google.com/apps-script/guides/content)
- [Script locks](https://developers.google.com/apps-script/reference/lock/lock-service)
- [Google Forms response destinations](https://support.google.com/docs/answer/2917686?hl=en)
- [Form creation](https://developers.google.com/apps-script/reference/forms/form-app)
- [Form settings and response destinations](https://developers.google.com/apps-script/reference/forms/form)

The Google account owner still needs to deploy and verify the live connection. This code package alone does not provision a Google service.
