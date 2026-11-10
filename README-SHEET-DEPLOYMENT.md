# UAT registration and the private team register

The existing React/Vite website stays on Vercel. Parents submit trial requests
and child registrations inside the site. Supabase stores records in Postgres
and returns a matching saved receipt before the website confirms receipt.
Approved staff sign in with Google at `/sign-in/` and open the private dashboard at `/admin/`.
Google supplies staff identity; it does not store responses in Forms or Sheets.
CSV is a private download from the saved register, not its storage format.

Parent authentication and notifications were activated on UAT on 10 November
2026. [README-NOTIFICATIONS.md](README-NOTIFICATIONS.md) documents Google sign-in
before final submission, private parent tracking, admin review and queued email
alerts. See the latest release ledger for live delivery and login evidence;
the older checks below remain a dated record.

This setup is **UAT only**:

- Website: `https://uat.letsaimit.com`
- Supabase project reference: `nlgfcmywgwibvmbsgkox`
- Supabase URL: `https://nlgfcmywgwibvmbsgkox.supabase.co`
- Team register: `https://uat.letsaimit.com/admin/`

Keep production credentials, data and releases separate. The former PocketBase,
OAuth2-Proxy, Caddy, Docker and VPS instructions no longer apply.

## Environment variables

Use `.env.local` locally and Vercel's **Preview / uat branch** variables for UAT.
Rebuild after changing a `VITE_` value. These names match `.env.example`;
placeholders are not credentials.

The website project's Vercel environment inventory was checked on 9 November
2026: all five configured entries were scoped to **Preview / branch `uat`**.
There was no production Supabase configuration. A separate production backend
is still pending; this setup has not rolled these features out to production.

| Variable | UAT value or purpose |
| --- | --- |
| `VITE_SITE_ORIGIN` | `https://uat.letsaimit.com`; the Vercel build also selects it on `uat`. |
| `VITE_SUPABASE_URL` | `https://nlgfcmywgwibvmbsgkox.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | This project's public publishable key from Supabase; preferred browser-key name. |
| `VITE_SUPABASE_ANON_KEY` | Optional legacy public anon-key fallback. Leave blank when using the publishable key. |
| `VITE_GA4_ID` | Optional analytics ID; leave blank while analytics is unconfigured. |
| `VITE_GA4_MANUAL_EVENTS_ONLY_CONFIRMED` | `false` until the documented GA4 configuration is verified. |
| `VITE_LEAD_ENDPOINT` | Legacy school/society Apps Script setting; leave blank for their existing WhatsApp handoff. Parent registration does not use it. |
| `SUPABASE_URL` | Server-only health setting; the same UAT Supabase URL. Required on the dedicated health project's Production environment. |
| `SUPABASE_PUBLISHABLE_KEY` | UAT public project key used by the health handler; no service-role privilege is needed. |
| `CRON_SECRET` | Server-only random secret authorizing the health endpoint. The dedicated service uses its own secret, separate from the website's UAT health secret. |

`VITE_` values enter the public JavaScript bundle. Never put a database password,
service-role/secret key, Google client secret or `CRON_SECRET` there. The public
Supabase key identifies the project; grants, row-level security and validation
provide authorization. The newer publishable-key variable takes precedence
over the legacy anon-key variable.

## Database and separate owner bootstrap

Use the same ordered migration set for each configured target. Run
`npm run parity:plan` to inventory the current files and both target settings.
On an existing target, compare applied versions first; do not replay its schema:

1. `supabase/migrations/20261109080830_registration_register.sql`
2. `supabase/migrations/20261109083344_registration_function_privileges.sql`
3. `supabase/migrations/20261109121642_lock_admin_membership_to_operator.sql`
4. `supabase/migrations/20261109123953_restore_controlled_admin_invitations.sql`
5. `supabase/migrations/20261109204510_parent_review_notifications.sql` — applied
   to UAT on 10 November 2026 with the matching frontend and notification worker.
6. `supabase/migrations/20261109225158_monthly_billing_invoices.sql` — applied
   transactionally to UAT on 10 November 2026. Billing starts disabled; see
   [README-BILLING.md](README-BILLING.md) for activation and consented pricing.

The second migration makes `is_admin` an authenticated, security-invoker wrapper
and removes application-role access to the optional dashboard RLS helper.
Apply complete files, including functions, triggers, grants and policies;
copying only table definitions is insufficient. **The first four migrations
were applied to live UAT on 9 November 2026; the fifth and sixth on 10 November.** The third is a forward change that
accepts normalized company-domain Google email addresses and removes the earlier
broad membership-write rules. The following migration restores validated Gmail
invitations and protected revocation for current Google admins. This live UAT
application of the migrations does not establish their application to a future
production backend.

These six files were applied through the privileged SQL editor or an explicit
transaction using the scoped deployment credential. The CLI history table is
absent. An official `migration repair --status applied` attempt could
not connect because this network lacks IPv6. Do not rerun the existing schema
files as a workaround. Reconcile the six verified versions with CLI history
using an approved working database connection before a future automated schema
push; the manual application evidence is retained in the release ledger.

The initial owner is a **separate privileged operator step**, not a public signup
or an email embedded in the schema migration. Open
[`supabase/bootstrap-owner.sql`](supabase/bootstrap-owner.sql) after applying
the schema migration. Replace `REPLACE_WITH_OWNER_GMAIL` locally with the owner's
exact Gmail address and run it through the privileged SQL editor. The unchanged
template refuses to run, and an existing different owner requires separate
review. Keep real addresses out
of shared migration history. Until bootstrapped, an empty allowlist denies
staff access. The live UAT owner was seeded separately on 9 November 2026 and
its Google login was verified. The committed template contains no real Gmail.

Do not resolve an access failure with an unrestricted `grant all`. Table grants
and row policies are separate checks: a missing grant fails before an RLS
policy can allow an operation. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)

The checked-in database contract is:

| Caller | Operations |
| --- | --- |
| Anonymous parent | Enter answers locally; final database submission and private reads are denied after migration 5. |
| Google parent | Execute `submit_registration` for a validated save and receipt. `list_my_registrations` returns only that verified user ID's projected requests; it excludes contact details and internal notes. Existing unclaimed rows are not claimed by matching email. |
| Signed-in, unlisted account | May use the parent flow; no team register or membership access. Google login alone does not establish admin membership. |
| Allowlisted Google admin | Read registrations and membership; update only status, follow-up notes and assignee directly. Explicit Accept/Decline uses the audited, revision-checked `review_registration` RPC. Invite validated Gmail admins and revoke non-owner access; protected owner and last-admin rules remain enforced. Authorized deletion remains a database capability, not a grid action. |
| Database operator | Bootstrap the protected owner and carry out deliberate privileged maintenance. |

Both public tables have RLS enabled. Migration 5 removes anonymous save execution
and direct application INSERT grants. New parent ownership is assigned on the
server; parents read through a restricted projection RPC. Authenticated direct
UPDATE grants apply only to the three follow-up columns. Admin policies require current allowlist membership and a
Google-authenticated identity for private operations. The app may insert only an invited email address; it cannot set owner status or
modify identities. New app invitations accept Gmail addresses only. Existing
company-domain Google identities are configured by an operator. Protected owners
and the last remaining admin cannot be removed.

Submitted contact/child details, consent and receipt identity stay immutable to
ordinary admin edits. Retries use the same submission ID and fingerprint; a
changed payload using that ID conflicts. Parent privacy consent is version
`2026-11-09`; unchanged programme terms remain `2026-11-05`. Parent email
addresses may repeat for siblings.

One Google identity can be a parent and an approved admin simultaneously.
Coach permissions are independent and are not implemented by this release.

## Google sign-in configuration

**Google OAuth and the live owner's admin login were verified on 9 November
2026.** The configured Google Cloud project is `letsaimit-uat-20261109`.
The Google provider is enabled in the UAT Supabase project; the owner entered
its client secret directly into provider settings. The client uses basic
identity/email/profile access, without Gmail mailbox access.

Google OAuth publishing was confirmed as **In production**. This is the OAuth
application's audience status, **not Google brand verification**; the website
and database configuration described here remain UAT-only.

Google branding was saved on 9 November 2026 with public app name **LetsAimIt**,
the existing `public/assets/favicon-180.png` logo, homepage
`https://letsaimit.com`, privacy URL `https://letsaimit.com/privacy/` and terms
URL `https://letsaimit.com/terms/`. The initial **Verify branding** attempt failed only
on homepage ownership: `letsaimit.com` was not registered to the Google Search
Console owner. Google's displayed next step was to verify ownership and wait
24 hours before retrying.

The approved Google ownership TXT record was subsequently saved in GoDaddy.
The UI showed **Success** and 19 records; the requested TXT value was confirmed
on authoritative nameservers `ns27`/`ns28` and public resolvers `8.8.8.8` and
`1.1.1.1`. Around **9 November 2026, 20:01 IST (14:31 UTC)**, Search Console
confirmed **Ownership verified**, using **Domain name provider**. Keep that TXT
record, as instructed by Search Console. The existing A record `216.198.79.1`,
`www`/`uat` CNAMEs and MX records were unchanged; production's homepage response
hash was also unchanged.

Allowing the stated 24-hour wait, the conservative branding retry time is
**10 November 2026 after 20:05 IST (14:35 UTC)**. Google brand verification has
**not** been retried or passed, and no Google app-brand publication has been
completed. Domain ownership verification and saved branding settings do not
establish brand approval.

Keep the single public name and production policy URLs across environments.
Internal resource names may identify their target. Follow Google's
[environment separation policy](https://developers.google.com/identity/verification/authentication-policy-compliance#use-separate-projects-for-testing-and-production)
when preparing production's internal Google project/client; common branding
does not require one client ID shared between test and production.
The configuration steps below document that setup for future reproduction.

1. Configure Google's OAuth consent screen and create an OAuth **Web application**
   client. Add intended staff as test users if Google's Testing mode requires it.
2. Add `https://uat.letsaimit.com` as an authorized JavaScript origin. Add the
   project's Supabase callback as an authorized redirect URI:

   ```text
   https://nlgfcmywgwibvmbsgkox.supabase.co/auth/v1/callback
   ```

3. In Supabase Authentication provider settings, enable Google and enter the
   client ID and secret. Keep the secret in provider configuration, not React
   or Git.
4. In Supabase Authentication URL Configuration, set the UAT Site URL and allow
   `https://uat.letsaimit.com/admin/` as the application redirect. This differs
   from Google's Supabase callback URL.
5. After operator configuration, test the actual Google round trip from `/sign-in/`.
   The button uses the existing Supabase Google provider and the same stored OAuth
   client configuration; no client secret is added to React. The four initial
   approved memberships, including the company Google account, were verified
   on live UAT on 9 November 2026. Confirm they remain present; later valid Gmail
   invitations can increase the team size. An unlisted Google account must remain denied. **Request access** opens
   an email draft to the existing public programme contact; it does not send a
   message, save a request or grant membership automatically.

The four initial exact addresses are operator configuration, not public source. Prepare
the access synchronization in the ignored `supabase/configure-admin-access.sql.local`
file. Apply it only to the named UAT project after the required browser access-change
confirmation. It preserves the current owner, adds the approved three other
accounts and returns the membership list. That initial configuration has been
applied and its four memberships verified on UAT. It does not remove later valid invitations.
The Team screen allows current admins to invite additional Gmail accounts and revoke
non-owner access. Input is trimmed and lowercased; malformed/non-Gmail addresses and
duplicates receive clear errors, while the database remains the final authority.
The existing company-domain account remains supported; adding further company
accounts requires deliberate operator configuration. No invitation email is sent
automatically. Share the `/sign-in/` link after a successful invite.

The app uses Supabase Auth's PKCE flow. See the official
[Google sign-in setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
No Gmail mailbox permissions are required for this identity flow.

## Live dashboard, conflicts and CSV

The dashboard and register load all saved pages, offer search/filter/sort and keep
follow-up edits as drafts until **Save**. Summary cards and register use the same
IST date period. Counts represent saved requests, including any UAT test submissions;
they are not unique children, payments or attendance. Website engagement remains
untracked. Request details show immutable parent/child input, consent and safe
Call/Email/WhatsApp actions. Opening a contact link never marks a request contacted. Updates include the row revision;
a competing edit cannot silently overwrite a newer revision. Review the latest
row before resaving a retained draft. CSV contains saved values, rather than
unsaved edits, and formula-like cells are neutralized for spreadsheet use. CSV includes every
matching saved page and excludes unsaved drafts. An initial load failure shows
a retry state instead of fabricated zero metrics. On sign-out or access revocation,
private views and drafts unmount. A sign-out gate prevents queued checks from
restoring the previous identity; overlapping access checks share their result.

The migration adds `registrations` to `supabase_realtime` where that publication
exists. Confirm its membership in the hosted project's Realtime settings.
The UI subscribes to Postgres Changes, which remains subject to authorized
SELECT policies. It also refreshes visible tabs every five seconds and on focus,
checks membership and clears access after revocation. `allowed_admins` is not
published; the periodic membership check handles access changes.
[Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)

Removing access blocks subsequent authorized operations. It cannot recall
already viewed information or downloaded CSV files. Authorization comes from
Supabase Auth and current database policies, not a hidden URL or `noindex`.

## Dedicated UAT health service and scheduler

The separate Vercel project **`letsaimit-uat-health`**
(`prj_b2ukrZEvKBocsCwMcYuiMCMuJL47`) executes the schedule. Its repository
root directory is `deployment/uat-health`; it serves only the health API and a
small identifying page. It uses the existing Hobby team and the same UAT
Supabase database, `https://nlgfcmywgwibvmbsgkox.supabase.co`.

This project's **Production branch is `uat`**. Vercel requires a
Production deployment to execute cron jobs, so this service uses that execution
environment to check the UAT database. The main `letsaimit` website's Production
branch remains `main`; this does not promote the UAT website or change its
production data. The website root `vercel.json` no longer contains the schedule.

Use these settings on the **health project**, not the website project:

- Root directory: `deployment/uat-health`; framework: Other.
- Build command: `npm run build`; output directory: `public`.
- The checked-in install command is
  `npm install --ignore-scripts --no-audit --no-fund`.
- Production environment: only `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
  its independent `CRON_SECRET`. No `VITE_` variables or Google OAuth secrets.

Deploy the service from `uat` after those settings are saved. A change to its
secret requires a new deployment; retain its secret in the operator's secret
manager independently of the website health endpoint's secret.

`deployment/uat-health/api/cron/supabase.js` accepts only an authenticated GET with
`Authorization: Bearer <CRON_SECRET>`. It invokes only `registration_health`,
a non-data RPC, and returns `{"ok":true}` after a successful database response.
Missing configuration or a failed check returns 503; a bad secret returns 401.
It exposes no registrations, keys or provider exceptions. The website's
`api/cron/supabase.js` re-exports the same handler and retains its separate
environment settings.

The service's own `vercel.json` contains `0 6 */3 * *`: 06:00 UTC / 11:30 IST
on days 1, 4, 7 and subsequent three-day steps within each month. It resets at
month boundaries rather than guaranteeing exactly 72 hours. Hobby can invoke
the job anywhere within the scheduled hour.

After its Production deployment is READY, inspect this service's Cron Jobs page
and use **Run now** to verify an authorized invocation. Record that result
separately from a future invocation triggered by the three-day schedule.
The website's `uat` Preview deployment does not execute the schedule itself.
[Vercel cron management](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs),
[scheduling limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)

A health request is **not a guarantee that a Free project never pauses** or that
usage always remains free. Supabase may pause low-activity Free projects.
Review the account's actual plan, usage and pausing notifications. A three-day
request is not an always-on commitment.
[Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

After deploying the dedicated service, run this in an interactive terminal using
**that service's** secret. It reads the secret without echoing it or placing it
in command arguments, refuses redirects, and prints only a health result:

```sh
python3 - <<'PY'
import getpass
import json
import urllib.error
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

secret = getpass.getpass("UAT cron secret (hidden): ")
if not secret:
    raise SystemExit("No secret supplied.")
request = urllib.request.Request(
    "https://letsaimit-uat-health.vercel.app/api/cron/supabase",
    headers={"Authorization": "Bearer " + secret},
)
try:
    opener = urllib.request.build_opener(NoRedirect)
    with opener.open(request, timeout=12) as response:
        healthy = response.status == 200 and json.load(response) == {"ok": True}
except urllib.error.HTTPError as error:
    raise SystemExit("Health check failed: HTTP " + str(error.code))
except (urllib.error.URLError, TimeoutError, ValueError):
    raise SystemExit("Health check could not be confirmed.")
if not healthy:
    raise SystemExit("Health check did not confirm database access.")
print("UAT registration database health: OK")
PY
```

## Build, UAT release and verification

`npm run --silent parity:plan -- --target all` derives a deterministic inventory
of the same SQL, function modules, dependency metadata and secret names for both
targets. Use `--target uat` or `--target production` to inspect one target. This
read-only planner neither reads secret values nor applies migrations. A missing
production reference stays pending; it never defaults to UAT. Actual applied
backend and user-journey evidence remains in the release ledger.

After the migration, owner bootstrap and UAT configuration:

```sh
npm ci
npm test
npm run verify:assets
VITE_SITE_ORIGIN=https://uat.letsaimit.com npm run build
npm --prefix deployment/uat-health run build
```

Merge the verified change into `uat` and wait for its Vercel Preview build.
Do not merge to `main` or reuse the UAT database for production during this setup.
Confirm the deployed frontend uses the intended public project URL/key.

The Vercel build runs `npm run release:build`: target configuration guard,
both-target backend inventory, the complete automated suite, then the optimized
frontend build. The inventory is written to `/tmp/letsaimit-backend-parity.json`
on the build runner and contains hashes and configuration names only. It is not
a public website asset or evidence of a synced production backend.

The configuration guard runs `scripts/check-release.mjs` against
[`deployment/release-targets.json`](deployment/release-targets.json). Its UAT
entry records `nlgfcmywgwibvmbsgkox`; the production project reference is `null`
until a separate backend is configured. Release builds check branch, site origin,
backend URL and public-key configuration, rejecting missing configuration and
private-key formats. Production release configuration currently fails closed.
Modern publishable keys are checked only for presence/type offline, not proven
to belong to the selected project. The guard does not verify applied migrations,
database grants, OAuth or a live journey. Other feature Preview builds are not
certified release-ready by passing this guard.

Application source `4e62f70fcb5c10ad80aa7ce62cccccaf3c24dc66` was released to UAT
after **123 automated tests**, including seven release-guard tests, passed on
9 November 2026. The recorded UAT head
`5947201c3870505bc433f05c1d607f5047b87d65` is a documentation-only descendant
with the same application code. Its deployment
`dpl_BXkARvtkNzdUUNMuqDAj9gRxCdFd` reached **READY** and is aliased to
`https://uat.letsaimit.com`. Production remains on its recorded baseline.
See [docs/RELEASE-PARITY.md](docs/RELEASE-PARITY.md) for the separate source,
deployment, Google verification and production-readiness evidence.

### Observed live UAT checks — 9 November 2026

[PR #1](https://github.com/ankitkumarsingh1702/letsaimit/pull/1) was merged to
`uat` at commit `d691b1c1bcdac475dbcc922592fad96b990ac551`.
[Vercel deployment 98qHQPZtB7jGmxbAwAy5hMMVcfgx](https://vercel.com/ankit-kumar-singhs-projects-390074cd/letsaimit/98qHQPZtB7jGmxbAwAy5hMMVcfgx)
reached READY, and its GitHub deployment status is successful.

The following were observed against live UAT:

- A real Google owner login opened the private admin grid and initially showed
  three synthetic records.
- A parent trial request for age 14 was submitted through the UAT website,
  saved successfully and appeared as the fourth synthetic record in the open
  admin grid without a manual reload. Realtime and fallback refresh were enabled.
- A record's **Contacted** status was saved successfully.
- Signing out immediately cleared the private grid. Adding the existing owner
  showed a duplicate-access message that survived the background refresh.
- The browser downloaded CSV containing four saved data rows and 21 columns at
  the time of verification; it parsed correctly and retained the saved status.
- The health endpoint returned HTTP 200 for an authorized request and HTTP 401
  for an unsigned request.

The browser journeys for an unlisted Google login, revocation of an active
admin, and competing edits by two real admins remain unproven. Local SQL tests
cover their authorization and conflict rules.

The dedicated health service was subsequently deployed from
[PR #3](https://github.com/ankitkumarsingh1702/letsaimit/pull/3), merged to `uat`
at `7e222bda2984ced59a13f83103ee8d88df36c7c9`. Deployment
`dpl_GVs7z8qnGJQmThZdmc2VWSfwjFJB` reached READY at
[`letsaimit-uat-health.vercel.app`](https://letsaimit-uat-health.vercel.app).
Its Vercel Cron Jobs page showed `/api/cron/supabase` as **Active** with
`0 6 */3 * *`. An authenticated request returned HTTP 200 with `{"ok":true}`;
an unsigned request returned HTTP 401. The dashboard's **Run** action also
produced a GET `/api/cron/supabase` request with HTTP 200 in Vercel Request Logs
at `2026-11-09T08:54:22.859Z`, confirming Vercel's credential delivery. A future
three-day scheduled invocation has not yet been observed; activation, the manual
endpoint checks and the platform-triggered test are verified.

Verification has separate layers:

- Automated tests: shared field rules, drafts/focus, transport failures/receipts,
  SQL grants/RLS/triggers, concurrent saves, retry/conflict behavior, row revisions
  and health-handler authorization.
- Parent UAT browser after migration 5: enter answers signed out, complete Google
  sign-in, review consent again and submit once; confirm only after a matching
  receipt. Verify own-row isolation, sign-out cleanup and account changes.
- Staff journey: real Google login, unlisted account denial, invitations and
  revocation, two-admin conflicts, live updates and private CSV download.
- Operations: a successful live health request and, when provisioned, an observed
  scheduled run against the UAT database.

Local tests, a public save, a migration result and a Google sign-in test are
separate evidence. Record what actually passed; a frontend deployment alone
does not prove OAuth or scheduled-job readiness.

Keep future verification notes specific to the actual environment and checks.
Do not put real owner emails, OAuth secrets, session tokens or private parent
records into this guide or migration history.
