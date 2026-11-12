# Parent requests and admin notifications

This documents the request/review notifications in the existing React/Vite,
Supabase and Google sign-in flow. The current coaching-fee and Razorpay flow is
documented separately in [README-BILLING.md](README-BILLING.md). A coach workspace
is not included.
Website production requires its own explicit release authorization and configured
backend; do not point it at the UAT database to activate these features.

Activated on UAT on 10 November 2026. Live verification covered a Google parent
save, four SMTP-accepted admin alerts, the sender's inbox, saved review/parent
tracking, sign-out cleanup, a fresh Google round trip and the 28-column CSV.
The sender's Gmail inbox also showed a scheduled four-hour summary during the
later 10 November investigation. See `docs/RELEASE-PARITY.md` for source/deployment
references and the separate migration-history administration limitation.

## Product contract

- Parents may enter answers before signing in. A verified Google account is
  required for the final database save. Google sign-in uses the existing provider,
  callback and public LetsAimIt branding.
- A same-tab draft lasts at most 30 minutes through OAuth. Returning restores
  answers for review, clears consent/terms, and never automatically submits.
  The form states that it is not sent yet; the parent confirms consent and sends
  the final registration. A Google login alone must not be counted as a request.
- Google account ID owns a new request. Entered contact email does not establish
  ownership. Existing rows remain unclaimed; matching an email never transfers them.
- `/parent/` reads only the current account's projected requests. It cannot read
  internal notes, staff assignments, other parents or admin memberships.
- Parent identity and admin permission are independent. A Google account may use
  My requests and, when currently allowlisted, the team dashboard. This does not
  automatically grant coach permissions or create an exclusive account-role enum.
- A saved parent request creates one durable email job for each approved admin.
  Delivery rechecks membership and sends one message to one account at a time.
  New admins do not automatically receive historical individual alerts.
- Accept/Decline links carry navigation intent only. An approved admin signs in,
  reviews the request and explicitly confirms. The server saves an independent,
  audited decision with a revision check. Follow-up status remains separate.
- Accepting a free trial never creates a bill. Accepting a new paid enrolment
  requires an admin-entered monthly fee and the parent's current quoted-fee
  consent. The separate billing worker prepares and emails its Razorpay invoice;
  an approval itself is not a captured payment.
- The four-hour summary reports real saved requests and review decisions.
  Abandoned forms, attendance and time spent are not tracked. Pending payments
  and month-end fee summaries belong to the separate billing contract.

Parent trial/enrolment requests are covered. Existing society/school enquiry
integrations are preserved and are not silently routed into this parent queue.
Legacy Apps Script trial/enrol modes are retired in source; previously published
Apps Script versions and native forms have not been remotely audited or removed.
See `integrations/google-sheets/README.md` for the remaining deployment boundary.

## Deployment order

1. Review and test the complete ordered migrations, including
   `supabase/migrations/20261109204510_parent_review_notifications.sql`. Apply to
   the intended Supabase project only. Anonymous final-save execution and direct
   inserts are intentionally removed. Existing registrations are not backfilled
   into the new-request email queue.
2. Deploy `supabase/functions/admin-notifications/`. Its gateway JWT check is off
   because a separate backend-only bearer secret authenticates the worker. The
   handler rejects GET and missing/incorrect secrets; a public browser key cannot
   send emails or choose recipients/content.
3. Configure that project's function secrets below. Configure the matching URL
   and worker secret in Supabase Vault. Keep all of this outside `VITE_` variables,
   frontend files, Git, screenshots and operational logs.
4. Deploy the matching React source to UAT. The migration and frontend change the
   final-save contract together; do not claim an independent frontend release
   completes authentication or notification setup.
5. Verify signed-out submission rejection, a Google parent save/receipt, own-row
   isolation, admin review conflicts, and a synthetic notification received by
   approved admins. Enable dispatch only with a confirmed sender and credentials.
   Test SMTP provider acceptance separately from actual inbox receipt.

This repository uses Supabase CLI 3.x semantics. Read command `--help`; do not
guess remote-target flags or apply a migration to a default target. CLI login is
not established merely because the dashboard is signed in. Browser access must
not be converted into an extracted token.

Reuse the configured runtime secrets for later releases. The Google App Password
authenticates SMTP; it is not a Supabase deployment token. A short-lived,
project-scoped operator token authorizes deployment only, and its expiry does not
stop the running notification worker. Use an existing authorized token when
available, explicitly targeting the UAT project; never widen account access just
to run an account-wide project listing. Official account token creation is
distinct from extracting browser session credentials.

For the Supabase browser editor, a single-file build of the same source is available:

```sh
node scripts/build-notification-function.mjs /absolute/private/path/admin-notifications.bundle.ts
```

The bundle contains code, not credentials. The original function modules and
generated bundle should both pass Deno checking. Do not publish it under the
website's `public/` or `dist/` directory.

## Backend secrets

[Automation configuration](deployment/automations.json) maps the
sender settings to registration alerts, activity reports, billing and attendance.

| Name | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` with implicit TLS; 587 is blocked by hosted Edge Functions |
| `SMTP_USER` | Operator-confirmed Google sender account |
| `SMTP_FROM_EMAIL` | The same sender account; display name is LetsAimIt |
| `SMTP_PASSWORD` | That account's private Google App Password; ASCII grouping spaces are removed |
| `NOTIFICATION_CRON_SECRET` | A private random value of at least 32 characters |
| `ADMIN_DASHBOARD_ORIGIN` | `https://uat.letsaimit.com` on UAT; production origin on its separately configured project |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` come from the Edge runtime. They are
backend credentials, never public application configuration. Supabase Auth SMTP
settings handle authentication emails; they do not activate registration alerts.
This feature does not change Auth email settings or request Gmail mailbox access.

Vault needs `letsaimit_notification_worker_url` with the selected project's
`https://<project-ref>.supabase.co/functions/v1/admin-notifications` URL and
`letsaimit_notification_worker_secret` with exactly the same value as
`NOTIFICATION_CRON_SECRET`. Enter credential values privately in provider settings.

Dispatch starts off. After deployment and credential verification, the operator
may enable the intended project:

```sql
update private.notification_settings set dispatch_enabled = true where id;
```

Disabling that flag pauses delivery. Do not repeatedly toggle it to manufacture
summary windows or resend already delivered jobs.

## Delivery and summary behavior

`pg_net` asynchronously wakes the protected worker after a new request. A
`pg_cron` job wakes it each minute as recovery. SMTP is not part of the parent's
HTTP save path. The durable queue, leases and per-recipient keys prevent concurrent
workers from intentionally sending the same live job. Each failed delivery has a
bounded retry budget, after which its failure remains inspectable by the operator.

SMTP acknowledgement followed by a lost database acknowledgement is ambiguous:
delivery is **at least once**, not guaranteed exactly once. A stable Message-ID
helps identify retries. Provider acceptance does not prove inbox placement, and
Gmail quotas/deliverability are not guaranteed by an App Password or free hosting.

Summaries use closed, aligned UTC four-hour windows displayed in IST. The pending
count is the backlog at the recorded snapshot time, not an abandoned-form count.
Transactional activity records are assigned to a summary once. Activity committed
after an earlier window was snapshotted is reported separately as earlier activity
in the next summary; it does not silently change the displayed window's counts.
No new requests or review activity means no summary email.

## Verification record

For a missing request or alert, check the committed registration first, then
the per-admin outbox jobs, worker responses and recipient inbox. A filled draft
or successful Google login is not a saved request. Do not create consent, change
ownership by matching a contact email, or resend old alerts to make counts match.
The admin **Approved** metric counts accepted enrolment reviews; **Follow-up
status** tracks contact work and does not create an invoice. Parent request
errors stay visible, and the saved-row lists refresh after focus/save events
through their existing authorized reads.

Same-user Google token/session refreshes are not account changes. The auth
provider preserves in-flight remotely verified reads across those events while
still rechecking membership. Sign-out, a missing session or an actual subject
switch invalidates earlier results, including an A→B→A switch-back.

After a current, same-parent submission receives a validated saved receipt, the
parent modal closes automatically. Both mounted parent forms and their stored
OAuth drafts are cleared, including consent, validation and retry references;
trial carry-over cannot refill a completed enrolment. A short, account-bound
confirmation outside the modal links to **My requests**. Failed/unconfirmed
saves retain answers for retry. A delayed receipt can refresh saved-row readers
but cannot close or clear a newly opened or edited form. Google sign-in alone
does not submit the form or display a saved confirmation.

Source changes, local database tests, Deno checking, hosted migrations, SMTP
acceptance, inbox receipt and website deployment are separate evidence. Update
`docs/RELEASE-PARITY.md` with what was actually completed before describing this
feature as live. Never include parent records or credentials in that ledger.
