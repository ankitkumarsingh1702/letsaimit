# Fresh production backend

This procedure prepares a separate Supabase backend. It does not deploy the
production website, activate collections, copy UAT data or reuse UAT secrets.
For an existing database, compare applied versions first; do not use fresh setup
or empty its tables to satisfy a check.

1. Record the new production reference in `deployment/release-targets.json`.
   Keep it different from UAT. Run `npm run parity:plan`; retain its ordered
   migration hashes, function/dependency hashes and source digest as the baseline.
   A source plan is not evidence of application to the selected project.
2. Select that exact production project in the provider UI or an explicitly
   targeted CLI command. Run `supabase/checks/fresh_target_preflight.sql` before
   schema application. Provide the two manifest references as session settings:

   ```sql
   set letsaimit.production_ref = '<production reference>';
   set letsaimit.uat_ref = '<UAT reference>';
   ```

   These checks compare the supplied references; SQL cannot independently prove
   which provider endpoint the operator selected. Verify that connection too.
3. Enable the supported `pg_net`, `pg_cron` and Vault facilities. Keep `private`,
   `net` and `vault` out of Data API exposed schemas. The application uses
   `public` with explicit grants and RLS. The migrations conditionally enable
   Net/Cron but do not install Vault. Verify actual extension availability.
4. Apply all complete migration files in the exact order from the parity plan.
   The current set has **19 files**, ending in
   `20261119195608_owned_billing_webhook_intake.sql`. Do not add a seed, Auth users, test
   registrations, old reviews or financial records. Using a working authorized
   CLI connection records real migration history:

   ```sh
   npx --yes supabase@3.1.0 db push --help
   npx --yes supabase@3.1.0 db push --remote=<production-ref> --dry-run --skip-vault
   npx --yes supabase@3.1.0 db push --remote=<production-ref> --skip-vault --yes
   npx --yes supabase@3.1.0 migration list --remote=<production-ref>
   ```

   If a privileged SQL/API fallback is necessary, apply the same ordered bytes
   transactionally and record the actual files/hashes. Do not invent history
   timestamps or replay the schema to repair history. UAT's previously recorded
   manual-history limitation is not a template for a fresh target.
5. Use `supabase/bootstrap-owner.sql` as the separate privileged owner step.
   Substitute the authorized owner's exact Gmail privately. This seeds a new
   allowlist configuration; it does not copy an Auth user or grant a public
   signup permission. Preserve its different-owner protection. The repository
   contains a placeholder rather than an owner's identity. Use the account
   explicitly approved in the current release conversation; a Vercel owner,
   browser account or existing UAT membership alone does not establish this grant.

   Configure the independently verified default coach on this target. The two
   release identity settings below are supplied privately at runtime, are not
   secrets, and must match the explicitly approved identities:

   ```sql
   set letsaimit.approved_owner_email = '<approved owner Google Gmail>';
   set letsaimit.approved_coach_email = '<verified coach Google email>';
   update private.coaching_settings
     set default_coach_email=lower(btrim(current_setting('letsaimit.approved_coach_email')))
     where id;
   select private.activate_confirmed_students_default(
     current_setting('letsaimit.approved_coach_email'));
   ```

   The activation returns zero assignments on a genuinely empty target. It
   establishes the default for future accepted students without creating a
   coach login, enrolment or attendance row. The owner allowlist is also
   independent of Auth: the owner creates their real Auth record by completing
   the production Google sign-in flow. Do not create one through a copied UAT
   user or manufactured Google claims.
6. Deploy the five existing functions and shared modules to this explicit
   reference, retaining their checked-in gateway configuration:

   ```sh
   npx --yes supabase@3.1.0 functions deploy admin-notifications billing-worker razorpay-webhook delete-account coaching-worker --remote=<production-ref> --use-api --no-verify-jwt
   ```

   Each handler supplies its own bearer, signature or live-user boundary. Use
   `supabase/config.toml` and the parity inventory; do not prune other functions.
7. Provision production configuration independently. Required names are in the
   parity output. `ADMIN_DASHBOARD_ORIGIN` is `https://letsaimit.com`; the runtime
   supplies this project's Supabase URL and service credential. Use a fresh
   worker bearer and independently provisioned SMTP/provider secrets. Vault needs
   this project's notification/billing worker URLs and a worker secret matching
   its Edge `NOTIFICATION_CRON_SECRET`. The coaching worker derives its target
   URL from the existing notification worker URL and uses that same target's
   worker bearer. Four scheduled jobs cover notification, billing, account
   deletion and coaching attendance; each runs once per minute. Never print
   secret values in evidence.
   Their names are `letsaimit-admin-notifications`, `letsaimit-billing-worker`,
   `letsaimit-account-deletions` and `letsaimit-coaching-attendance`.
8. Run `supabase/checks/fresh_production.sql` with the same session references
   and both approved identity settings,
   after owner, extensions, cron and Vault setup. It is read-only and rejects
   application data, enabled dispatch/collections, missing RLS/grants or wrong
   scheduler/Vault routing. Keep `notification_settings.dispatch_enabled=false`
   and `billing_settings.enabled=false`, plus `coaching_settings.email_enabled=false`,
   `manual_email_enabled=false` and `parent_attendance_email_enabled=false`
   through infrastructure preparation. All 25 application tables are checked
   for RLS; private tables are checked for client table and column grants. Only
   one approved owner and the three singleton settings rows may exist.
   Registrations, coaching assignments, attendance, feedback, practice, email
   tickets/outboxes and financial records must remain empty on a fresh target.

   The check also verifies current Students/payment RPC privileges and identity
   locks, late-fee retirement, the removed manual parent-email RPC, Realtime,
   schedules and production Vault routing. It executes only reads inside a
   read-only transaction. Do not invoke worker, enqueue, claim, deletion or
   payment RPCs to inspect readiness; those are operational actions.

   Both webhook intake signatures are service-role-only:
   `ingest_owned_billing_webhook(text,text,text,text,text,uuid)` and the retained
   five-argument `ingest_billing_webhook(text,text,text,text,text)` wrapper.
   Neither `anon` nor `authenticated` may execute them. The new intake accepts
   only events owned by an existing local billing UUID or provider-ID mapping;
   foreign and unresolved events do not create receipts or jobs. A local early
   event may remain unlinked until the existing provider reconciliation binds
   its IDs. The legacy wrapper raises a retryable error for unresolved ownership
   instead of bypassing that boundary. Apply this migration before the updated
   webhook handler; do not replay earlier migrations on an existing target.

## Ordered source set and side effects

Keep each file complete. These are the current ordered migration versions;
the parity plan supplies their exact paths and hashes:

| Version | Result |
| --- | --- |
| `20261109080830` | Registration/admin tables, RLS, validated intake and Realtime membership |
| `20261109083344` | Restricts admin lookup and optional platform trigger privileges |
| `20261109121642` | Removes direct admin membership writes before controlled invitations |
| `20261109123953` | Restores validated Gmail invitations and protected owner handling |
| `20261109204510` | Google parent ownership/review, four notification tables, disabled dispatch, Net/Cron and minute notification job |
| `20261109225158` | Six billing tables, disabled collection, service RPCs and minute billing job |
| `20261110065359` | Custom fee quotes, future price changes and monthly summaries; updates fee settings while collection stays disabled |
| `20261110190347` | Account deletion/archive, revoked-identity checks and minute deletion recovery job |
| `20261110212805` | Five tracker tables, disabled daily email and minute coaching job |
| `20261110220027` | Tracker writes share the Auth identity lock with deletion |
| `20261111045000` | Explicit staff attendance-email action and saved status |
| `20261112213049` | Separate disabled manual-link delivery gate and email ticket mode |
| `20261112215334` | Target-specific coach default columns/triggers, initially unset |
| `20261112215500` | Explicit admin/coach tracker scopes |
| `20261118083629` | Retires late fees and reconciles/cancels any existing unpaid late-fee obligations |
| `20261118132944` | Students, practice attempts, disabled automatic parent attendance outbox and verified coach activation |
| `20261118135618` | Active accepted roster/profile, custom sprint distances and accepted-student assignment backfill |
| `20261118145719` | One-off invoices, logged outstanding adjustments and removal of manual parent attendance-email action |
| `20261119195608` | Service-only owned webhook intake and explicit legacy wrapper; preserves local early-event durability and rejects foreign-target persistence |

The migrations create four active minute schedules, but their handlers use
target-specific gates and durable queues. On a fresh target all queues are
empty. Account-deletion recovery has no dispatch toggle; its empty queue and
independently configured Vault routing remain essential. Supply only this
target's URLs and bearer when configuring Vault.

Applying these files to an existing database can change data. Late-fee removal
can queue provider cancellations, assignment upgrades can backfill students,
and future real user actions can create jobs even while dispatch is paused.
Do not replay this fresh procedure against UAT or an existing production
database. The read-only preflight is required before application.

Migration history must describe what actually ran. Retain the CLI migration
list and the parity hashes; for an approved SQL/API fallback, retain the exact
ordered files and actual execution evidence. The acceptance query does not
manufacture migration history or prove Edge source equivalence.

Separately verify the five deployed source/configuration fingerprints, Data API
schema exposure, private Edge secret names, Google provider/callback and redirect
settings, endpoint guards and any approved SMTP/provider checks. Keep the public
OAuth brand LetsAimIt and canonical production homepage/privacy/terms. Do not
copy testing endpoints into a production OAuth client. The SQL function hashes
must be compared with the matching source baseline before claiming equivalence.

Standard registration/billing mail, staff attendance links and parent attendance
notices use the independently provisioned `SMTP_*` Gmail configuration. The
notification handler validates matching sender/user, Gmail TLS on port 465 and
an app-password-shaped credential before processing. For staff links and parent
notices, the coaching worker requires a valid link transport before draining
its queue. The billing
worker requires valid live-provider configuration before any authorized drain;
an expected configuration error is not evidence of a working payment flow.

Interactive coaching email additionally needs a separately provisioned domain
SMTP sender and `COACHING_EMAIL_SIGNING_SECRET`; see
[coaching email configuration](../README-COACHING.md#backend-configuration-and-activation).
Keep `COACHING_DYNAMIC_EMAIL_READY=false` until
the actual sender's Gmail dynamic-email approval and authentication requirements
are met. Neither that provider approval nor real in-Gmail attendance interaction
is established by a successful SQL check or function deployment.

The production Razorpay webhook must target this production project's
`/functions/v1/razorpay-webhook`, with an independently configured matching
signature secret. README-BILLING's recorded UAT webhook URL is not a production
endpoint. Keep billing disabled until its documented provider and fee-policy
checks pass. Automatic parent notices require validated SMTP plus the explicit
`parent_attendance_email_enabled` gate; acceptance deliberately leaves it false.

For a local implementation check, run
`node --test tests/freshProductionDatabase.test.js`. It applies every migration
to an isolated PostgreSQL-compatible fixture, uses synthetic platform settings,
and verifies the read-only acceptance and failure boundaries. It does not
establish live Supabase extensions, actual provider delivery or Google sign-in.

Record source SHA, applied migration evidence, cloud configuration and remaining
prerequisites in `docs/RELEASE-PARITY.md`. A configured backend is not a verified
production parent journey. Production website promotion and financial activation
remain separate explicit actions.
