---
name: letsaimit-release
description: "Merge, deploy or promote LetsAimIt changes with project-specific UAT routing, production parity and shared Google sign-in branding. Use for this repository's releases and release-readiness checks, not unrelated projects."
---

# LetsAimIt release

Keep this workflow inside the LetsAimIt repository. Read the root
[AGENTS.md](../../../AGENTS.md) and
[release parity ledger](../../../docs/RELEASE-PARITY.md) before selecting a
release target. They hold the public identity, known target state and source
references; update the ledger as verification changes those facts.
Use [uat-prod-parity-workflow](../uat-prod-parity-workflow/SKILL.md) while
preparing shared branding, migrations and both targets' configuration. Run
`npm run parity:plan` before a release; retain its distinction between staged
source parity and independently verified live configuration.

## Select the authorized target

- **“merge and deploy”** selects `uat` and `https://uat.letsaimit.com`.
  Complete the authorized UAT merge, build, deployment and live check without
  treating the phrase as production permission.
- **“merge and deploy to prod”** explicitly selects production: `main` and
  `https://letsaimit.com`. Carry forward the tested UAT release; do not create
  an independent implementation or omit its backend changes.
- Brand, source review or readiness work alone does not authorize a release.
  Existing credential, consent and access boundaries still apply.

## Keep one public identity

The public product and OAuth app name is **LetsAimIt**. Its app homepage,
privacy and terms URLs are the production URLs listed in root `AGENTS.md`,
including when Google sign-in starts on UAT. Do not expose an environment name
as the product or OAuth app name. Share this branding and its configuration
template; provider clients are environment configuration, not separate product
implementations. Preserve the user's explicit 20 November 2026 decision to reuse
the existing verified UAT Google client and Gmail SMTP sender/credential on
production. Both target callbacks/origins are saved and production Google sign-in
has been verified; consult the ledger for the latest evidence rather than
restarting client creation or requesting the same credential saves.

Google's
[environment separation policy](https://developers.google.com/identity/verification/authentication-policy-compliance#use-separate-projects-for-testing-and-production)
requires distinct test/production projects and excludes test endpoints from
production clients. The chosen shared client is a documented policy deviation;
successful sign-in does not establish compliance or inherited project approval.
Follow the current user choice unless a new instruction or actual provider
rejection requires a concrete configuration change.

Where setup is authorized, prepare and verify the production configuration
alongside UAT; record its actual state instead of postponing all configuration
work or claiming it is already live. Promotion reuses the established brand
design. Google branding changes can require provider review; custom auth-domain
availability and cost require verification. Do not guarantee automatic approval
or a free custom auth domain. Follow required provider trust boundaries without
adding an extra product-processing or approval stage to this release flow. For
authorized app-owned saves, use native CLI/API capabilities and the original
private credential source, verify safe hashes/HMACs and target readbacks, and keep
plaintext out of output, process arguments and Git. Do not turn a routine secret
save into repeated user work. Hand off genuine MFA/password/reauthentication
boundaries when they actually block access.

## Carry the tested release

Record the tested UAT source SHA and target deployment before a production
release. Use that source for the production build, with the same implemented
features, ordered migrations and meaningful tests. If resolving a merge
changes runnable code, verify the resulting source on UAT before production.

Use the existing repository checks as applicable: `npm test`, `npm run build`
and `npm run verify:assets`. Retain the registration receipt, Google identity
and current-membership authorization, revision-safe follow-up editing,
private saved-row CSV, invitation protections and live refresh behavior.
Do not replace them with fixture data or navigation-only sign-in.

For public content or discovery changes, follow
[indexing operations](../../../docs/INDEXING.md): commit the source before
building and refreshing `deployment/discovery-baseline.json`, retain the
production discovery manifest, and run `npm run test:indexing` for provider
script changes. Verify the deployed target's canonical, robots, sitemap,
Markdown and schema responses. UAT/preview documents remain noindex; the
post-deploy submission script accepts only the verified production origin.
Provider notification receipts do not establish indexing or AI citations.

Production readiness includes its own environment variables, Supabase target,
ordered applied migrations, RLS/grants, approved admin bootstrap, Auth URL
configuration and the user-approved Google configuration with its recorded policy
deviation. A Git merge or successful
Vercel build does not apply or verify these. Read
[README-SHEET-DEPLOYMENT.md](../../../README-SHEET-DEPLOYMENT.md) for the
existing backend setup, then reconcile it with the target actually selected.
Use provider-specific skills or tools for work that needs them.

Never copy UAT test rows, private registration records or Auth identities between
targets. The authorized Google/Gmail credential reuse does not authorize copying
other secrets; worker bearers, webhook signing secrets, public backend keys and
routing remain target-specific. Do not promote a UAT-built browser bundle with
inlined UAT configuration to production. Configure the selected environment
and rebuild from the tested source. Keep the UAT health service's technical
Vercel “Production” execution environment distinct from website production.

## Verify and report the real result

For the selected target, distinguish source inspection, automated checks,
applied database migrations, deployed SHA and the live user journey. Check
Google round trip and denied access, a saved registration receipt, saved
follow-up persistence and CSV against that target where authorized. Do not
silently generate test records on production to satisfy a check.

Use mocks and approved read-only provider/connection checks for financial and
email verification. A real charge or sent test email is not a required release
gate. The user completes actual payments; distinguish source/connection checks
from untested delivery, payment and parent journeys in the result.

Update the ledger with evidence and remaining gaps. If a required target
setting is unavailable, finish independent authorized work and state that
specific gap; do not claim the deployment or production parity is complete.
