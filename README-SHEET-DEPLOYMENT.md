# UAT registration and the private team register

The existing React/Vite website stays on Vercel. Parents submit trial requests
and child registrations inside the site. Supabase stores records in Postgres
and returns a matching saved receipt before the website confirms receipt.
Invited staff sign in with Google at `/admin/` and use AG Grid Community.
Google supplies staff identity; it does not store responses in Forms or Sheets.
CSV is a private download from the saved register, not its storage format.

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

Apply these migrations in order using the UAT project's SQL editor or its
established migration workflow:

1. `supabase/migrations/20261109080830_registration_register.sql`
2. `supabase/migrations/20261109083344_registration_function_privileges.sql`

The second migration makes `is_admin` an authenticated, security-invoker wrapper
and removes application-role access to the optional dashboard RLS helper.
Apply complete files, including functions, triggers, grants and policies;
copying only table definitions is insufficient. Both migrations were applied
to the live UAT project on 9 November 2026.

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
| Anonymous parent | Execute `submit_registration` for a validated save and receipt. Direct INSERT is limited to the four intake columns and remains trigger-validated. No registration/allowlist reads, edits or deletes. |
| Signed-in, unlisted account | No private records or team access. Google login alone does not establish membership. |
| Allowlisted Google admin | Read registrations and membership; update only status, follow-up notes and assignee; add/remove admins. The database also permits authorized registration deletion, although the current grid does not expose a delete action. |
| Database operator | Bootstrap the protected owner and carry out deliberate privileged maintenance. |

Both tables have RLS enabled. Anonymous INSERT grants apply only to `full_name`,
`email`, `phone` and `metadata`. Authenticated UPDATE grants apply only to the
three follow-up columns. Policies require current allowlist membership and a
Google-authenticated identity for private operations. The owner cannot be
removed through the app; a transaction protects the last-admin boundary.

Submitted contact/child details, consent and receipt identity stay immutable to
ordinary admin edits. Retries use the same submission ID and fingerprint; a
changed payload using that ID conflicts. Parent privacy consent is version
`2026-11-09`; unchanged programme terms remain `2026-11-05`. Parent email
addresses may repeat for siblings.

## Google sign-in configuration

**Google OAuth and the live owner's admin login were verified on 9 November
2026.** The configured Google Cloud project is `letsaimit-uat-20261109`.
The Google provider is enabled in the UAT Supabase project; the owner entered
its client secret directly into provider settings. The client uses basic
identity/email/profile access, without Gmail mailbox access.

Google OAuth publishing was confirmed as **In production**. This is the OAuth
application's audience status; the website and database remain UAT-only.
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
5. After owner bootstrap, test the actual Google round trip from `/admin/`.
   Under **Admin access**, add another exact Gmail address and verify that
   account separately. Adding membership does not send an invitation email.
   An unlisted Gmail must remain denied.

The app uses Supabase Auth's PKCE flow. See the official
[Google sign-in setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
No Gmail mailbox permissions are required for this identity flow.

## Live grid, conflicts and CSV

The grid loads saved rows with paging, offers search/filter/sort and keeps
follow-up edits as drafts until **Save**. Updates include the row revision;
a competing edit cannot silently overwrite a newer revision. Review the latest
row before resaving a retained draft. CSV contains saved values, rather than
unsaved edits, and formula-like cells are neutralized for spreadsheet use.

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

Configure this project's **Production branch as `uat`**. Vercel requires a
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
- The browser downloaded CSV containing four saved data rows and 21 columns at
  the time of verification; it parsed correctly and retained the saved status.
- The health endpoint returned HTTP 200 for an authorized request and HTTP 401
  for an unsigned request.

The browser journeys for an unlisted Google login, revocation of an active
admin, and competing edits by two real admins remain unproven. Local SQL tests
cover their authorization and conflict rules. The dedicated health project has
been created; its deployment and Run now results must be recorded after
verification. A future three-day scheduled invocation has not yet been observed.

Verification has separate layers:

- Automated tests: shared field rules, drafts/focus, transport failures/receipts,
  SQL grants/RLS/triggers, concurrent saves, retry/conflict behavior, row revisions
  and health-handler authorization.
- Signed-out UAT browser: save trial/enrolment once; confirm only after a matching
  receipt; preserve failed drafts; make WhatsApp optional.
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
