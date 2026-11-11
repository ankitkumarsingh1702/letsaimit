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
   The current set has eleven files, ending in
   `20261111045000_coaching_attendance_send_now.sql`. Do not add a seed, Auth users, test
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
   signup permission. Preserve its different-owner protection.
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
8. Run `supabase/checks/fresh_production.sql` with the same session references,
   after owner, extensions, cron and Vault setup. It is read-only and rejects
   application data, enabled dispatch/collections, missing RLS/grants or wrong
   scheduler/Vault routing. Keep `notification_settings.dispatch_enabled=false`
   and `billing_settings.enabled=false`, plus `coaching_settings.email_enabled=false`,
   through infrastructure preparation. Coaching assignments, attendance,
   feedback and email tickets must all remain empty on a fresh target.

Separately verify the five deployed source/configuration fingerprints, Data API
schema exposure, private Edge secret names, Google provider/callback and redirect
settings, endpoint guards and any approved SMTP/provider checks. Keep the public
OAuth brand LetsAimIt and canonical production homepage/privacy/terms. Do not
copy testing endpoints into a production OAuth client. The SQL function hashes
must be compared with the matching source baseline before claiming equivalence.

The coaching function also needs a separately provisioned domain SMTP sender and
`COACHING_EMAIL_SIGNING_SECRET`; see [coaching email configuration](../README-COACHING.md#backend-configuration-and-activation). Keep `COACHING_DYNAMIC_EMAIL_READY=false` until
the actual sender's Gmail dynamic-email approval and authentication requirements
are met. Neither that provider approval nor real in-Gmail attendance interaction
is established by a successful SQL check or function deployment.

Record source SHA, applied migration evidence, cloud configuration and remaining
prerequisites in `docs/RELEASE-PARITY.md`. A configured backend is not a verified
production parent journey. Production website promotion and financial activation
remain separate explicit actions.
