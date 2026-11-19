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

Maintain one branding/configuration template. Preserve the user's explicit
20 November 2026 choice to reuse the existing verified UAT Google client and
Gmail SMTP sender/credential on production. Both origins and target Supabase
callbacks have been saved and real production Google sign-in is verified; read
the latest ledger evidence instead of recreating clients or repeating saves.
Google's
[OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies#use-separate-projects-for-testing-and-production)
requires separate deployment-tier projects and excludes test endpoints from
production clients. Record the shared-client choice as a user-selected deviation,
not a compliance claim. Do not silently substitute the unused separate project;
an actual provider rejection or changed user instruction must be addressed
explicitly. Never promise inherited brand approval or a free custom auth domain.

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
production reference with the UAT project or copy UAT business/Auth records.
Keep public backend keys, worker bearers, webhook signing secrets and routing
target-specific. Reuse only the Google/Gmail credentials explicitly approved
above, not unrelated secrets.

For authorized app-owned configuration, prefer native CLI/API saves and the
approved original private credential sources. Verify safe digest/HMAC matches
and target readbacks without logging values, passing plaintext in command
arguments or committing secret/source paths. Finish routine saves autonomously;
do not ask the user to re-enter settings already available within that scope.
Provider hashes cannot recover absent secrets. A genuine MFA, account-password
or reauthentication boundary can require handoff; ordinary app-secret entry
does not by itself require another manual chore.

Use the current coaching-fee contract in [README-BILLING.md](../../../README-BILLING.md):
admins quote the initial monthly fee and may change future fees from next month.
₹1 is a valid admin-selected amount for the user's live-provider test; it is not
a fixed public plan. Preserve previously saved agreements and invoice amounts.
The user completes actual payments; verify provider/email behavior with mocks,
authorized read-only provider calls and safe connection checks during releases.
Do not require a real charge or sent test email for release readiness, and do
not describe those checks as a completed live payment/delivery journey.
Production payment activation remains a separate target setting.

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
payment-webhook configuration and mocked provider-contract/read-only evidence
for the selected price. Real charges and sent test emails are not prerequisites;
record any untested user journey. Rebuild the tested
source with production configuration rather than aliasing a UAT browser bundle.

Continue already authorized routine work without asking for the same permission
again. Preserve actual provider, credential, consent and payment boundaries. If a
tool requires an action-time confirmation or credential handoff, explain the
specific action at that point after preparing the reviewable result.
