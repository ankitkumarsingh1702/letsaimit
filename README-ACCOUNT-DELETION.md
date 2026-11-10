# Account deletion

One LetsAimIt login may be a parent, admin and coach. Deletion closes that whole
LetsAimIt account; it does not delete the person's Google account or the shared
OAuth application. The parent dashboard's Account section starts an explicit,
unchecked permanent-deletion/no-refund confirmation. The owner must transfer
ownership before deleting; the existing owner protection is retained.

## Data and identity

The existing permanent registration, billing-account, invoice and ledger IDs are
retained. Their Auth ownership links already use `ON DELETE SET NULL`; a new
generic profiles hierarchy is unnecessary.

1. The Edge Function remotely verifies the Google user and compares that UID
   with the account shown in the confirmation. A request body cannot choose a
   different deletion subject.
2. One service-only transaction locks the subject, records the policy/forfeit
   consent and private snapshots, removes non-owner admin membership, closes
   coaching and queued customer notifications, and scrubs live registration
   details. Private snapshots have RLS and no application-role table grants.
3. The account tombstone immediately blocks parent/admin data operations,
   including still-unexpired JWTs. The Auth SDK revokes refresh sessions and
   calls `auth.admin.deleteUser(id, false)` on the server. Service credentials
   are never included in the website bundle.
4. Durable, leased recovery retries a temporary Auth failure. `deleted` is
   returned only after the database verifies that the old Auth UID is absent.
   `deleting` means app access is closed while login removal is pending. The
   browser clears its local session, private views and OAuth/form drafts.
5. Signing in later with the same Google/email creates a new Auth UID. Requests,
   children and coaching history are never joined by email or phone. The new
   identity therefore has no old requests or plan; removed admin access does
   not return automatically.

The current product uses Google sign-in. This change does not add a phone-OTP or
email-password login method. All supported future methods must preserve the
same UID boundary.

## Financial history

Deletion does not issue refunds, rewrite paid invoices, erase ledger movements,
or create a replacement invoice. It stops future coaching cycles, late fees and
customer reminders. Unpaid hosted Razorpay invoices are queued for verified
cancellation. A link is closed only when the provider confirms cancellation;
Auth deletion alone does not cancel a hosted payment link.

An invoice creation already in flight may have reached Razorpay. Its durable
receipt is reconciled rather than blindly issuing another invoice. A payment or
refund that races deletion still updates the old invoice/ledger, without
reattaching the deleted parent or sending new customer emails. Already-sent
emails and external calls in flight cannot be recalled. Periodic accounting
recovery for archived invoices continues even with new billing disabled.

## Runtime configuration and recovery

`delete-account` uses the existing server-provided `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, configured `ADMIN_DASHBOARD_ORIGIN`, and the existing
`NOTIFICATION_CRON_SECRET`. No new public secret is required. Its gateway JWT
switch is off because the handler separately verifies user tokens and the
backend recovery bearer. The public endpoint never accepts a worker-selected
subject from the body.

The minute cron reuses the existing Vault notification-worker origin/secret
and wakes only persisted deletion work. Leases prevent overlapping attempts;
after eight failed attempts, the account remains blocked with a fixed failure
code for operator review. Repeating the authenticated deletion request resumes
a failed attempt without another snapshot or duplicate financial record.
Storage objects owned by an Auth user can prevent Supabase Auth deletion; that
failure must be resolved without blindly deleting retained user files.

Operational diagnostics contain only correlation tags, fixed outcomes and
elapsed time. They contain no identity, token, contact details or archived data.

## Verification and release

The migration and function are included in `npm run parity:plan` for both
targets. Apply the same source to each configured backend; a source plan does
not prove cloud parity. Production's backend reference remains a separately
recorded prerequisite, never substituted with UAT.

Run `npm test`, `npm run build`, asset verification and Deno checks. Database
regressions include real migration-chain RLS/FK tests, stale-token rejection,
same-email/new-UID isolation, retry leases, provider capture/refund preservation,
and the HTTP handler composed with a local Postgres-compatible database and
mock Auth deletion. Browser fixtures exercise actual React components with
mock responses. Neither establishes a real Google delete-and-relogin journey.
Do not delete a real user or make a live payment merely to satisfy a release
check. Record cloud application, endpoint guards and actual browser evidence in
`docs/RELEASE-PARITY.md`.
