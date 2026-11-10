# Monthly payments

The existing React, Google sign-in, Supabase and SMTP setup is retained. A parent
sends an enrolment request and separately agrees to the displayed payment terms.
An admin accepts it. The backend creates a Razorpay hosted invoice and emails its
payment link to the saved parent address. A free trial never creates a bill.

Parents pay each hosted invoice themselves. This is monthly invoicing, not an
automatic debit mandate. A return from Razorpay does not prove payment. The
server fetches and verifies the provider invoice, linked order and captured
payment before recording money received.

## Price and schedule

- Regular monthly price: **₹600**. The current team checkout is **₹1**, using
  live Razorpay keys when configured. It is labelled before consent and payment.
- First invoice: on approval, due four days later. Following calendar months:
  invoice on the 1st, due by the end of the 5th, in India Standard Time.
- One unpaid reminder per local day, from invoice creation through the due date.
  A recovered scheduler sends the current reminder, not every missed reminder.
- **₹100 per overdue day** is the accepted regular late-fee policy. Issued
  invoices cannot change amounts; these charges are separate invoices. During
  the ₹1 team run they are previews only and never create a real ₹100 bill.
- Each account keeps its consented price and fee policy. Changing global pricing
  cannot silently upgrade an existing ₹1 account to ₹600.
- Stopping monthly billing stops future cycles. Existing issued invoices remain
  payable. This does not initiate a refund or cancel an existing provider invoice.

## Saved data and interfaces

All monetary values are integer paise; currency is INR. The database owns prices,
dates, parent ownership, queue recipients, invoice identities and account states.
There is no browser API for choosing arbitrary charge amounts.

| Interface | Access | Result |
| --- | --- | --- |
| `get_billing_terms()` | Public | Pricing and versioned consent terms only |
| `submit_registration(payload)` | Verified Google parent | Existing durable registration receipt; enrolment requires current billing consent when billing is enabled |
| `list_my_billing()` | Verified Google parent | That user's invoice history and billing accounts |
| `list_admin_billing()` | Current approved admin | Saved invoices, accounts and aggregate totals |
| `cancel_billing_account(p_registration_id,p_expected_revision)` | Current approved admin | Audited stop of future billing, guarded by revision |
| `billing-worker` | Backend bearer only | Bounded create/reconcile/email jobs; request bodies choose no bills or recipients |
| `razorpay-webhook` | Valid Razorpay raw-body HMAC | Durable event receipt before acknowledgement |

The dashboard has compact single-line rows, status/search filters, invoice links,
details and saved-row CSV. Global totals are independent of row filters. They
show gross captured payments, processed refunds and outstanding balances. Net
received is captured minus refunds; this is not a claim about bank settlements,
provider fees or tax accounting. Invoice lists return the latest 1,000 records
with an explicit limit notice; aggregate totals cover all authorized invoices.

Private snapshots refresh silently while the tab is visible and on focus. A
changed/revoked identity cannot keep using another account's data. Payment status
is never optimistically marked paid in the browser.

## Backend setup

Use the ordered migration in `supabase/migrations/` and the release procedure in
[README-SHEET-DEPLOYMENT.md](README-SHEET-DEPLOYMENT.md). The billing migration
starts **disabled**. It does not backfill old accepted requests or charge an
existing parent. Keep the target explicit: `nlgfcmywgwibvmbsgkox` is UAT.

Deploy the two functions with their entrypoints and shared modules. Both disable
the gateway's legacy JWT guard because each has its own authentication boundary:
the worker's backend bearer and the webhook's Razorpay signature. This does not
make their protected actions anonymous.

The billing worker reuses the existing backend SMTP settings and
`NOTIFICATION_CRON_SECRET`. Additional backend-only settings are:

```text
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

Never put these values in `VITE_*`, a browser bundle, Git, screenshots or logs.
The live-key ID must start `rzp_live_`. A test-key fallback is not enabled by this
release. Secrets are provisioned in the selected Supabase project, not copied
between environments.

Create a live Razorpay webhook pointing to:

```text
https://nlgfcmywgwibvmbsgkox.supabase.co/functions/v1/razorpay-webhook
```

Select `invoice.paid`, `invoice.partially_paid`, `invoice.expired`,
`payment.authorized`, `payment.captured`, `payment.failed`, `refund.created`,
`refund.processed` and `refund.failed`. The webhook secret must exactly match
the backend setting. Alerts go to the confirmed operator email.

The worker URL belongs in the Vault entry `letsaimit_billing_worker_url`.
The existing Vault worker secret is reused by the minute scheduler. Enable
`private.billing_settings.enabled` only after a read-only live-credential check,
the active provider webhook configuration, signature/deduplication intake checks
and the selected ₹1 team policy are verified. Distinguish a locally signed smoke
event from actual Razorpay delivery: the first captured-payment event is verified
after the payer completes checkout. The settings check prevents real late fees
in team mode.

## Financial reliability

- Each registration/month and late-fee date is unique. A durable creation job
  records its intent before the provider request.
- Razorpay invoice creation has no documented general idempotency header. An
  ambiguous create is reconciled by its stable receipt; it is never blindly
  repeated. A bounded/incomplete scan needs operator attention, not another bill.
- Webhook signatures cover the exact raw bytes. Event IDs and payload hashes
  deduplicate retries. No invented five-minute cutoff rejects legitimate delayed
  provider delivery. Unknown early events remain available for later matching.
- A provider snapshot must match the saved receipt, amount, INR currency, invoice,
  order and payment. Authorization alone is not captured revenue. Refund totals
  include processed refunds only. Reordered events cannot reduce saved captures
  or refunds, or double-count them.
- Reminders and new late-fee invoices reconcile the parent bill first, then
  recheck the durable job. Retry/lease state survives worker errors. SMTP has an
  unavoidable at-least-once ambiguity if delivery succeeds but acknowledgement
  is lost; stable message IDs help mailbox deduplication.
- A browser sign-in does not grant admin access. Existing current-membership
  checks and account ownership remain separate capabilities.

Razorpay's API creates [non-GST invoices](https://razorpay.com/docs/api/payments/invoices/create-with-details).
This release does not invent a tax invoice, issue refunds, change bank accounts,
capture unrelated payments or configure an automatic debit mandate. Its hosted
invoice model also avoids the ₹5 authentication amount associated with some
[future-start subscription mandates](https://razorpay.com/docs/payments/subscriptions/workflow).
See the provider's [issued-invoice restrictions](https://razorpay.com/docs/api/payments/invoices/update),
[signature validation](https://razorpay.com/docs/webhooks/validate-test) and
[webhook delivery rules](https://razorpay.com/docs/webhooks/best-practices).

## Activation evidence

Source, automated tests, applied migrations, deployed functions and actual live
payments are recorded separately in [docs/RELEASE-PARITY.md](docs/RELEASE-PARITY.md).
A successful build is not evidence of a live charge. A ₹1 team payment should be
completed by its payer in Razorpay Checkout; no test should mark a bill paid by
editing the database or trusting a browser redirect.
