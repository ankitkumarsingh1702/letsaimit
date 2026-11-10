---
name: uat-prod-parity-workflow
description: Maintain LetsAimIt branding, backend/configuration parity and the UAT-to-production readiness log. Use for this repository's OAuth, Supabase, environment, billing and release work; keep it project-local.
---

# UAT and production parity

Use the existing React/Vite, Supabase and Google identity architecture. Carry the
same implementation, ordered migrations and meaningful regression tests from UAT
to production. Do not create a second implementation or introduce processing
stages merely to satisfy generic architecture prompts.

## One public identity

The name is **LetsAimIt**, with the same logo in both environments. Public
homepage, privacy and terms links use `https://letsaimit.com`,
`https://letsaimit.com/privacy/` and `https://letsaimit.com/terms/`. Environment
names belong in internal resource/configuration names, not customer-facing app
branding, OAuth titles or email subjects.

Maintain one branding/configuration template. Add the appropriate application's
origin and actual Supabase callback to its permitted OAuth client configuration.
Where a provider permits client reuse, reuse it. Google's
[OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies#use-separate-projects-for-testing-and-production)
requires separate deployment-tier projects and excludes test endpoints from
production clients. Keep the public brand identical when separate internal
credentials are required. Never promise that one project's verification approval
automatically covers another project or that custom auth domains are free.

## Prepare both targets during each change

Read [the target manifest](../../../deployment/release-targets.json) and
[the parity ledger](../../../docs/RELEASE-PARITY.md). Run `npm run parity:plan`
to derive both targets' migration/function fingerprints and configuration names
from the current source. A plan is preparation, not proof of applied backend
changes or a working live journey.

For every table, index, RLS policy, function, fix, secret name, callback or webhook
added on UAT, stage its production counterpart from that same source. Apply
authorized, non-breaking infrastructure changes to configured targets where
available; otherwise retain one deterministic migration/configuration set for
both and record the exact pending prerequisite. Never replace a missing
production reference with the UAT project or copy UAT records and secrets.

Use the current coaching-fee contract in [README-BILLING.md](../../../README-BILLING.md):
admins quote the initial monthly fee and may change future fees from next month.
₹1 is a valid admin-selected amount for the user's live-provider test; it is not
a fixed public plan. Preserve previously saved agreements and invoice amounts.
The user completes actual payments; verify provider behavior with mocks and
read-only checks during releases. Production payment activation remains a
separate target setting.

## Keep the maintenance record current

Update [the parity ledger](../../../docs/RELEASE-PARITY.md) with each change's
source SHA, target, ordered migration versions, configuration names and evidence.
Distinguish **Staged for both**, **Synced and verified**, and **Pending production
promotion**. Explicitly record missing production configuration, provider review
or verification; a successful UAT build cannot mark those complete.

Existing UAT migrations were applied manually. Until their CLI history is
reconciled through a working approved connection, do not replay all migration
files or manufacture history timestamps. Use the verified versions in the ledger.

## Release gate

**“Merge and deploy”** targets `uat` and `https://uat.letsaimit.com`.
**“Merge and deploy to prod”** explicitly targets `main` and
`https://letsaimit.com`. Infrastructure preparation does not authorize a
production application deployment or financial activation.

Use [the release skill](../letsaimit-release/SKILL.md) for the actual release.
Before production promotion, require its configured backend, ordered applied
migrations, grants/RLS, approved owner, environment secrets, Google round trip,
payment webhook and live-flow evidence for the selected price. Rebuild the tested
source with production configuration rather than aliasing a UAT browser bundle.

Continue already authorized routine work without asking for the same permission
again. Preserve actual provider, credential, consent and payment boundaries. If a
tool requires an action-time confirmation or credential handoff, explain the
specific action at that point after preparing the reviewable result.
