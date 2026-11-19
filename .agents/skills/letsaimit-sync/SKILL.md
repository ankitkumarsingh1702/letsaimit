---
name: letsaimit-sync
description: Check or sync LetsAimIt across its local checkout, GitHub repository, and Vercel project. Use when asked for the latest LetsAimIt source, its deployed commit, or alignment between these copies.
---

# LetsAimIt sync

- Work from the local LetsAimIt checkout or the destination the user specifies.
- Canonical source repository is [ankitkumarsingh1702/letsaimit](https://github.com/ankitkumarsingh1702/letsaimit).
- Vercel project is [letsaimit](https://vercel.com/ankit-kumar-singhs-projects-390074cd/letsaimit) in scope `ankit-kumar-singhs-projects-390074cd` with project ID `prj_RuQGIYzbozVXBM7kSgpvzGECNW6v`.
- The production domain `letsaimit.com` is associated with `main`. The UAT domain `uat.letsaimit.com` is associated with `uat`, the local development branch for routine freshness requests. Verify these mappings when inspecting a deployment.

## Establish the current versions

1. Inspect the checkout's branch, HEAD, working tree and remote. Verify that the remote resolves to the canonical repository before fetching or publishing. Discover the remote default branch instead of assuming its name. Clone the canonical repository into the requested path when it is empty and has no checkout. If it already contains files outside a verified checkout, inspect them before choosing a way to bring in source.
2. When the request involves Vercel, use the authenticated deployment tools to list recent project deployments and resolve the active production deployment by `letsaimit.com`. For UAT, resolve `uat.letsaimit.com` and check the recent previews. Record the deployment URL or ID, target, readiness, and exact Git repository, branch and commit when available. A rollback or promotion can change which deployment a domain serves. Treat newer failed or pending builds separately from ready deployments. If the user requests a specific deployment or branch, use that selection.
3. Compare the full Vercel source SHA, the fetched GitHub branch tip, and local HEAD. Use Git ancestry to distinguish equal, ahead, behind, and diverged histories. GitHub supplies editable source for a verified commit from the canonical repository. If the SHA is absent locally, check whether GitHub can retrieve that exact commit before attempting source recovery. If Vercel omits provenance or the source is unavailable, state what was verified and identify any genuine source artifact before proposing recovery. Generated deployment assets alone cannot establish a complete editable checkout.

## Sync within the request

- For routine development sync, use the tip of the tracked development branch `origin/uat` unless the user selects another branch. For the most recent Vercel code, identify the newest ready deployment across targets and use its verified Git source, including when it is UAT. For production, use the commit serving the production domain. Report when the fetched branch has a different tip. Keep an older deployment commit in a separate checkout if needed to preserve newer branch history.
- For a checkout already tracking the intended branch, run `git fetch origin` and `git rev-list --left-right --count 'HEAD...@{upstream}'`. The counts are local-only and upstream-only commits, in that order. When a local update is requested and the branch is behind, run `git merge --ff-only '@{upstream}'`.
- Fast-forward the intended local branch when possible. Preserve local edits and unpublished commits. Use a separate checkout when local edits or a different requested revision would make switching the active worktree disruptive. Keep UAT and production on their respective branches. For diverged histories within the same branch, inspect both sides and resolve only within the authorized scope.
- A request to sync to GitHub authorizes publishing the verified source changes in scope. Use a normal push for an authorized fast-forward and re-fetch if the remote moved. Review recoveries or conflicting histories before publishing and honor branch protection. Preserve newer remote commits, avoid force-pushes, and keep unreviewed deployment files and secrets out of Git.
- A Git push can start an existing Vercel build. Use deployment, rollback, promotion, and project settings operations only when the request requires and authorizes them. Use the signed-in account or connector and keep credentials out of files and output.

Follow the [project agreements](../../../AGENTS.md) and use [letsaimit-release](../letsaimit-release/SKILL.md) for requested merges and releases. A sync request alone does not authorize promotion to production.

When an authorized sync includes backend configuration, preserve the user's
20 November 2026 decision: production reuses the existing verified UAT Google
client and Gmail SMTP sender/credential. Both Google origins/callbacks are saved
and production sign-in has been verified. Read the current parity ledger rather
than restarting those setup steps. Google's testing/production project-separation
policy differs from this user-selected shared-client setup; retain the recorded
deviation and do not claim compliance or silently create a replacement client.
Database/Auth/business records, backend public keys, worker bearers, webhook
signing secrets and routing stay separate.

Use authorized native CLI/API operations for app-owned configuration saves and
the approved original private credential source with safe hash/HMAC comparison
and target readback. Keep plaintext and private source paths out of output,
process arguments and Git. Do not repeatedly hand routine saves back to the
user; hand off genuine MFA/password/reauthentication boundaries when needed.
Use mocks and safe read-only/connection checks for email and payments, with no
required real charge or sent test email. Configuration sync is not proof of an
untested live delivery or payment journey.

Verify the local HEAD, the GitHub branch tip, and Vercel deployment status relevant to the request after any update. Report the commit and branch for each version checked, the live production deployment when verified, and any difference or unresolved action. A skill invocation is a one-time operation.
