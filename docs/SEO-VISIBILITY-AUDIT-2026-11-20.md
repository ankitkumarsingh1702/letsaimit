# Blogs visibility audit — 20 November 2026

This is the **pre-implementation snapshot** of source `aae92e9` and the live
observations made around 13:32–13:40 IST. The subsequent article/schema release
is recorded separately in [the release ledger](RELEASE-PARITY.md). Its later
publication does not retroactively change these Google inspection receipts or
the original 120-query coverage baseline.

The live Blogs page is accessible and permits indexing. Search Console's stored
inspection nevertheless reports **Discovered – currently not indexed**: Google
knows the URL but shows no recorded crawl. The subsequent live test successfully
fetched the page and allowed indexing, while identifying separate structured-data
issues. These are different findings; neither establishes a ranking position.

The publication model also limits topic coverage: LetsAimIt currently hosts a
collection of five LinkedIn previews, not five first-party article pages.

## Evidence and limits

| Evidence | Observation |
| --- | --- |
| Fresh public HTTP checks | 20 November, 08:07:44 UTC / 13:37:44 IST. All ten public URLs returned direct 200 HTML, one exact self-canonical, `index, follow, max-image-preview:large` and no response `noindex`. Maximum four simultaneous requests. The [public HTTP receipt](seo-evidence/2026-11-20-http-eligibility.json) also records four fresh discovery-endpoint GETs. This checks public delivery, not Google's index. |
| Stored GSC inspection: `/blogs/` | Verified property-owner UI reports **URL is not on Google**, **Discovered – currently not indexed**, with `https://letsaimit.com/sitemap.xml` as the sitemap. Referring page: **None detected**. Last crawl, crawled as, fetch, crawl/indexing permission and canonical fields are N/A in that stored report. N/A is not a failed-fetch or canonical-error diagnosis. |
| GSC live test: `/blogs/` | 20 November, 13:32:07 IST: **URL is available to Google**, with issues; page can be indexed. Google Inspection Tool smartphone: crawl allowed Yes, page fetch Successful, indexing allowed Yes, self-canonical `https://letsaimit.com/blogs/`. This is a fresh test, not confirmation of index inclusion. |
| Live structured-data results | One valid breadcrumb item; three invalid Discussion forum items. The expanded “Why I started coaching” `SocialMediaPosting` reports missing `datePublished`. Source has no verified dates for the three linked social posts. The live test still says the page can be indexed: this is a rich-result validation problem, not a demonstrated crawl/index block. |
| Indexing request | On 20 November, the owner received **Indexing requested** confirmation: the URL was added to the priority crawl queue. One request was made today. This is a confirmed request, not proof of subsequent index inclusion or a particular search result. [Receipt](seo-evidence/2026-11-20-blogs-indexing-requested.png). |
| Observed Google query | A fresh signed-in India search for `blogs from coach dhiraj from letsaimit` displayed homepage and Coach organic results, without Blogs among the displayed results. The AI Overview said “No published blogs or articles from Coach Dhiraj appear in search results for LetsAimIt”. This records that personalized result, not a universal rank or a claim that the live previews do not exist. [Screenshot](seo-evidence/2026-11-20-google-query.png). |
| Performance snapshot | Search Console had three months selected and reported last update three hours ago; the visible chart covered 8–18 November. Site totals were 3 clicks, 12 impressions, 25% CTR and average position 3.1. These are aggregate values, not rankings for the proposed 120 queries. The only visible query row was `letspostit - private soccer practice`: 0 clicks, 1 impression. |
| Performance page visibility | The first ten of eleven page rows included Home (3 clicks, 11 impressions), Events, Societies, Coach, Schools and older legal paths. Blogs was not in those ten visible rows; the remaining row was not inspected. This does not establish that Blogs is absent from the entire performance table. The visible chart dates precede the 19–20 November production release. |
| Older site-wide indexing report | Last updated 16 November: 14 indexed URLs and 7 exclusions. It predates the current release and cannot establish the indexing state of all ten current public routes. |

“None detected” for a referring page does not mean the website has no internal
links. Current source and the live discovery manifest identify three in-main
related-page links to Blogs, in addition to global navigation/footer links.
The [stored URL-inspection screenshot](seo-evidence/2026-11-20-blogs-index-status.png)
preserves the discovered-but-not-indexed state separately from the later request.
The [current Google-status receipt](seo-evidence/2026-11-20-google-status.json)
records the sitemap, stored inspection, live test, request and performance observations.

An independent Semrush organic-ranking lookup for `letsaimit.com` in the India
database returned `no_data` (non-retryable). No country or parameter retries were
made. This is a limitation of that third-party dataset, not proof of zero Google
rankings; it supplies neither query volumes nor replacements for GSC totals.
The [Semrush response receipt](seo-evidence/2026-11-20-semrush-india.json)
records that dataset limitation separately.

## The 120-query coverage matrix

The [searchable report](seo-query-coverage-120.html),
[complete Markdown list](seo-query-coverage-120.md),
[CSV](seo-query-coverage-120.csv) and [JSON](seo-query-coverage-120.json)
contain exactly 120 distinct target queries across twelve categories.
There are **36 existing answers, 13 preview-only matches and 71 content or
operational-detail gaps**. These counts describe query coverage, not page counts,
Google rankings or search demand. Several related questions can share one useful
article. Only the user's exact query has a focused live result observation;
the other 119 positions remain unverified.

Each row names a real public target hub, intent, coverage, editorial priority,
next action and the target hub's inspected status. Proposed article paths are
labelled unpublished and are not presented as functioning URLs. Local integrity
checks confirmed matching CSV/JSON/HTML data, 120 normalized-unique queries and
120 Markdown Google links. Rendered Chrome checks confirmed search and category/
coverage filters, empty results, reset behavior and no horizontal overflow at
390 px or the default 1470 px viewport. See the
[report verification receipt](seo-evidence/2026-11-20-query-report-checks.json).

## Public route inventory

All rows below passed the fresh HTTP/canonical/robots checks described above and
are listed in the production sitemap. Only Blogs received a current GSC URL
inspection in this audit. The other rows must not be labelled indexed from their
HTTP results alone.

| Canonical path | Fresh HTTP eligibility checks | Current GSC inspection |
| --- | --- | --- |
| `/` | Pass: 200, self-canonical, index permitted | Not inspected |
| `/programme/` | Pass: 200, self-canonical, index permitted | Not inspected |
| `/coach/` | Pass: 200, self-canonical, index permitted | Not inspected |
| `/societies/` | Pass: 200, self-canonical, index permitted | Not inspected |
| `/schools/` | Pass: 200, self-canonical, index permitted | Not inspected |
| `/events/` | Pass: 200, self-canonical, index permitted | Not inspected |
| `/blogs/` | Pass: 200, self-canonical, index permitted | Discovered – currently not indexed; live fetch/indexing checks pass |
| `/privacy/` | Pass: 200, self-canonical, index permitted | Not inspected |
| `/terms/` | Pass: 200, self-canonical, index permitted | Not inspected |
| `/refunds/` | Pass: 200, self-canonical, index permitted | Not inspected |

Private account routes, registration utilities and the error document are
intentionally excluded from the public sitemap. Their exclusion is not a coverage
defect. The ten-URL inventory is complete for the public pages that currently
exist; it does not imply ten indexed pages or article coverage for every query.

## Six requested deliverables: current gate status

Today's limited rechecks are recorded in the two receipts above. The earlier
production release verification in the [release ledger](RELEASE-PARITY.md)
recorded 521 strict checks; that full suite was not rerun for this report.

| Requested deliverable | Verified in this audit | Earlier receipt or remaining gate |
| --- | --- | --- |
| Dynamic sitemap covering public routes | Fresh XML is 200, lists the exact ten canonical public URLs, and all ten `lastmod` values are valid ISO timestamps. Each target passed the fresh direct-200/canonical checks. Current GSC says the sitemap was processed successfully, last read 20 November, ten discovered pages. | Build-time generation uses the shared route inventory. Full content-hash/date stability and discovery coverage were verified at release; those deeper checks are historical, not rerun today. Sitemap discovery does not prove indexing. |
| Production robots for search and citation bots | Fresh 200 robots allows public paths for Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot and PerplexityBot, while excluding private routes. Google's live Blogs fetch is successful. | Private/UAT exclusion and real-error checks have release receipts. Today's report does not repeat every private or preview response check. |
| `/llms.txt` and `/llms-full.txt` | Both freshly return 200 Markdown text, contain the Blogs source URL and are generated from the public page inventory. | Full corpus/hash/content coverage passed the earlier release suite. These files do not make LinkedIn article bodies first-party content or establish Google indexing benefits. |
| Connected JSON-LD graph | Current Blogs source/HTML connects Organization, WebSite, WebPage/CollectionPage, BreadcrumbList, author and original external works. Google's live test confirms one valid breadcrumb and three invalid social-post rich-result items. | All-route graph checks passed at release. The newly observed three `SocialMediaPosting` date issues remain a specific pending improvement; no dates will be invented. Article/Product/FAQ types must describe actual visible content, not be forced onto every route. |
| Initial HTML metadata | All ten fresh responses have the exact self-canonical and permit indexing. Blogs title, description, canonical and visible content are present in its initial HTML. | All-route title/description/OpenGraph and schema checks passed at release. This audit did not repeat every metadata assertion on the other nine pages. |
| Post-deploy provider submissions | Current GSC confirms the processed ten-page sitemap and today's one Blogs indexing-request receipt. | The release ledger records IndexNow HTTP 200 acceptance for ten URLs. That provider request was not repeated today. The existing `scripts/force-index.py` verifies live gates and restricts Google's Indexing API to eligible JobPosting/livestream pages; current pages have zero eligible URLs. Missing Google API-token authorization is still recorded honestly; the supported sitemap operation was completed through owner-authorized Search Console UI. No unsupported blog URL notifications are required or claimed. |

## Audit diff: current implementation versus the remaining work

| Area | Current evidence | Required change or remaining gap |
| --- | --- | --- |
| Deployment and initial HTML | `/blogs/` is direct 200. Its title, description, H1, byline, all five previews, source links and graph are present before JavaScript. | No confirmed prerendering or deployment defect. Keep React/Vite and the existing prerenderer. |
| Crawl controls | Live robots permits public crawling for Googlebot, Bingbot and the configured search/citation agents; private paths are excluded. GSC's fresh smartphone fetch succeeds. | No robots change indicated by this evidence. Public requests and simulated agents alone would not prove real crawler-IP access; the GSC live test is stronger fetch evidence. |
| Sitemap and links | Ten production entries include Blogs. Live manifest reports zero orphans; Blogs has three in-main related links from Programme, Coach and Events. Header/footer also link to it. | Retain this discovery structure. GSC discovery does not yet establish a completed crawl. |
| Metadata and visible identity | Title is “Coach Dhiraj’s Blogs on Youth Sport & Coaching — LetsAimIt”; description names Dhiraj Mishra and LinkedIn previews. Visible H1 is only “Blogs”, followed by a Dhiraj byline. | A clearer branded H1 and one factual introductory sentence would connect author, LetsAimIt and the publication model in visible copy. This is an improvement opportunity, not a proven cause of non-indexing. |
| Publication depth | Two article previews and three social-post previews; one featured hero plus four collection cards. Their five summaries total **102 words**. The measured main contains about 245 words including headings, labels and link text. | There are no full first-party articles. This limits available on-domain answers for detailed warm-up, coaching-safety and related topic queries; no arbitrary word-count threshold or penalty is inferred. |
| Article URLs | Every reading/title link targets its original LinkedIn URL. `PAGE_META` contains only the Blogs hub. A sample would-be `/blogs/the-question-the-doctor-asked/` path returns genuine 404. | This is an absent publication feature, not a broken published article link. Genuine first-party articles would need explicit routes, visible bodies and discovery entries. |
| Collection and author graph | `CollectionPage` → `ItemList` points to two external `Article` and three `SocialMediaPosting` nodes. Their author connects to Dhiraj's local Person node and verified LinkedIn profile. Original URLs remain external; no false LetsAimIt publisher claim is made for those originals. | Preserve factual attribution and external URL identity. Schema cannot substitute for visible first-party articles. |
| Social-post rich results | Google detects three invalid Discussion forum items; one expanded item lacks `datePublished`. All three social entries intentionally have unknown publication dates. | Either obtain and display verified original dates/appropriate metadata, or model the off-site references as citations/simple list entries rather than attempting full social-post rich results. Do not invent dates or copy the build date. |
| LLM and Markdown artifacts | `/blogs.md` returns 200 Markdown with intentional duplicate-alternative `noindex`; the generated corpus contains the same previews, not external full articles. | Minor confirmed export defect: label/date becomes `Article21 May 2026` or `Article6 May 2026`, because the visual separator is omitted without replacement whitespace. Fix separation independently of Google indexing. |
| Query and AI visibility | Stored GSC has not indexed Blogs; the live test is successful. No query-level ranking or AI-citation guarantee has been established. | Track indexing first, then impressions/clicks and query/page fit. Treat the 120-query list as a coverage and measurement plan. |

Source locations for the findings:

- [Blog records](../src/features/blog/blog-posts.js) and [visible Blogs page](../src/pages/Blogs.jsx): five summaries, original URLs, layout and absent full article bodies.
- [SEO inventory and graph](../src/lib/seo.js) and [route lookup](../src/lib/routes.js): public routes, external-work identity and missing first-party detail routes.
- [Related-page links](../src/components/RelatedPages.jsx): contextual routes pointing to Blogs.
- [Prerenderer](../scripts/prerender.mjs) and [discovery exports](../scripts/discovery.mjs): initial metadata/schema, sitemap, Markdown and the separator defect.
- [Provider submission script](../scripts/force-index.py): live gates, provider receipts and restricted Google API eligibility.

## Ranked improvement plan

1. **Monitor the confirmed indexing request.** The request receipt is recorded;
   monitor the stored URL inspection for its first crawl, canonical and index
   outcome. If it remains unindexed, use the resulting reason and fetched page
   to choose the next action. Do not repeatedly submit the same request.
2. **Correct the social-reference rich-result modelling.** Keep unknown dates
   unknown. Prefer a collection/citation representation when the site only
   carries a preview; use richer post metadata only when its facts are verified.
   Validate the resulting page, without describing that validation as indexing.
3. **Clarify the hub.** Add a concise, factual author/brand introduction and more
   descriptive H1. Link the author to the existing Coach page while retaining
   the original LinkedIn attribution. Preserve the current clean layout.
4. **Close genuine content gaps.** For topics intended to be answered on
   LetsAimIt, obtain approved original text or produce substantive, fact-checked
   articles for review. Extend the existing React/Vite route inventory and
   prerendering with each real article's canonical, body, author, dates, suitable
   Article graph, internal links, sitemap and Markdown. Do not turn 120 query
   variations into 120 thin pages or relabel off-site originals as local works.
5. **Repair the small Markdown separator defect and measure coverage.** The
   query matrix should distinguish existing target pages, missing content,
   inspected indexing state and observed search performance. The 120 queries are
   planning candidates, not 120 measured rankings or verified search volumes.
   A candidate query is not a promise that Google will show the site for it.

## Guides, historical evidence and provider boundaries

Reviewed both supplied guides, `seo_master_skill_100_indexing_guide.md` and
`aeo_geo_master_skill_ai_indexing_guide.md`, alongside the original
[SEO/AEO audit](SEO-AEO-AUDIT.md) and current [release ledger](RELEASE-PARITY.md).
The older audit's production-404 and pending-deployment passages describe its
19 November baseline; they are not current live failures. Earlier release checks
remain historical evidence and are distinct from today's ten-route HTTP checks
and the single current GSC inspection.

The guides' instant/100% indexing promises, fixed answer-block lengths and
all-URL Indexing API advice are not valid release guarantees. Google says its AI
features use the same fundamental search requirements; a supporting page must be
indexed and snippet-eligible, and inclusion is not guaranteed. Its current
guidance says LLMS/Markdown files do not improve Google visibility, there is no
ideal chunk length, and no special AI schema is required.
[AI feature requirements](https://developers.google.com/search/docs/appearance/ai-features),
[Google's AI optimization guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

Google's Article guidance recommends applicable author/date/content properties;
it does not make a collection into an original article. Its Discussion forum
guidance also covers `SocialMediaPosting` and requires publication metadata for
that rich-result format. These specific eligibility rules explain the live
validation issue; they do not override the successful page-fetch result.
[Article documentation](https://developers.google.com/search/docs/appearance/structured-data/article),
[Discussion forum documentation](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum).

Normal blog pages use sitemap submission and the supported URL Inspection
request flow. Google's Indexing API is restricted to JobPosting and qualifying
livestream pages. A crawl request may take days or weeks and guarantees neither
indexing nor ranking; repeated requests do not accelerate the same URL.
[Recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl),
[Indexing API scope](https://developers.google.com/search/apis/indexing-api/v3/using-api).

This report changes documentation only. No runtime, deployment, crawler setting,
article content or provider configuration was changed for this audit.

Completed: the source/public audit, the current ten-route eligibility receipt,
the verified Google diagnosis and one confirmed Blogs indexing request.
Pending: the ranked content/schema/Markdown improvements and later confirmation
of Google's crawl/index outcome. No implementation or deployment is included in
this query/report task.
