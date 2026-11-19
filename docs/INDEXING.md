# Indexing notifications

`scripts/force-index.py` verifies the **deployed production build** before sending
notifications. It uses Python 3's standard library; no additional packages are
required. Run it from the repository root after a production deployment. It is
not part of the Vercel application runtime or the UAT build.

```sh
python3 scripts/force-index.py --help
python3 scripts/force-index.py --dry-run --manifest dist/discovery-manifest.json
python3 scripts/force-index.py --submit --manifest dist/discovery-manifest.json --state .cache/indexing-state.json
```

The default is `--dry-run`. Production promotion still requires the project's
explicit production release authorization. A UAT deployment does not permit
production submissions and its discovery manifest is rejected.

## Prerequisites and live gates

- Build the tested source with the production discovery profile. Keep its
  `dist/discovery-manifest.json` artifact for the post-deploy command.
- Deploy that build to `https://letsaimit.com`. Its public
  `/discovery-manifest.json` must match the artifact's URLs, content hashes and
  modification timestamps. This prevents submitting an unreleased build when
  an older production page still returns HTTP 200.
- Every manifest page must be indexable, return HTTP 200 without redirects,
  declare exactly its own canonical URL and permit the configured search and
  citation bots in `robots.txt`. A `noindex` or `none` directive fails the gate.
- The live sitemap must contain exactly the public manifest URLs, with valid
  timezone-bearing ISO timestamps. Sitemap indexes and gzip files are supported.
- The public IndexNow verification file must return HTTP 200 and contain the
  configured key. Its location and the verified Search Console property are in
  [deployment/indexing.json](../deployment/indexing.json). The IndexNow key is a
  public ownership token and is intentionally tracked in the repository.

No notifications are sent while any live gate fails. A failed gate or pending
provider operation exits with code **2** and emits a JSON report. Exit **0**
means the requested checks or notifications completed without a reported issue;
it does not mean search engines indexed every URL.

## Content dates and release artifacts

The public inventory is `PUBLIC_PAGES` in `src/lib/seo.js`. Add a real page
there and declare its content dependencies in `scripts/discovery.mjs`; the
build then includes its HTML, schema, sitemap entry and Markdown automatically.
Build validation rejects missing public documents and orphan pages.

Modification dates come from committed source changes. A matching semantic
content hash preserves its reviewed date in
`deployment/discovery-baseline.json`, so unrelated releases and rebuilds do
not make every page look newly edited. After public source changes, commit the
source first, build it, then run `npm run discovery:baseline` and commit the
updated baseline before pushing the release. A build never edits this baseline
automatically. Keep the resulting production discovery manifest with the
release artifacts for submission verification.

An origin-only local build can verify production discovery output; it does not
configure or authorize a production website release. Use the project's
`release:build` guard and target configuration for actual deployments. A bundle
built with UAT backend settings must remain on UAT.

## Google authorization

Provide `GOOGLE_ACCESS_TOKEN` through the release runner's secret environment.
Do not commit it, paste it into command arguments, print it or extract tokens
from a Chrome session. A signed-in Search Console browser session does not
provide API authorization.

The identity must have permission for `sc-domain:letsaimit.com`. For sitemap
submission, its OAuth token needs
`https://www.googleapis.com/auth/webmasters`. Optional URL Inspection accepts
that scope or `https://www.googleapis.com/auth/webmasters.readonly`. Eligible
Google Indexing API notifications additionally need
`https://www.googleapis.com/auth/indexing` and Indexing API setup/ownership
permissions. Token creation and renewal belong to the release environment.

The script reports missing credentials explicitly. If all live gates pass,
IndexNow can complete independently while Google remains pending. A later run
retains successful IndexNow receipts and retries the incomplete Google work.
Ordinary pages reach Google through Search Console's sitemap submission API.
After production deployment, submitting `/sitemap.xml` manually in the verified
Search Console property is also a legitimate operational alternative. Record
that manual receipt separately; it does not create a scripted API receipt.

Google's Indexing API accepts only supported `JobPosting` pages or live
`BroadcastEvent` content embedded in `VideoObject`. The script checks deployed
JSON-LD for those types and their core required properties. Current coaching,
policy and blog pages have **zero eligible URLs**. They are reported as
ineligible and are excluded from this API. Do not add fictitious job or video
schema to change that result.

```sh
# Optional indexed-version diagnostics, after supplying the scoped token:
python3 scripts/force-index.py --dry-run --inspect
```

Inspection reads Google's indexed version and reports its verdict and coverage
state. It cannot request or force indexing. The diagnostic uses Google's
read-only inspection operation, including during a dry run.

## Receipts, retries and changed URLs

Persist `--state` on durable release-runner storage between deployments. The
default `.cache/indexing-state.json` is local and ignored by Git. It records
public URLs, source hashes, provider status and timestamps, without credentials
or provider response bodies. A lock prevents concurrent writers and each
receipt is saved atomically. An interrupted submission may need a repeat when
the provider received a request before its local receipt was saved.

The first successful run submits all public URLs to IndexNow in batches of at
most 10,000. Later runs submit only URLs whose content hashes lack a successful
receipt. Google sitemap submission is repeated when its content changes;
eligible Google Indexing API pages have independent receipts. HTTP 200 from
IndexNow is a received notification. HTTP 202 means key validation is pending
and remains retryable. Search Console's empty HTTP 200/204 response is a
submission receipt. None of these responses guarantee inclusion or ranking.

Provider failures preserve completed work for other providers. `Retry-After`
is saved and respected on later runs; an HTTP 429 without that header receives
a minimum 60-second wait. The command reports pending work without sleeping or
silently treating it as complete. Retry after the reported interval, supplying
a fresh Google token when needed.

## Implementation checks

```sh
python3 -m unittest discover -s tests -p force_index_test.py
```

The tests mock every HTTP operation. They cover production-only inputs,
unreleased-build rejection, HTTP/canonical/noindex/robots gates, changed-URL
receipts, independent provider failures, IndexNow 202 and 429 handling, eligible
Google notifications, sitemap indexes, read-only inspection and state locking.
They send no real notifications or attendance emails.

Provider references:
[Google Indexing API](https://developers.google.com/search/apis/indexing-api/v3/using-api),
[Search Console sitemap submission](https://developers.google.com/webmaster-tools/v1/sitemaps/submit),
[URL Inspection](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect),
[IndexNow protocol](https://www.indexnow.org/documentation).
