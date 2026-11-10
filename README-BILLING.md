# Monthly payments

The existing React, Google sign-in, Supabase and SMTP setup is retained. A parent
sends an enrolment request and separately agrees to the displayed payment terms.
An admin accepts it with a monthly fee. The backend creates a Razorpay hosted
invoice and emails the approval and payment link to the parent. A free trial
never creates a bill.

Parents pay each hosted invoice themselves. This is monthly invoicing, not an
automatic debit mandate. A return from Razorpay does not prove payment. The
server fetches and verifies the provider invoice, linked order and captured
payment before recording money received.

## Price and schedule

- Admins enter each child's monthly fee at approval. **₹6,000** is the admin
  input's starting suggestion, not a public fixed plan. ₹1 is valid for the
  user's manual payment test. Amounts are ₹1–₹1,00,000, with up to two decimals.
- First invoice: due on approval. Following calendar months: invoice on the 1st,
  due by the end of the 5th, in India Standard Time.
- Admin fee changes take effect from the **next calendar month**. The fee-change
  email and next invoice show the saved amount before payment. Existing invoices never change.
  If no change is saved, the current fee continues.
- Unpaid reminders have four daily slots: **09:00, 12:00, 15:00 and 18:00 IST**.
  Each parent receives one grouped reminder per slot across their children and
  unpaid invoices. Recovery sends the current slot only, not missed reminders.
  Paid invoices are removed from reminders after provider reconciliation.
- **₹100 per overdue day** applies under the new quoted-fee agreement. Issued
  invoices cannot change amounts; late fees are separate invoices. A normal
  calendar invoice accrues these charges from the 6th while unpaid.
- Existing fixed-price agreements and legacy team accounts retain their saved
  amounts and fee policy. They are not silently converted to quoted pricing.
- Stopping monthly billing stops future cycles. Existing issued invoices remain
  payable. This does not initiate a refund or cancel an existing provider invoice.

## Month-end review

At **18:00 IST on the last calendar day**, current admins receive one summary of
the following month's active children, planned fees and expected total. Earlier
unpaid invoices appear as a separate outstanding balance. The Billing screen
shows the same upcoming-month list and allows next-month fee changes. The email
is a dated snapshot; the dashboard shows the latest saved plan.

## Saved data and interfaces

All monetary values are integer paise; currency is INR. The database owns prices,
dates, parent ownership, queue recipients, invoice identities and account states.
Only current admins can choose fee amounts through the validated approval and
next-month fee-change RPCs. Parent form payloads cannot select charge amounts.

| Interface | Access | Result |
| --- | --- | --- |
| `get_billing_terms()` | Public | Versioned quoted-fee policy and admin input defaults only |
| `submit_registration(payload)` | Verified Google parent | Durable registration receipt; new quoted enrolments require the current policy version and explicit quoted-fee consent |
| `review_registration(p_id,p_decision,p_expected_revision,p_monthly_amount_paise)` | Current approved admin | Audited Accept/Decline; a new paid enrolment requires a valid admin quote |
| `set_monthly_coaching_fee(p_registration_id,p_amount_paise,p_expected_revision)` | Current approved admin | Audited, revision-checked fee change effective next month |
| `list_my_billing()` | Verified Google parent | That user's invoice history and billing accounts |
| `list_admin_billing()` | Current approved admin | Saved invoices, accounts and aggregate totals |
| `cancel_billing_account(p_registration_id,p_expected_revision)` | Current approved admin | Audited stop of future billing, guarded by revision |
| `billing-worker` | Backend bearer only | Bounded create/reconcile/email jobs; request bodies choose no bills or recipients |
| `razorpay-webhook` | Valid Razorpay raw-body HMAC | Durable event receipt before acknowledgement |

The parent and admin dashboards use compact single-line rows, status/search
filters, payment/invoice links and saved-row CSV. The parent sees child, month,
fee, due date, late fee, total and status. Global totals are independent of filters. They
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
and the current quoted-fee policy are verified. Distinguish a locally signed smoke
event from actual Razorpay delivery: the first captured-payment event is verified
after the payer completes checkout. Preserve legacy account policy instead of
upgrading old prices or enabling their previously disabled fees.

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
- Grouped reminders reconcile pending invoices in bounded chunks across retries
  before sending a complete outstanding total. A large parent group must make
  progress rather than permanently defer or send a partial total.
- Fee edits check the account revision and retain who changed what and when.
  A superseded fee notice is not sent as the current fee. Month-end emails check
  current admin membership before sending and are deduplicated per recipient/month.
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
A successful build is not evidence of a live charge. The user completes manual
payment testing through Razorpay Checkout, with an admin-selected ₹1 quote if
desired. Automated verification uses mocked provider/SMTP calls and local SQL;
no test should mark a live bill paid by editing the database or trusting a redirect.
