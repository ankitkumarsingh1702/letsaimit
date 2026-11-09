# LetsAimIt release parity

This ledger records evidence, not permission to deploy. It is project-local.
The default **merge and deploy** target is UAT. Production work requires the
explicit **merge and deploy to prod** instruction.

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
