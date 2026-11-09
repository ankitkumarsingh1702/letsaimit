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

## Baseline recorded on 9 November 2026

| Item | UAT | Website production |
| --- | --- | --- |
| Git target | `uat` | `main` |
| Website | `https://uat.letsaimit.com` | `https://letsaimit.com` |
| Recorded source baseline | `46d63f2a6019785502277c08d55587df5b29bc7f` | `372be17da151f45d42c54b42b36d2d50ef51758a` |
| Source relationship | Updated admin/native-registration feature set is present | Carrying that UAT feature set remains pending explicit production promotion |
| Backend target | Supabase project `nlgfcmywgwibvmbsgkox` | A separate Supabase target is the planned production configuration, not a live or verified backend; production readiness is unknown |
| Google sign-in | Existing Supabase Google provider and live UAT login flow | Separate internal Google project/client with common LetsAimIt branding is the planned policy-compliant configuration; provider, callback and redirect setup still need verification |
| Registration/admin features | Native parent forms and durable receipts, private dashboard, saved follow-up edits, CSV, controlled Gmail invitations and realtime refresh | Live parity for these features is not established by the recorded production source |
| Database migrations | All four ordered migrations were applied to live UAT on 9 November 2026 | Applied versions, RLS, grants, Realtime and owner bootstrap have not been confirmed |
| Admin memberships | Four initial approved memberships were verified; current admins may invite additional validated Gmail accounts | Production owner/membership setup has not been verified; do not copy UAT memberships as an implicit grant |
| Vercel environment inventory | All five configured website entries were scoped to Preview / branch `uat` on 9 November 2026 | No production Supabase configuration was present; separate production target setup remains pending |
| Public branding update | Saved Google app name `LetsAimIt`, existing favicon-180 logo and production homepage/privacy/terms URLs | Common branding/template is established; production provider setup and live verification remain pending |
| Brand review / custom auth domain | Branding verification stopped on homepage Search Console ownership; no DNS record changed for this step | Approval and custom auth-domain setup are not established; no automatic approval or free domain setup is promised |
| Test data | Labelled UAT test submissions may exist and are included in saved-request counts | Do not copy UAT rows; do not create production test submissions without a deliberate authorized test plan |
| Website engagement metrics | Not tracked; the UI must not invent durations | No tracking or duration claim established |

The recorded commits are baseline references, not a claim that the current
working branch is deployed. Refresh this ledger from actual release evidence
before reporting completion.

The current working branch is `codex/google-brand-profile`, based on
`46d63f2a6019785502277c08d55587df5b29bc7f`. Its final release SHA and deployment
remain pending. The four migrations verified on UAT are:

1. `20261109080830_registration_register.sql`
2. `20261109083344_registration_function_privileges.sql`
3. `20261109121642_lock_admin_membership_to_operator.sql`
4. `20261109123953_restore_controlled_admin_invitations.sql`

The Google **Verify branding** attempt found only the homepage ownership issue:
`letsaimit.com` was not registered to the Google Search Console owner. The
displayed next step was to verify that ownership, then wait 24 hours before
retrying. No DNS record has been changed for this step. Google audience
**In production** is a publishing setting and does not mean the brand passed
verification. Saved name/logo/policy settings and completed Google verification
are separate evidence.

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

## Next release evidence

| Evidence | Current record |
| --- | --- |
| Selected target / triggering instruction | Branding and project-workflow work; no production release authorized by this ledger |
| Tested UAT source SHA for the next release | Pending: record after the current changes pass UAT verification |
| Automated checks for that source | Current working tree: 123 tests passed, including seven release-guard tests; final release SHA still pending |
| Target database and applied migration versions | UAT `nlgfcmywgwibvmbsgkox`: all four ordered migrations applied 9 November 2026; production target/migrations pending |
| Deployed source SHA and deployment URL/ID | Pending: record after the authorized deployment is ready |
| Google public-name / homepage / policy verification | LetsAimIt name, favicon-180 logo and production homepage/privacy/terms saved; Google brand verification awaits Search Console ownership and the stated 24-hour wait before retry |
| Live registration, edit, denied-access and CSV verification | Pending: record completed journeys separately from source/tests |
| Production promotion source SHA | Pending explicit **merge and deploy to prod** and production readiness |

Repository skill and guidance changes alone do not establish a runtime fix,
an applied migration, a deployed release or the user's live journey.
