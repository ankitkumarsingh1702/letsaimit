# LetsAimIt release parity

This ledger records evidence, not permission to deploy. It is project-local.
The default **merge and deploy** target is UAT. Production work requires the
explicit **merge and deploy to prod** instruction.

Latest tested application source: `f1c4bbbec7d20c9d7e6827aa8094b2e574d37e41`
(fresh-start account deletion with retained billing history, automatic close/reset after a confirmed parent save, same-account auth refresh protection, clear unsent enrolment instructions,
saved-row refresh, visible parent requests and actual approved-enrolment counts;
retains the quoted coaching-fee flow).
UAT deployment evidence is recorded below. Manual live-payment testing is
reserved for the user.
Earlier tables remain a dated record.

Latest verified UAT workflow source: `f22e83265d612da094234699a4834f7248b2ef67`
(project-local parity workflow and release checks; no additional product UI change).

## Public identity contract

| Setting | Required value in both environments |
| --- | --- |
| Public product / Google OAuth app name | `LetsAimIt` |
| Public app homepage | `https://letsaimit.com` |
| Public privacy policy | `https://letsaimit.com/privacy/` |
| Public terms | `https://letsaimit.com/terms/` |
| Google provider configuration | Shared branding/template; reuse a client only where Google permits it, otherwise separate internal projects/clients with the same public name and target-specific callbacks |

UAT and production remain separate technical targets. Their resource names,
database references and build settings may identify the target; the public
product and OAuth display name do not gain an environment suffix. Google's
[environment separation policy](https://developers.google.com/identity/verification/authentication-policy-compliance#use-separate-projects-for-testing-and-production)
requires separate test/production projects and production-only endpoints in
production clients. A common public identity does not imply one shared client
ID. Production setup may be prepared alongside UAT within the authorized scope;
this does not itself activate a website production release.

## Target state recorded on 9 November 2026

| Item | UAT | Website production |
| --- | --- | --- |
| Git target | `uat` | `main` |
| Website | `https://uat.letsaimit.com` | `https://letsaimit.com` |
| Recorded source | UAT head `5947201c3870505bc433f05c1d607f5047b87d65`, a documentation-only descendant of application release `4e62f70fcb5c10ad80aa7ce62cccccaf3c24dc66` | Unchanged baseline `372be17da151f45d42c54b42b36d2d50ef51758a` |
| Source relationship | Branding/profile application changes were released to UAT | Carrying that UAT feature set remains pending explicit production promotion |
| Backend target | Supabase project `nlgfcmywgwibvmbsgkox` | A separate Supabase target is the planned production configuration, not a live or verified backend; production readiness is unknown |
| Google sign-in | Existing Supabase Google provider and live UAT login flow | Separate internal Google project/client with common LetsAimIt branding is the planned policy-compliant configuration; provider, callback and redirect setup still need verification |
| Registration/admin features | Native parent forms and durable receipts, private dashboard, saved follow-up edits, CSV, controlled Gmail invitations and realtime refresh | Live parity for these features is not established by the recorded production source |
| Database migrations | All four ordered migrations were applied to live UAT on 9 November 2026 | Applied versions, RLS, grants, Realtime and owner bootstrap have not been confirmed |
| Admin memberships | Four initial approved memberships were verified; current admins may invite additional validated Gmail accounts | Production owner/membership setup has not been verified; do not copy UAT memberships as an implicit grant |
| Vercel environment inventory | All five configured website entries were scoped to Preview / branch `uat` on 9 November 2026 | No production Supabase configuration was present; separate production target setup remains pending |
| Public branding update | Saved Google app name `LetsAimIt`, existing favicon-180 logo and production homepage/privacy/terms URLs | Common branding/template is established; production provider setup and live verification remain pending |
| Brand review / custom auth domain | Search Console ownership is verified after the approved TXT addition; brand-verification retry waits until after 10 November 2026, 20:05 IST | Brand approval and custom auth-domain setup are not established; no automatic approval or free domain setup is promised |
| Test data | Labelled UAT test submissions may exist and are included in saved-request counts | Do not copy UAT rows; do not create production test submissions without a deliberate authorized test plan |
| Website engagement metrics | Not tracked; the UI must not invent durations | No tracking or duration claim established |

Application release `4e62f70fcb5c10ad80aa7ce62cccccaf3c24dc66` and its
documentation-only UAT descendant `5947201c3870505bc433f05c1d607f5047b87d65`
are recorded separately from production's unchanged baseline. The latest
verified UAT deployment is listed below. The four migrations verified on UAT are:

1. `20261109080830_registration_register.sql`
2. `20261109083344_registration_function_privileges.sql`
3. `20261109121642_lock_admin_membership_to_operator.sql`
4. `20261109123953_restore_controlled_admin_invitations.sql`

The initial Google **Verify branding** attempt found only the homepage ownership issue:
`letsaimit.com` was not registered to the Google Search Console owner. The
displayed next step was to verify that ownership, then wait 24 hours before
retrying. The approved TXT record was then saved in GoDaddy, whose UI showed
**Success** and 19 records. The requested Google TXT value was confirmed on
authoritative `ns27`/`ns28` and public resolvers `8.8.8.8`/`1.1.1.1`.

Around **9 November 2026, 20:01 IST (14:31 UTC)**, Search Console showed
**Ownership verified** with method **Domain name provider** and instructed that
the DNS record be kept. The conservative branding retry time is **10 November
2026 after 20:05 IST (14:35 UTC)**, allowing Google's previously stated 24-hour
wait. Brand verification has not yet been retried or passed; no Google app-brand
publication was completed. Google audience **In production** remains a separate
publishing setting, not evidence of verified branding.

## Build configuration guard

[`deployment/release-targets.json`](../deployment/release-targets.json) records
the UAT project reference and deliberately leaves production's reference `null`.
The Vercel build runs `scripts/check-release.mjs` to reject a wrong release
branch, site origin or backend URL, missing configuration and private-key formats.
With the current manifest, production release configuration is blocked.

Modern public publishable keys are checked for presence/type only offline;
that is not proof they belong to the configured backend. The guard does not
apply or verify database migrations, grants, Auth configuration or live journeys.
A passing non-release Preview build also does not establish release readiness.

## Promotion contract and outstanding readiness

For a production release, carry the complete tested UAT source and ordered
backend changes. Record its tested source SHA before building production.
Use production environment values with that source; a Preview deployment can
contain UAT values in its browser bundle and is not automatically promotable.

Production readiness still needs evidence for:

- A separate production Supabase project/target and its public browser
  configuration, without copying UAT database rows or production secrets.
- The ordered migrations in `supabase/migrations/`, with each target's applied
  versions verified. A Vercel/Git deployment does not apply these migrations.
- Current RLS and grants, registration receipt/idempotency behavior, Realtime,
  approved production admin membership and protected owner bootstrap.
- The common public branding with policy-compliant internal Google clients,
  production Supabase provider configuration, registered callback, Auth Site
  URL and allowed application redirect. Verify actual Google brand-review
  status; credential presence is not a successful Google round trip. Production
  promotion needs no independent brand redesign.
- Appropriate production Vercel environment values and a build from the tested
  UAT source; production must not silently write to the UAT registration store.
- Actual HTTPS and live user-flow verification after explicit production
  authorization, with data-saving checks scoped to that authorization.

The separate `letsaimit-uat-health` service deliberately uses Vercel's
“Production” execution environment to check the **UAT** database. It is not
evidence of a production registration backend and must not be retargeted as a
side effect of a website release.

## UAT release evidence — 9 November 2026

| Evidence | Current record |
| --- | --- |
| Selected target / triggering instruction | Branding and project-workflow work; no production release authorized by this ledger |
| Tested application source | `4e62f70fcb5c10ad80aa7ce62cccccaf3c24dc66` |
| Automated checks for that source | 123 tests passed, including seven release-guard tests; optimized build and 59-asset verification passed locally; Vercel UAT build passed its configuration guard |
| Target database and applied migration versions | UAT `nlgfcmywgwibvmbsgkox`: all four ordered migrations applied 9 November 2026; production target/migrations pending |
| Deployed source SHA and deployment URL/ID | Documentation-only UAT head `5947201c3870505bc433f05c1d607f5047b87d65`, containing application source `4e62f70fcb5c10ad80aa7ce62cccccaf3c24dc66`; deployment `dpl_BXkARvtkNzdUUNMuqDAj9gRxCdFd` READY and aliased to `https://uat.letsaimit.com` |
| Google public-name / homepage / policy verification | LetsAimIt name, favicon-180 logo and production homepage/privacy/terms saved; Search Console ownership verified; Google branding retry remains pending until after 10 November 2026, 20:05 IST |
| Approved DNS change | Google ownership TXT saved and verified; A `216.198.79.1`, `www`/`uat` CNAMEs and MX records remained unchanged |
| Live verification for this change | Reloaded the authenticated UAT dashboard: Google name/email/photo displayed, four saved test requests and Live status present. HTTPS sign-in HTML has production privacy/terms links. Registration saving, saved edits, anonymous-read denial and four-row CSV were verified on the preceding UAT release; they were not re-exercised by this presentation-only change |
| Website production | `main` remains `372be17da151f45d42c54b42b36d2d50ef51758a`; homepage response SHA-256 remains `6f32fc0cc051d17e1817e189f7a442bfe17b5e93a41e1a0bfeba0efb4aa5dc87` |
| Production promotion source SHA | Pending explicit **merge and deploy to prod** and production readiness |

Repository skill and guidance changes alone do not establish a runtime fix,
an applied migration, a deployed release or the user's live journey.

## UAT/production workflow source — 10 November 2026

| Evidence | Record |
| --- | --- |
| Shared source | `f22e83265d612da094234699a4834f7248b2ef67`; project-local `uat-prod-parity-workflow`, linked from AGENTS and the release skill |
| Deterministic inventory | `npm run parity:plan` inventories six ordered migrations, three function entrypoints and their relative imports, function gateway settings, Deno config/lock metadata and required secret names; it does not read secret values or change cloud state |
| Shared backend digest | `a292eff274c8b7e4ca4a8640aab7bc288c9a7a94fca209c1002839a0a6ef3665` for both target source plans |
| Deployment pipeline | Vercel runs `release:build`: configuration guard → both-target source plan → tests → optimized/prerendered build |
| Automated verification | 256 tests and the build passed locally, including 13 focused parity/release tests; the skill validator passed. Independent forward review covered default UAT release, an explicit production request with missing backend configuration, and shared branding under provider-specific OAuth requirements |
| UAT deployment | Vercel `dpl_ARk1kS66R587HTuhUerjnP6WaTfv`, READY, source `f22e83265d612da094234699a4834f7248b2ef67`, aliases include `https://uat.letsaimit.com`; unauthenticated HTTPS homepage returned 200 |
| Source plan versus runtime | Plan scope is `source-plan-only`; UAT source inventory is available. Applied-backend and live-journey fields remain `not_verified` in this offline plan and require separate dated evidence below |
| Production preparation | Same migration/function artifact set staged; production backend reference remains unset (`BACKEND_NOT_CONFIGURED`). Production infrastructure parity is pending, not claimed from matching source hashes |
| Website production | No production release or configuration change. Remote `main` remains `372be17da151f45d42c54b42b36d2d50ef51758a`; HTTPS homepage returned 200 with unchanged SHA-256 `6f32fc0cc051d17e1817e189f7a442bfe17b5e93a41e1a0bfeba0efb4aa5dc87` |

The workflow release does not by itself enable billing, complete Google brand
review or prove a parent payment. Those provider/runtime results remain separate.

## UAT release evidence — 10 November 2026, compact CRM

| Evidence | Record |
| --- | --- |
| Authorized target | User explicitly requested the compact Stripe-reference CRM UI, merge and deploy to UAT |
| Application source / merge | `d0b738a1c404e77204d49b2d0709b4cdc54defb4`, fast-forwarded from `codex/compact-admin-crm` to `uat` |
| Interface change | Compact neutral shell, summary metric strip and tables; 11 separate single-line Register columns; five-column Team table; smaller right-side request drawer with full contact, consent and audit details |
| Architecture / data parity | Presentation-only change across six JSX/CSS files. Auth, Supabase transport, store, DTOs, CSV serializer, dependencies, environment values and database migrations are unchanged. This source can carry the same UI to production when that target is explicitly authorized and configured |
| Automated verification | All 123 existing tests passed, including PostgreSQL/RLS, membership, release-guard, follow-up revision and CSV tests; optimized/prerendered build passed; 59 assets verified; diff checks and independent UI source review passed |
| Application deployment | `dpl_5kFEvhrKfpyr9qa2UXd4gGwinHta`, READY, Git source `d0b738a1c404e77204d49b2d0709b4cdc54defb4`, alias `https://uat.letsaimit.com` |
| Live dashboard | Existing approved Google session displayed name/email/photo. Six saved requests, four trials, one confirmed enrolment request, three new follow-ups, status totals 3/1/2/0 and four team accounts matched the register. Site activity remains Not tracked |
| Live register / drawer | Separate columns and single-line rows observed; search reduced six rows to the expected one; full parent/contact fields, follow-up controls and expandable consent/revision details were accessible. A draft remained present during inspection. Saving a temporary note on a labelled UAT test request advanced its revision, and restoring the original empty note saved successfully without a document reload. No parent-submitted values or memberships were changed |
| Live CSV | Filtered export completed; downloaded CSV parsed as 25 columns and one expected saved test row, with the restored empty note and no temporary draft text |
| Live refresh scope | Live connection badge observed; existing realtime invalidation, visible-tab five-second polling, hidden-tab pause and revision-safe merge code remain unchanged. This release did not run a separate two-browser broadcast test or submit a new parent form |
| Responsive verification scope | Mobile overflow, labelled scroll regions, 16px mobile inputs, focus behavior and short-height drawer scrolling reviewed in source. Live visual inspection was desktop; no device-sized browser run is claimed |
| Screenshot evidence | Private local artifacts under `.codex/artifacts/letsaimit/compact-crm` in the operator home; screenshots and registration CSV are not committed to Git |
| Website production | No production deployment or configuration change. Remote `main` remains `372be17da151f45d42c54b42b36d2d50ef51758a`; fetched homepage SHA-256 remains `6f32fc0cc051d17e1817e189f7a442bfe17b5e93a41e1a0bfeba0efb4aa5dc87` |

This CRM release did not change Google branding/provider settings, complete the
outstanding production backend setup, grant access or apply a database migration.
New Google round-trip/denied-access and parent-form receipt tests were not
repeated for this presentation-only release; their earlier evidence remains dated.

## UAT release evidence — 10 November 2026, parent requests and notifications

The frontend, database changes, notification worker and scheduler are activated
on UAT. This does not activate production or the deferred payment stage.

| Evidence | Record |
| --- | --- |
| Source / selected target | Feature source `1ec7e35`, followed by direct-dashboard fix `6f2b9be4f71776af6398f115a70a3678766ad459`; merged to `uat` only |
| Parent contract | Google sign-in before final save; server-bound user-ID ownership; private `/parent/` projection; no email-based claim of existing rows; bound answers and drafts clear on sign-out/account change |
| Admin contract | Separate audited Accept/Decline action, explicit confirmation, revision conflicts; email GET links navigate only; same Google account may use parent and authorized admin capabilities |
| Notifications | Durable per-recipient jobs, current-membership check, protected POST worker, bounded retries and leases; activity-only four-hour digests with separately labelled late activity |
| Payment / coach scope | No Razorpay requests, charges, subscription workflow or coach workspace activated |
| Backend | Migration `20261109204510_parent_review_notifications.sql` applied as one transaction; `admin-notifications` Edge Function deployed; all seven settings and two matching Vault entries configured; dispatch enabled after protected-worker checks; no historical alert backfill |
| Local automated verification | 184 tests passed after the live-found direct-dashboard fix, including an actual authorized-component render without email intent; optimized/prerendered 13-route build and 59-asset verification passed; Deno 2.9.6 checks passed for original modules and generated single-file editor bundle; diff checks and independent source review passed |
| Database test limit | PGlite verifies the complete ordered migration chain, grants/RLS, owner isolation, review/idempotency/conflicts, queue leases and digest carry-forward. The late-visibility regression models activity becoming visible after a frozen window; it is not a hosted multi-session test |
| Application deployment | `dpl_EFGjqPYki51dMbkCE2y92abXqegg`, READY, Git source `6f2b9be4f71776af6398f115a70a3678766ad459`; aliases include `https://uat.letsaimit.com`. Documentation-only descendants may redeploy the same application source |
| Protected worker | Dashboard gateway JWT check saved OFF because the function checks its narrow backend bearer. Live GET 405, unsigned POST 401, correctly authenticated POST 200; public submission, parent-read and worker-claim RPCs reject anonymous calls with 401/42501 |
| Live database authorization | Anonymous and authenticated direct INSERT grants are false; private queue/settings/activity tables have RLS with no app-role table access; worker RPCs deny anon/authenticated and permit service role; parent-list and review operations retain their separate ownership/membership checks |
| Scheduler | Exactly one active `letsaimit-admin-notifications` job, every minute, with the expected wake command. Actual cron runs succeeded and worker HTTP calls returned 200. Four-hour closed-window summaries are configured; no closed-window summary delivery was forced or observed during this verification |
| Live parent / Google journey | Existing verified Google identity saved one clearly labelled synthetic trial and received a matching saved confirmation. Only its new owned request appeared in My requests; old unowned records were not claimed by contact email. Sign-out cleared the list and the bound name/email/phone/consent in the globally mounted form. A fresh Google account-choice round trip returned to `/parent/`, restoring the saved Accepted request and the same account's Dashboard link |
| Live email / review | The one synthetic request created four recipient jobs; all four were marked sent after Gmail SMTP acceptance on attempt 1. The sender account's inbox was opened and its received HTML email inspected. The email review link opened the test drawer; an owner-authenticated Accepted decision with revision 2 was observed, with Payment has not been requested. The parent view refreshed to Accepted without a document reload. Separate inbox placement for the other three recipients was not inspected; no payment or parent-outcome email was sent |
| Live direct dashboard / CSV | Fresh plain `/admin/` exposed a null-intent crash during verification. The guarded fix and component-render regression were released, and the plain dashboard then showed Live, seven saved requests and four team members. Filtering to the synthetic request and exporting produced one saved row and 28 columns, including accepted review, nonempty reviewed_at_utc and reviewed_by |
| Sender / secrets | Operator-confirmed Gmail sender and private App Password are stored in backend settings only. A 24-hour deployment token restricted to this UAT project and the required capabilities was created through the authorized account UI and stored privately outside Git; it is separate from the persistent runtime worker credential |
| Deployment administration limits | All five schema files are manually applied, but `supabase_migrations.schema_migrations` is absent. Official CLI history repair failed with DbConfigIpv6Error; schema files were not rerun and substitute version records were not invented. CLI security Advisors returned 403 because the narrow token lacks advisors_read; the targeted live grants/RLS checks above passed, but no provider-wide Advisor pass is claimed |
| Legacy integrations | Parent trial/enrol Apps Script modes retired in source; society/school paths preserved. Previously published Apps Script versions/native forms were not remotely audited or removed |
| Production | No production source, alias, backend or provider configuration changed. `main` remains `372be17da151f45d42c54b42b36d2d50ef51758a`; fetched homepage SHA-256 remained `6f32fc0cc051d17e1817e189f7a442bfe17b5e93a41e1a0bfeba0efb4aa5dc87`. Separate production readiness remains pending as listed above |

One deliberately labelled UAT request remains as verification data; it represents
no real child. Screenshots of the received email, parent state and corrected
register are private local artifacts. Production promotion must carry this source,
the five ordered migrations and corresponding runtime settings to a separately
configured production backend after explicit production authorization.

## UAT release evidence — 10 November 2026, monthly billing

This release deploys the implementation and backend with billing **disabled**.
It does not establish a live Razorpay charge, payment receipt or reminder email.
The existing parent/admin registration and notification release stays active.

| Evidence | Record |
| --- | --- |
| Authorized target | UAT only, with live Razorpay credentials requested by the user for an explicitly disclosed ₹1 team checkout. Website production remains unchanged |
| Tested source | Frontend `240f793`, complete application `0ced92e5343008fb941d14cb82119c6aed26fed6`, fast-forwarded to `uat` |
| Product flow | Existing Google parent consent and admin review; new enrolment billing consent; approved new enrolments can create monthly Razorpay hosted invoices after activation. Trials remain free. No automatic debit mandate or coach workspace added |
| Amount / dates | Regular price ₹600, team amount ₹1; first invoice due approval + four days; following months billed on the 1st and due end-of-5th IST; ₹100 per overdue day is the accepted regular fee policy, with preview-only fees during team testing. Account prices are frozen to their accepted terms |
| Dashboard | Compact admin Billing tab and parent-owned invoice history; payment/invoice links, captured/refunded/outstanding totals, saved-row CSV, explicit all-time/filter scope, latest-1,000 limit disclosure, silent visible-tab refresh and audited stop-future-billing action |
| Automated checks | 250 tests passed, including 13 new billing SQL tests and financial boundary/provider/webhook/email/UI tests. Optimized/prerendered build, 59-asset verification, Deno 2.9.6 checks of both function entrypoints and diff checks passed |
| Applied UAT schema | `20261109225158_monthly_billing_invoices.sql` applied in one explicit transaction using the scoped deployment credential; schema cache reload sent. The six ordered source migrations are applied on UAT, with the previously recorded manual history limitation unchanged |
| Live source comparison | All 15 new/replaced billing/submit function bodies, security modes and search paths match the source. The preserved pre-existing validator differs only in whitespace; normalized source is identical |
| Live authorization | All six private billing tables have RLS enabled and no anon/authenticated table access. Worker RPC execution is denied to app roles. Actual anonymous calls to own/admin invoice lists and job claims returned 401/42501; public pricing terms returned 200 with enabled=false |
| Functions / secrets | `billing-worker` and `razorpay-webhook` deployed via API bundling. The billing worker was redeployed after final frozen email-policy fixes. Existing SMTP/bearer configuration is reused; a dedicated backend-only Razorpay webhook secret is saved. No live Razorpay Key ID/Secret was configured in the inspected project secret inventory |
| Scheduler | One active minute scheduler `letsaimit-billing-worker`, with a saved billing-worker Vault URL and the existing private worker bearer. Disabled billing prevents wake/queue/claim/dispatch; no invoice or account was backfilled |
| Live endpoint checks | Unsigned worker POST 401; unsigned/invalid webhook signature 401. A self-generated signed synthetic event returned 200, duplicate delivery returned 200, and SQL showed one matching event. This is a self-signed integration probe, not evidence that Razorpay delivered an event. Authorized worker returned 503/not_configured without live API keys |
| UAT deployment | `dpl_D1qZ1TJnLH5CukRJ9L3wTdmkKhDE`, READY, SHA `0ced92e5343008fb941d14cb82119c6aed26fed6`, alias `https://uat.letsaimit.com`. Billing page HTTP200; published JavaScript contains billing RPCs and excludes live-key/private-secret identifiers |
| Actual financial state | Billing enabled=false; zero billing accounts and zero invoices. No real payment, refund, live checkout, scheduled parent reminder or billing email has been performed or claimed |
| Provider UI / outstanding boundary | Correct signed-in LetsAimIt Razorpay live account inspected. Websites & API keys remained in its loading state after a fresh window and reload; no usable key controls appeared. A separate live webhook form was prepared with the endpoint, operator alert email and nine invoice/payment/refund events, but not created. The user was asked to enter existing/live credentials privately and complete the new webhook credential entry, as required by Chrome's computer-use policy |
| Live browser scope | Provider setup inspected in Chrome. UAT billing HTTP/source checks completed; an authenticated browser billing/payment journey remains pending the active credential handoff. Do not describe API/source checks as a completed parent checkout |
| Website production | Remote `main` remains `372be17da151f45d42c54b42b36d2d50ef51758a`; production homepage SHA-256 remains `6f32fc0cc051d17e1817e189f7a442bfe17b5e93a41e1a0bfeba0efb4aa5dc87`. No production code, DNS, backend or billing activation changed |

The manual migration-history repair and provider Advisor permission limitations
recorded for the earlier release still apply. No broad credential was created to
remove those limitations. A future production promotion must carry this code and
its ordered migration, use its own configured backend, and verify the chosen
price, credentials and webhook without copying UAT records or silently upgrading
consented ₹1 accounts. See [README-BILLING.md](../README-BILLING.md).

## UAT activation evidence — 10 November 2026, live ₹1 team setup

This section supersedes the disabled/provider-pending state in the preceding
monthly-billing release record. It does not claim a completed payer checkout.

| Evidence | Record |
| --- | --- |
| Authorized target / key creation | User explicitly approved generating the live Razorpay API credential for the ₹1 team flow, completed the provider SMS verification and supplied the generated credential. The correct Ankit Chrome profile showed successful generation. Values were saved privately outside Git and provisioned only in UAT backend secrets |
| Credential verification | Actual authenticated `GET /v1/invoices?count=1` returned 200 and an empty collection; no invoice was created by this probe |
| Provider webhook | Own-merchant webhook `TyLwQ3O4AxrnAY` created and independently fetched via the official SDK-backed `/v1/webhooks` resource. Exact UAT function URL, active=true, secret_exists=true and all nine required invoice/payment/refund events were verified. This merchant endpoint uses an event-name/boolean map, as in Razorpay's official WooCommerce integration |
| Backend readiness | Authenticated billing-worker POST returned 200 with zero processed/sent jobs after key provisioning and again after activation. Existing SMTP and protected worker credentials were reused; the active minute scheduler, its expected wake command and three recent succeeded runs were verified |
| Signature and retry checks | Invalid HMAC returned 401. A new locally signed synthetic event returned 200 twice, with exactly one stored matching event and no financial rows. This proves deployed signature/intake/deduplication behavior; it is not an actual Razorpay-delivered payment event |
| Activation | One explicit UAT settings transaction enabled billing with team_testing=true, charge_amount_paise=100, regular_amount_paise=60000, daily fee policy and late_fees_enabled=false. Empty account/invoice preconditions were checked under the settings lock. Existing requests, reviews and consents were not changed or backfilled |
| Public/private boundary | Anonymous public pricing RPC returned 200 with enabled=true, ₹1 team amount and real fees disabled. Anonymous own/admin invoice-list RPCs returned 401/42501 |
| Financial state at activation | Accounts=0, invoices=0, jobs=0, ledger=0. No charge, refund or automatic-debit mandate was created. A new Google-owned enrolment with current explicit billing consent and admin acceptance is required to produce the first invoice |
| Live public form | A fresh in-app browser opened the deployed enrolment form and loaded Team payment ₹1/month, the regular ₹600 reference, approval/due-date terms, preview-only late fees, No automatic debit, an unchecked monthly billing-consent control and Continue with Google. No form was submitted or agreement accepted |
| Live journey limit | Native Chrome navigation to the authenticated Billing route stalled without rendered page content, and the connected-tab inventory timed out. A completed parent submission, admin approval, hosted invoice, billing email, captured payment and actual provider webhook delivery remain unverified for this activation |
| Production | No production site deployment, DNS, backend or billing activation was performed. The corresponding artifact/configuration requirements remain staged, with the separate production backend still pending |

The first real ₹1 checkout must be completed by its payer. Verify provider-captured
100 paise against the saved invoice/ledger and silent parent/admin updates before
recording end-to-end payment success. Never replace that check with a redirect,
synthetic webhook or privileged database edit.

## UAT release evidence — 10 November 2026, admin-quoted coaching fees

This forward release replaces the public fixed team-price offer for new
enrolments. Existing saved agreements and issued invoices remain unchanged.
The user explicitly reserved manual live-payment testing for themselves.

| Evidence | Record |
| --- | --- |
| Authorized target / source | UAT only. Implementation `a0d0d664ea34ab24cfd71118189852d5007126eb`; final first-fee timing/copy clarification `9f099ac7798d2adb1a045d9efbf3498e1d3a4f14`. Fast-forwarded from `codex/custom-coaching-fees` into `uat` |
| Approval | An admin enters a monthly fee, default suggestion ₹6,000; validated ₹1–₹1,00,000 with up to two decimals. The saved approval must acknowledge that exact quote. Free trials cannot carry a fee |
| Parent agreement | New quoted enrolments require `billingPricingMode=custom_quote`, explicit policy consent and the current server version. Old fixed-price or missing consent cannot be reinterpreted to authorize an arbitrary fee; old receipts and legacy account prices remain valid under their saved terms |
| Invoice schedule | Initial invoice due on approval. Later calendar coaching months are invoiced on the 1st and due by the end of the 5th IST. ₹100 per overdue day follows the new agreed policy; issued native invoices remain immutable, with separate late-fee invoices |
| Fee changes | Admin-only revision-checked edits take effect next calendar month. Dated history preserves earlier cycle prices during scheduler catch-up. The parent notice and invoice show the saved amount before payment; SMTP delivery does not gate invoice creation. Superseded notices are suppressed, while a reversion corrects an earlier delivered notice |
| Reminders | One grouped job per verified parent/date/current slot: 09:00, 12:00, 15:00, 18:00 IST across all children/months/late-fee invoices. Missed slots are not replayed. Pending invoices reconcile in bounded chunks; more than 20 invoices make progress before one complete-total email. Stopping future billing stops new cycles/fees, while existing payable debt still receives reminders |
| Month-end summary | At 18:00 IST on the last calendar day, one immutable next-month snapshot is queued per current admin/month. Upcoming children/fees/total and older unpaid totals remain separate. Membership is checked again before sending; the dashboard retains the latest editable forecast |
| UI / copy | Compact single-line parent child/month rows, itemized native invoice links, admin fee controls and next-month summary. Open fee/review drafts retain their original revision through silent refresh and require explicit review after a conflict. Parent forms disclose first-payment timing, monthly advance dates, late fees and no automatic debit without a public test-price stack |
| Automated verification | 293 tests passed, including 68 SQL tests and meaningful provider/queue/email/UI/release tests. Final optimized/prerendered build passed; 59 assets (19,695,831 bytes) verified. Both billing entrypoints passed Deno 2.9.6 checks; project-local skill validator and diff checks passed |
| Local browser verification | The actual components ran in an isolated, clearly labelled example-data harness with a fake RPC client: one child/month showed ₹3,000 + ₹200 = ₹3,200 with exact separate payment links; a next-month edit changed the forecast to ₹6,500 while the current ₹3,000 invoice stayed unchanged; ₹0 was blocked and ₹1 approval produced 100 paise in the mock callback. No real request, email, provider invoice or payment was created by this harness |
| Applied backend | Only new migration `20261110065359_custom_coaching_fees.sql` applied to UAT in one guarded transaction, followed by schema reload. All seven source migrations are now applied; the existing manual CLI-history limitation remains. Seventeen new/replaced live function bodies match source; all nine private billing tables have RLS and no anonymous/authenticated direct table grants |
| Function / endpoint checks | Updated `billing-worker` deployed with existing backend secrets and narrow bearer protection. Unsigned worker POST returned 401; authorized empty-queue POST returned 200 with all counters zero. Public terms returned 200 with custom-quote mode and default 600000 paise. Anonymous invoice reads, fee edits and approval RPCs returned 401/42501 |
| Application deployment | Vercel `dpl_CTtBp6Hu74ABPsTQe9FYG46q1UBk`, READY, source `9f099ac7798d2adb1a045d9efbf3498e1d3a4f14`, verified alias `https://uat.letsaimit.com`. Documentation-only descendants may redeploy the same application source |
| Live public form | Fresh deployed parent page opened enrolment and loaded Fee confirmed on approval / First payment due then, monthly 1–5 advance timing, ₹100/day after due, no automatic debit and an unchecked quoted-fee consent control. The fixed Team payment / Regular price stack and duplicate save instruction were absent. No consent, Google sign-in, parent submission or approval was performed during this live check |
| Financial state | Billing accounts=0, invoices=0, jobs=0, ledger=0 after migration and verification. No submitted parent data, review, account price or financial record was fabricated for live testing |
| Production parity preparation | Same seven migrations, three function inventories and configuration names staged in both deterministic source plans; shared backend digest `a55b8ab5220610aa475e5e5ff7bb539c0802d3e6fc89e890964196e0119f3c25`. Production reference remains unset/pending; matching source does not claim live infrastructure parity |
| Website production | No production deployment, DNS, backend, OAuth or billing configuration change. Remote `main` remains `372be17da151f45d42c54b42b36d2d50ef51758a`; HTTPS homepage SHA-256 remains `6f32fc0cc051d17e1817e189f7a442bfe17b5e93a41e1a0bfeba0efb4aa5dc87` |

Actual Razorpay payment, billing-email inbox placement, future scheduled reminder
delivery and the next month-end email remain separate live evidence. Mocked
provider/SMTP tests, simulated schedule boundaries and local UI checks do not
establish those real deliveries. A new parent enrolment with current consent is
required for the user's manual payment test; existing free trials stay free.

## 10 November 2026 — missing-request and notification investigation

| Boundary | Evidence / change |
| --- | --- |
| Source | `62775bd9f8c0f2eb07a4ff0bbb00a08065430079`, built on the prior quoted-fee UAT release; no schema, runtime secret, worker or provider change |
| Live save boundary | Read-only UAT queries found seven old requests, zero custom-quote requests, zero billing accounts/invoices/jobs, and zero requests owned by the reported parent account. Chrome showed that parent's filled, restored enrolment with unchecked consent and an available **Send registration** action. The request was still unsent; no ownership or consent was fabricated |
| Live email boundary | Dispatch enabled, trigger enabled, recovery cron active each minute. The preceding hour had 60 successful cron runs and 120 HTTP 200 pg_net responses across the two workers. Four earlier new-request jobs and four digest jobs were SMTP accepted, no failures/pending jobs. Sender's Gmail inbox visibly contained the earlier trial alert (03:23 IST) and scheduled digest (05:30 IST). This proves those deliveries to that inbox, not a new enrolment or every recipient's inbox placement |
| Live browser baseline | Owner admin's long-open tab lacked Billing; a browser reload loaded the current build, Billing and live saved data. Parent dashboard's empty rows agreed with the read-only database result. No payment, approval, parent consent or new submission was performed by the agent |
| Product fixes | Resumed draft explicitly says **Not sent yet**; sign-in action describes the later send step. A durable receipt plus fresh same-account verification notifies list readers even after form closure, while stale success panels stay suppressed. Parent requests open by default and errors are visible. Admin **Approved** counts accepted enrolment reviews instead of the unrelated Confirmed follow-up status; existing follow-up values and CSV data remain intact. Save/focus events use existing coalesced authorized refresh |
| Local checks | 299 tests passed; build and 59-asset verification passed; independent source review found no substantive defect. New tests compose actual draft/Auth-return/validation/transport helpers with mocked Auth/RPC and render real components through SSR. They do not mount a browser OAuth callback or establish live request/payment completion |
| UAT application release | Merged to `uat` as `3a0af310af98e4140cdc8519d9b7d37e7c53bc8f`; Vercel `dpl_AGfYX534opwQv2731wnX4g5yMSVd` READY with `uat.letsaimit.com` alias. Public HTTPS admin document returned 200 and its deployed bundle contained the new unsent-form copy. Documentation-only descendants may redeploy the same runnable application source |
| Parity / release boundary | Same deterministic backend digest `a55b8ab5220610aa475e5e5ff7bb539c0802d3e6fc89e890964196e0119f3c25`; all seven migrations unchanged and staged for both targets. Production backend reference remains pending. Production `main` and HTTPS homepage hash match the prior baseline; no production mutations |

The parent's own consent and final send remain the live save boundary. New
admin alerts, quoted approval and the user's manual payment can be checked only
after that request is actually saved. Do not describe the empty-queue health
checks or mocked contract tests as completing that live journey.

## 10 November 2026 — authorized enrolment and same-account refresh

The user gave specific action-time confirmation to submit the prepared test
enrolment, using the submitting parent's contact email and the displayed privacy,
programme/cancellation and monthly-billing terms. The agent entered that contact
email, checked those controls and submitted through the actual Chrome form.

| Boundary | Evidence / change |
| --- | --- |
| Live request save | One custom-quote enrolment committed at 14:36:02 IST. Read-only checks confirmed it has a parent owner and the owner/contact match. Total saved requests increased from seven to eight. No direct database insert or fabricated ownership/consent was used |
| Live notifications | Four new per-admin outbox jobs were SMTP accepted on attempt one by 14:36:13 IST. An approved staff mailbox visibly contained the new enrolment alert; that inbox also contained the earlier trial and four-hour summary. Other recipients' placement is not inferred from SMTP acceptance |
| Live admin read | A currently approved admin's reloaded dashboard showed eight saved requests, three enrolment requests, the new request as its latest row, and zero approved enrolments. Follow-up status remains independent of approval |
| Parent UI mismatch | Before reload, the long-open parent page retained the signed-in identity but showed a same-account sign-in error for owned-request/billing reads. Its post-submit state did not establish a displayed receipt even though the server save succeeded. Do not describe this as an unsaved request or send it again to force a second alert |
| Source fix | `bcbe3cca78d5d00fcb3372f6999a68c8abc14ac4`: the provider previously invalidated every in-flight check on any SDK auth event. It now advances its epoch only at identity boundaries. Same-subject refresh/sign-in events still recheck Google and current database membership. Sign-out, missing session, explicit sign-in, account switches including A→B→A, and unmount invalidate earlier results. No local-session trust shortcut, auth timeout workaround, schema or secret change |
| Automated checks | 305 tests and the production build passed. New regressions exercise the production guarded-read helper and parent ownership reads with mocked same-user refresh events, stale account replies, sign-out, non-Google identities and revoked admin membership. Independent source review found no substantive defect. These tests do not substitute for a mounted browser callback lifecycle |
| Deployed parent verification | Vercel `dpl_Fs68WKxwbcDEV9LUjrm7hFC65e9J`, source `7dad1a1a6ff719964c1f82ea62e8b0f28fa79f3d`, READY with verified `uat.letsaimit.com` alias. After loading this release in the actual submitting parent's Chrome session, the dashboard displayed **Awaiting approval · 1 enrolment**, **1 saved request**, and the 14:36 enrolment with **Pending review**. The false same-account error was absent. No duplicate submission, approval, invoice or payment was made. Documentation-only descendants may redeploy the same runnable application source |
| Parity / production | The backend migration/function inventory is unchanged. This source fix is staged identically for later promotion. Website production, DNS, OAuth and production backend remain unchanged; actual payment testing stays with the user |

The new enrolment remains pending review until an authorized admin explicitly
approves a custom fee. A saved request and delivered admin email are not an
invoice or captured payment.

## 10 November 2026 — close and clear completed parent forms

| Boundary | Evidence / change |
| --- | --- |
| Source / target | `9afce3278596f6c06c35938253340ad8811cd335`; routine fix within the existing UAT-only release scope. No backend, OAuth, email worker, secret or payment change |
| Finding | Successful parent saves previously set an inline success state without closing the dialog or resetting React Hook Form. Both parent forms remained mounted, so retained trial answers could repopulate a completed enrolment |
| Completion | A validated receipt, freshly verified matching Google actor and current active form generation complete the form. Both parent forms, stored drafts, consent, validation/error state and submission references clear; the dialog closes and focus returns through its existing opener handling. A compact ten-second confirmation outside the dialog links to My requests and is hidden/removed on account change |
| Retry / stale response | Failed or unconfirmed saves keep answers and the safe retry submission ID. Google handoff remains an unsent draft. A delayed receipt can notify authorized readers but cannot clear/close a newly opened or edited form |
| Automated checks | 306 tests passed; optimized/prerendered build passed; all 59 published assets verified. Regression covers confirmed/duplicate receipts, closed/superseded form generations, missing/wrong Google actors and invalid receipt data |
| Real-component browser check | An isolated local Vite harness ran the actual ContactDialog, ParentRegistration and confirmation components in React StrictMode with example identity and mocked RPC responses. Successful enrolment and trial retry automatically closed; reopening both modes showed blank fields and unchecked consent. The retry reused its submission ID. A delayed earlier save left a newly edited enrolment open with its new answer intact. No external Google consent, real submission, email, invoice or payment was created by this harness |
| Parity | The deterministic backend inventory remains unchanged and staged for both targets. Production backend setup remains pending; this frontend source is ready to carry with the tested UAT feature set on explicit production promotion |
| Deployment | Vercel `dpl_5ENV6RbzZpAwLdzm3GyVzamwkw64`, source `9eca985f0c44996ccad2eadce019f8f9967fdff7`, READY with verified `uat.letsaimit.com` alias. The authenticated parent's reloaded page retained its saved request; a newly opened enrolment showed blank text fields, three unchecked consent controls and loaded current payment details. It was closed without submitting. The successful close/reset path above was exercised with mocked local RPC responses, not another live enrolment. Documentation-only descendants may redeploy the same runnable application source |
| Production verification | Remote `main` remains `372be17da151f45d42c54b42b36d2d50ef51758a`; HTTPS homepage returned 200 with unchanged SHA-256 `6f32fc0cc051d17e1817e189f7a442bfe17b5e93a41e1a0bfeba0efb4aa5dc87`. No production mutation |

## 11 November 2026 — fresh-start account deletion

| Boundary | Evidence / change |
| --- | --- |
| Source / scope | `f1c4bbbec7d20c9d7e6827aa8094b2e574d37e41`. Implements the requested whole-account deletion in the existing React/Supabase flow. It does not delete Google accounts, create a second profile hierarchy, add another sign-in provider, or perform a real user deletion during verification |
| Identity and history | Existing permanent registration/billing/invoice/ledger IDs and Auth `ON DELETE SET NULL` ownership are retained. Private service-only tombstones/snapshots archive consent and details; live registrations are scrubbed and excluded from operational register access. New Google users are joined only by their new Auth UID, never matched to old records by email/phone. Non-owner admin membership is removed; owner transfer remains required |
| Access / completion | The Edge verifies the live Google actor and the exact UID shown in the confirmation. Private tombstones immediately deny deleting/deleted subjects at parent/admin database boundaries. Refresh sessions are revoked and the server SDK uses `deleteUser(id,false)`. A durable leased retry returns `deleting` truthfully until Auth absence is verified. Lost final acknowledgements recover even on the final attempt. Parent read RPCs remain read-only; write serialization is limited to registration inserts |
| Billing | Future coaching cycles/late fees/customer notifications stop. Native unpaid invoices receive verified cancellation jobs; a hosted link is not considered cancelled until provider confirmation. Ambiguous creations recover by stable receipt without another invoice POST. Paid/refund races retain old ledger history. Archived-only periodic reconciliation and unmatched webhook catch-up continue with new billing disabled; no refund call is added |
| UI | Parent dashboard → Account → Delete account opens an unchecked permanent/no-refund confirmation bound to the displayed identity. Pending/deleted notices are distinct. Local sign-out clears private views and drafts across roles; a late response cannot sign out a different account opened meanwhile |
| Automated checks | 346 tests passed, including the full migration chain, real read-only parent transactions, RLS/grants, same-email/new-UID isolation, stale JWT denial, HTTP-handler→local database→mock Auth deletion, retry/final-ack recovery, and provider capture/refund/cancellation tests. Optimized/prerendered build and all 59 assets passed. Three affected Edge entrypoints passed Deno 2.9.6 checking with the committed dependency lock |
| Local browser | Actual AdminAuthProvider, ParentRequests, client helper and deletion dialog ran in StrictMode with a fake client and example identity. Unchecked confirmation was disabled; owner refusal kept the account; pending/deleted responses signed out locally with accurate notices; a simulated account switch retained the new session. No external account, email, financial record or payment was changed by these checks |
| Applied UAT database | Only new migration `20261110190347_account_deletion.sql` applied in a guarded transaction and PostgREST schema reload. SHA-256 `3d76d921d98bc69ba09ebdd4522d2d20fb269162cf2f7b102283ad07f536e2f4`; all 19 new/replaced function bodies match source. Archive RLS, denied anonymous/application prepare and archive read grants, stable parent guard and active minute recovery cron were verified live. Existing manual migration-history limitation remains; no earlier migration replay or fabricated CLI history |
| UAT runtime checks | `delete-account`, updated `billing-worker`, and `razorpay-webhook` with its shared provider source deployed using existing runtime configuration. Browser preflight returned 204; anonymous self-delete and unauthorized worker returned 401; authenticated empty recovery returned 200 with processed/deleted/deferred all zero. Live deletion/archive rows remain zero; all 9 registrations, 3 invoices and the existing ledger row remained intact after migration |
| Advisor limit | The scoped token lacks `advisors_read`; the hosted security-advisor request returned 403. This is not recorded as an advisor pass. Source review, database regression tests and direct live RLS/grant/function checks above were completed without widening credentials |
| Production preparation | Same eight migrations/four function inventory staged for both targets; backend artifact digest `1d259c306521bbcd91a95d376e1a216c829798005cf3057953978f823b62fe73`. Production backend reference is still null. A fresh Vercel environment inventory contains only branch-scoped UAT Preview entries and no production Supabase configuration; live infrastructure parity is pending that target setup |
| Website production | Remote main and production homepage SHA-256 still match the prior baseline. No production deployment, backend, DNS, OAuth, key or existing user change |
| Website UAT deployment | Vercel `dpl_7j3n99LM21jphf1ppQSsX3Qomci8`, source `cb50dfa090e88a170c4f86ae2ffeee819f5fc245`, READY with verified `uat.letsaimit.com` alias. The actual submitting parent's reloaded Chrome dashboard loaded its saved request with zero visible alerts. Account → Delete account opened the displayed identity's confirmation with consent unchecked; Cancel closed it. No real deletion was submitted. The Google account-delete-and-return journey remains separate from local/mocked and deployed guard evidence. Documentation-only descendants may redeploy the same runnable application source |

## 11 November 2026 — production backend provisioning preparation

The user explicitly authorized production Supabase configuration with the tested
UAT migrations/functions, while withholding production website deployment.

| Boundary | Current evidence / remaining step |
| --- | --- |
| Source | Tested backend source `f1c4bbbec7d20c9d7e6827aa8094b2e574d37e41`; eight migrations and four functions. Current source-plan digest remains `1d259c306521bbcd91a95d376e1a216c829798005cf3057953978f823b62fe73` |
| Target discovery | Owner's Supabase project selector showed LetsAimIt UAT and two unrelated paused projects. No separate LetsAimIt production target was present. The production manifest reference remains null; do not substitute the UAT reference |
| Access prerequisite | The existing deployment token is scoped to UAT. Management API project/organization list requests returned 403; no production deployment credential or database password is available locally. This does not invalidate the existing UAT credential |
| Project creation | The owner's Chrome profile is open on the organization's New Project form. DOM and screenshot verify internal name `letsaimit-production`, Mumbai region, Data API enabled, automatic table exposure disabled and automatic RLS enabled. Password is blank. Creation requires the user's new database-password entry/submission; project creation has not been verified |
| Prepared checks | `supabase/checks/fresh_target_preflight.sql` rejects nonempty app/Auth databases and missing or identical target references. `supabase/checks/fresh_production.sql` checks disabled dispatch/billing, fresh application data, RLS/grants, RPC boundaries, Realtime, scheduler/Vault configuration and database function/policy fingerprints. These files are verification tools, not applied production migrations or live evidence |
| Local verification | Eleven local PostgreSQL-compatible guard cases passed against the full migration chain with synthetic cron/Vault metadata, including unsafe grants, enabled dispatch, wrong URLs and read-only enforcement. Thirteen existing parity/release-guard tests and the diff check passed. These checks do not verify hosted extensions, remote application or provider delivery |
| Remaining cloud work | Separate production project/ref and scoped deployment access; apply all eight migrations in order, bootstrap explicitly approved access, deploy all four functions, configure independent worker/provider secrets, target Vault URLs and Google production client/callback. Then verify the actual remote database, functions and configuration before marking synced |
| Financial staging | Keep production notification dispatch and billing disabled during preparation. Do not register/enable a second live Razorpay webhook yet: the current intake stores events with unknown invoice IDs, so separate HMAC secrets alone would not isolate the shared merchant's UAT events. Local-invoice ownership routing must be verified before production webhook activation |
| Data boundary | No UAT Auth users, registrations, invoices, jobs, ledger rows or secret values were copied. No actual submission, approval, mail, charge, refund or account deletion was performed |
| Website production | No merge to main, deployment, alias or DNS change. Remote main remains `372be17da151f45d42c54b42b36d2d50ef51758a`; HTTPS homepage returned 200, 39,957 bytes, SHA-256 `6f32fc0cc051d17e1817e189f7a442bfe17b5e93a41e1a0bfeba0efb4aa5dc87` |
| Status | **Prepared; production infrastructure not yet provisioned or verified.** The website remains gated behind an explicit production promotion |

## 11 November 2026 — parent and coaching tracker

| Boundary | Evidence / change |
| --- | --- |
| Product | Standalone parent Dashboard / Tracker / Account retains existing billing and requests. Tracker shows saved attendance and manual weekly feedback. The staff coaching workspace supports per-child and bulk Present / Absent / No session, revision-safe saves, manual feedback and admin-only coach assignments. A Google identity may hold all three capabilities; navigation never grants access |
| Private data | Five new private RLS tables and scoped RPCs expose only current approved enrolments. Parents use current Auth UID ownership; coaches require current assignments. Missing attendance is not Absent; No session is excluded from the rate. Account deletion revokes tickets/assignments and scrubs coaching content without changing financial history |
| Automatic updates | Visible workspaces reconcile every five seconds and on focus/save events. This is bounded polling, not a claimed WebSocket stream or sub-50ms delivery. Identity/access changes discard private snapshots; revision conflicts require explicit reload before saving |
| Local verification | 395 automated tests passed before the final account-deletion concurrency review. Real nine-migration PostgreSQL-compatible fixtures exercise RPCs, role overlap, ownership, deletion, atomic conflict handling and email HTTP receipts. Actual React browser checks used eight clearly labelled example children with a local database and no cloud/SMTP writes: bulk save, individual overrides, weekly feedback, filtered parent rows and automatic cross-tab updates passed. Desktop/mobile controls and browser console were checked. Build and 59-asset verification passed |
| Applied UAT foundation | Migration `20261110212805_coaching_tracker.sql`, SHA-256 `c7a519be35f73860e6a743c10a00d7e77a94437283be621eeac8b716df623e59`, applied as the sole new migration in a guarded transaction with PostgREST reload. Chrome SQL Editor read-only verification found all 24 function bodies matching source, all 12 public RPC privilege boundaries, seven stable read RPCs, five RLS-protected tables without direct client grants, the active minute scheduler and deletion trigger. Existing records remain 9 registrations / 3 invoices / 1 ledger row; all new coaching tables remain empty |
| UAT function | `coaching-worker` deployed with its pinned dependency lock and an independent signing secret. Unauthorized scheduler POST returned 401, GET 405, AMP preflight 204 and an unknown ticket 403. Authorized scheduler returned the expected 503 `dynamic_email_not_enabled`; this is a disabled-feature guard, not evidence of email delivery |
| Existing SMTP / Gmail boundary | Existing sender `ankitkumarsingh97593@gmail.com` and stored SMTP settings are unchanged, as requested. AMP templates validate for 8 and 100 children and the actual database → worker → mock SMTP → AMP POST path passes locally. Daily 21:00 IST emails are prepared for current approved admins, but both dispatch gates remain off pending actual Gmail sender approval. No attendance email has been sent and Gmail-native interaction is not recorded as live. Personal Gmail SMTP access and per-recipient developer allowlisting do not establish public sender approval |
| Credential verification limit | The scoped deployment token worked for the migration, function and secrets, then subsequent read-only CLI calls returned 401. No token permissions were expanded. The successful Chrome SQL Editor checks above independently verify the applied foundation; no raw credentials were read from browser state |
| Production boundary | Same migration/function/configuration source is staged for both targets. Production Supabase reference is still null; live backend parity remains pending provisioning. No production application, DNS, OAuth, SMTP or financial mutation is authorized by this UAT feature release |

Final review found that authenticated tracker writes needed to serialize with
the existing whole-account deletion boundary. Forward migration
`20261110220027_coaching_tracker_write_identity_lock.sql` (SHA-256
`a145c68731697c732526f2515e4256901d0e29897e942af3c9a98e773e9833ab`)
replaces only the three authenticated write RPCs with the existing volatile Auth
row-lock helper; stable read RPCs and permissions remain unchanged. A real
database BEFORE-trigger regression rejects all three preceding implementations
and accepts the forward fix. The final full suite passed **396 tests**; build
and all 59 assets passed. Fresh-target checks also reject the old write bodies.

The forward migration committed through the UAT SQL Editor with before/after
function guards and a schema reload. A new read-only check found all 24 final
function bodies, 12 RPC privilege boundaries and seven stable reads matching,
with the same private-table protections, scheduler, deletion trigger and
9 / 3 / 1 preserved record counts. Coaching rows remain empty and email dispatch
disabled. The deterministic source plan now contains **10 migrations / five
functions**, digest
`780c178b501128f96d0773ec83cefc4d88f389787aca11873e04c5c401546ad3`.
The applied forward SQL used source hash
`5dfa36d455e7fc5775373cbbeb4f341354403e583fd0e7763c5b67671caceeac`;
the committed file only normalizes its extra trailing blank line, with identical
verified function bodies.
This stages the production inventory; it does not establish live production
parity. No real child attendance, manual feedback, approval, invoice, payment
or account deletion was fabricated for verification.

Application source `625c27c744d841e738f1be9a0979ebfff174aa50` merged to `uat`.
Vercel `dpl_EFbpDMcyGMViTK3bkr8aY8Xac79b` is READY with the verified
`uat.letsaimit.com` alias. Both parent/coaching HTTPS documents returned 200,
the new titles and noindex. The actual owner's signed-in Chrome loaded nine
saved requests and two approved enrolments, then the coaching roster, blank
weekly-feedback editor and coach-access controls. The same identity's parent
Tracker correctly returned no owned children, zero recorded marks and no
feedback, without errors. No live write was performed. At 390px the navigation,
filters and first three attendance columns fit; the empty-state message was
centered outside the visible scroller, so the following CSS-only correction
left-aligns it on narrow screens. The corrected build passes. Documentation and
this narrow layout correction may produce subsequent UAT deployment descendants.

The mobile correction is live as source
`04b97721688150fb1fd75a4971a6de7e3b714518`, Vercel
`dpl_DxUGxAskCBaukD6VoTdf246kcXDM`, READY with the UAT alias. Reloading the
actual signed-in parent at 390 × 844 verified the empty-state copy is fully
visible, the first three attendance columns fit, and the workspace action menu
exposes authorized destinations. Viewport overrides were reset. Neither live
workspace logged browser warnings/errors; no coaching record was saved. Later
documentation-only descendants carry the same verified runnable source.

Remote `main` remains `372be17da151f45d42c54b42b36d2d50ef51758a` and the production
HTTPS homepage is still 200 / 39,957 bytes with SHA-256
`6f32fc0cc051d17e1817e189f7a442bfe17b5e93a41e1a0bfeba0efb4aa5dc87`.
