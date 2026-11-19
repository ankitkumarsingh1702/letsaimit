# SEO and AEO audit before implementation

Audit date 19 November 2026. Source baseline `001c590879290948b1407738c14fb17953aa2780` on `uat`.

## Guides and scope

Read both supplied documents completely, the 253-line `seo_master_skill_100_indexing_guide.md` and the 313-line `aeo_geo_master_skill_ai_indexing_guide.md` in the operator's Downloads folder. Files named `SEO-SKILL-README.md` and `AEO-SKILL-README.md` were absent from the checkout, Downloads and supplied attachments inventory. This audit maps the supplied documents' rules to the actual site.

The current source prerenders 16 route documents. Ten are public content pages eligible for the production discovery inventory. They are `/`, `/programme/`, `/coach/`, `/societies/`, `/schools/`, `/events/`, `/blogs/`, `/privacy/`, `/terms/` and `/refunds/`. The other six are the error page, registration and private account utilities. There are no local dynamic article or event-detail routes. The five blog previews link to their originals on LinkedIn.

The live production site currently has nine public pages. `/blogs/` is live on UAT and returns 404 on production. Production and UAT therefore require separate live coverage reports.

## Requested audit diff

| Deliverable | Before | Implementation target |
| --- | --- | --- |
| Sitemap | No sitemap on either host | Build-time sitemap from the shared public route inventory, meaningful content provenance for lastmod, canonical URL and live-response verification |
| Robots | No robots file; search-agent smoke requests return 200 | Explicit search/user crawler rules on production, private-route exclusions and staging noindex controls |
| LLM content | Both LLM files and Markdown alternatives are absent | Generate llms.txt, llms-full.txt and per-page Markdown from rendered public main content |
| Connected schema | Zero JSON-LD | Shared Organization, WebSite, WebPage and BreadcrumbList graph, with visible-content-specific entities and verified external authorship |
| Initial HTML metadata | Public pages already have prerendered metadata and body | Centralize indexability and metadata, repair the obsolete source-template host, add schema and Markdown discovery links |
| Submission | No post-deploy script or submission state | Verify deployed changed canonical URLs, IndexNow key ownership and receipts, Google sitemap submission/inspection and eligible-only Indexing API support |

## SEO guide rule matrix

| Guide rule | Baseline evidence | Planned treatment |
| --- | --- | --- |
| Definition, frontmatter and CLI installation examples | Reference instructions with no installed SEO runtime | Use the project's existing React/Vite build and local release skills. No global installer is needed |
| Weighted health formula | Content authority and field performance have no measured pillar scores | Report evidence per gate. Numeric scores remain unmeasured |
| Sitemap gate 1, crawled versus listed | All public pages are reachable at depth 0–1; sitemap absent | Compare source inventory, built documents and live canonical crawl |
| Orphan and contextual links | No global-navigation orphans. Schools, Events and Blogs have zero contextual inbound links | Add relevant links within public main content and verify incoming links |
| Gate 2, XML namespace/UTF-8 | No XML sitemap | Generate standards-compliant XML |
| Gate 2, 50,000 URLs/50 MB | Ten source content routes | Validate limits; splitting is unnecessary at this size |
| Gate 3, exact HTTP 200 | All deployed public canonical routes return 200 | Validate every submitted URL, without following a redirect as a pass |
| Gate 3, exact canonical | Public canonical paths match their own deployed host | Validate initial HTML head canonical character for character |
| Gate 3, robots and noindex | Utility pages use noindex; UAT content is currently indexable | Exclude utilities and staging from indexing submissions and production sitemap |
| Gate 3, clean URLs | Current route inventory uses query-free trailing-slash paths | Keep tracking, filter, session and private detail variants out |
| Gate 4, lastmod | No page freshness inventory | Persist page content hashes and real source change dates; unchanged content retains its date |
| Gate 4, priority/changefreq | No sitemap | Omit these unused hints |
| Gate 5, doorway pages | No location-page generator; ten distinct public pages | Record not applicable, and keep route additions explicit |
| Claimed sixth sitemap gate | The supplied guide defines five gates under its six-gate heading | Map its five written gates and the user's separate post-deploy gate |
| Technical 1, SSR metadata/body/links | All deployed public pages have initial HTML title, description, canonical, one H1 and navigation | Preserve prerendering and compare raw HTML with rendered content |
| Technical 2, canonical head placement | Built output passes. index.html still names the obsolete review host | Correct the template and retain target-specific canonical generation |
| Technical 3, pagination/infinite scroll | Public blog previews are all in initial HTML; private dashboards paginate behind sign-in | No new public pagination routes needed |
| Technical 4, crawl traps | No public query-search or calendar loop; private routes exist | Keep private and query variants out of discovery; maintain noindex |
| Technical 5, redirects | HTTP→HTTPS and www→apex take one hop. Slashless and index.html aliases return 200 | Add canonical alias redirects and verify chain length |
| Technical 6, soft 404 | Unknown paths return real 404. Explicit /404/ returns 200/noindex | Make the explicit error endpoint return 404 and exclude it |
| Technical 7, LCP/INP/CLS | Field CWV unavailable in Search Console. Responsive images have dimensions; hero loading varies | Check loading/reserved space and obtain available lab evidence. Field INP and real-user budgets remain unverified |
| Technical 8, security headers | HSTS exists; nosniff and explicit referrer policy are absent | Add safe response headers and verify them |
| Technical 9, hreflang | One en-IN language | Not applicable to the current route set |
| Google diagnostics | Verified owner account already opens sc-domain:letsaimit.com | Use real Search Console evidence and authorized provider submissions |
| Google Indexing API for all URLs | Normal coaching/content pages are ineligible | Include eligibility checks and report zero current eligible pages; submit the sitemap through the general Search Console mechanism |
| IndexNow | No key, verification endpoint or submission script | Implement host verification, changed-URL batching, retry/error reporting and durable submission state |
| Daily automation examples | No existing SEO dispatch automation | Add explicit post-deploy commands and document provider configuration; no unrequested recurring task |

## AEO and GEO guide rule matrix

| Guide rule | Baseline evidence | Planned treatment |
| --- | --- | --- |
| Weighted AEO formula | No measured citability, authority or citation outcomes | Keep the evidence matrix and avoid invented scores |
| Search/user crawler matrix | Nine simulated agents return 200 on both homepages; no robots file | Explicitly allow the requested search and user-fetch agents on public production content |
| Training crawlers | Optional policy, independent of search agents | Preserve that distinction and keep private paths excluded |
| WAF verification | User-Agent smoke checks pass; real provider-IP crawl access unverified | Label smoke tests accurately and retain provider diagnostics |
| llms.txt | 404 | Build a concise Markdown index from the public route inventory |
| llms-full.txt | 404 | Compile clean public main content with source URLs; omit account data, forms, dialogs and site chrome |
| Markdown negotiation or twins | Accept:text/markdown receives HTML; .md alternatives absent | Publish deterministic Markdown alternatives with discovery links |
| First-60-words definition | Existing openings are brief labels/taglines | Use factual, useful introductory copy where appropriate; preserve the public design |
| 130–170-word answer blocks | Absent as a rigid template | Preserve self-contained answers and factual context. Google's current guidance gives no ideal page/chunk length |
| Question-mirrored headings | Six visible Programme FAQs already exist | Reuse those actual questions and retain topic headings where they aid reading |
| Tables and structured lists | Programme uses factual lists and definition lists | Keep semantic facts. No comparison page exists to justify invented comparison data |
| Fact density | Ages 5–14, two weekly sessions, 45–60 minutes, two communities and coach credentials are visible | Use these existing facts and original source attribution |
| Connected entity graph | Absent | Link stable IDs for the real organization, website, page, breadcrumbs and suitable content entities |
| Article/Product/FAQ everywhere | Current public pages have different purposes | Apply content types to matching visible material. Keep LinkedIn articles' original URLs and real visible FAQ answers |
| Entity authority and sameAs | Coach credentials and linked LinkedIn/Instagram profiles exist | Reuse verified identities; do not manufacture third-party mentions or reviews |
| Freshness | Two article publication dates and legal dates are visible | Preserve original article dates and derive page modification dates from material source content |
| Images | All sampled public images have alt attributes and dimensions; WebP variants exist | Preserve image optimization and add suitable image metadata |
| Video/transcripts | Home and Programme use the same explicitly silent stock film | Describe the real visual content and credit the source. Speech transcription is not applicable |
| Agent accessibility | Main/article/nav landmarks and named controls exist | Validate public navigation and control names, with sign-in/consent boundaries retained |
| Agent catalog/WebMCP | No supported public agent API exists | Not applicable; Markdown and links describe the supported public pages |
| IndexNow AI visibility claims | No provider guarantee of immediate crawling or citation | Record accepted notifications separately from indexing or citation results |

## Live provider evidence

The requested Chrome profile is signed in as `ankitkumarsingh97593@gmail.com`, and the existing `sc-domain:letsaimit.com` Search Console property is accessible. Its report, last updated 16 November 2026, shows 14 indexed URLs and seven exclusions. The exclusions are three 404s, two redirects, one alternative canonical and one Google-selected different canonical. The missing examples include old WordPress paths and `/index.html`; they do not establish missing current public content. The submitted sitemap table is empty. Core Web Vitals has no field data.

No credentials, access grants or provider settings were changed during this audit.

## Provider corrections and release boundaries

Google's Indexing API supports only JobPosting pages and BroadcastEvent inside VideoObject. Search Console sitemap submission is the supported general-page submission path. URL Inspection reports indexed-state diagnostics. Acceptance by either provider is not proof of indexing. [Google Indexing API](https://developers.google.com/search/apis/indexing-api/v3/using-api), [Sitemap submission](https://developers.google.com/webmaster-tools/v1/sitemaps/submit), [URL Inspection](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect), [IndexNow](https://www.indexnow.org/documentation)

Schema must describe actual visible content. FAQPage can represent the visible questions, while Google's FAQ rich-result feature was retired in 2026. Google's current AI guidance does not prescribe an ideal chunk length or special schema and says llms files do not change Google visibility. The requested LLM files remain useful public artifacts. [Structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), [AI optimization guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [Documentation updates](https://developers.google.com/search/updates), [llms.txt proposal](https://llmstxt.org/)

The project AGENTS.md and local release skill route ordinary merges to UAT. Production promotion uses a separate explicit trigger and its configured backend. This implementation will prepare production outputs, verify UAT safely, and report actual production/submission prerequisites. UAT and previews will carry noindex and will be rejected by the submission script.

## Execution flow after this audit

1. A shared deterministic public inventory drives metadata, sitemap, schema and Markdown, satisfying requested deliverables 1–5.
2. The existing build prerenders and validates those artifacts, including public discovery links and private exclusions.
3. Post-deploy verification checks real status, canonical, robots and response headers before any provider dispatch, satisfying the deployment trust boundary.
4. An explicit production submission command uses provider credentials, host verification and content-type eligibility, satisfying requested deliverable 6 and provider permissions.
5. Merge, push and verify the authorized UAT target, with production prerequisites and live provider receipts recorded separately.

## Implementation and local verification

Runnable source `91f5c9a` implements the six deliverables through the existing React/Vite prerenderer and the standalone post-deploy CLI. The first reviewed content baseline was generated after this source commit, then rebuilt for each target. Its ten hashes are independent of target origin; their source modification timestamp is `2026-11-19T17:07:45+00:00`.

| Gate | Actual implementation evidence |
| --- | --- |
| Public coverage and orphans | Production-profile build covers all ten public routes, zero orphans and at least two contextual incoming links per non-home page. Future explicit nested routes are covered by regression fixtures |
| Sitemap | Ten canonical production entries, XML namespace/UTF-8, valid timezone-bearing lastmod, no priority/changefreq. UAT and previews have zero indexable entries |
| Metadata and graph | Initial HTML contains route title, description, canonical, OpenGraph, robots and one connected schema graph. Client navigation updates schema and Markdown discovery links |
| LLM content | Both LLM files and all ten Markdown alternatives contain rendered public main content. Forms, dialogs, hidden decoration, navigation and private account routes are excluded |
| Crawl controls | Named search/citation agents allowed on public pages; private pages excluded. Preview/UAT noindex, canonical alias redirects, error document and safe response headers configured |
| Provider submissions | Thirteen HTTP-mocked Python tests cover production-only gates, changed URLs, partial failures, persistent receipts, pending key validation, rate limits and Google eligibility. No real notification was sent |
| Automated checks | All 450 Node tests, 13 Python tests, production-profile build, asset verification and source parity plan pass. All 59 approved source assets remain unchanged |
| Rendered checks | Chrome at 1280 px and 390 px: public content and photographs load, contextual navigation reaches Programme and Schools, one H1, correct canonical and no horizontal overflow. Related links retain 44 px touch targets; no app console errors observed |
| Mobile lab performance | Lighthouse 13.6.0 on the local production-profile homepage: performance 98, accessibility 100, best practices 100, SEO 100; LCP 2.4 s, TBT 0 ms, CLS 0. The poster is 50% smaller at 960 px, and preload matches its actual resource URL |
| Field performance | Search Console has no field CWV data. Lab TBT is not a measurement of real-user INP |

The live production dry run exits 2 because the new discovery manifest, robots, sitemap and key are not deployed there, `/blogs/` still returns 404 and Google API authorization is absent. Provider dispatch is therefore pending. The requested Chrome account has verified Search Console access and its homepage inspection says “URL is on Google”; no access grants or credentials were changed.

Production promotion remains pending. The shared backend source digest is unchanged at `ba8defc9e55b0376f038337d73925353f392c8d29c706c6480e795848e308cdc` (18 migrations and five functions), and the declared production Supabase target remains unconfigured. A UAT build does not establish production readiness or an indexing receipt.

## UAT deployment verification

Merged and pushed `649db9a1b73d793cff9dfaedcb095d3b563e835d` to `uat`. Vercel deployment `dpl_8MNbdK5UX2N3Bj166XjkS6GuEsJq` is READY on `https://uat.letsaimit.com`.

The GET-only live audit made 72 requests with a maximum of six in parallel. All 498 applicable checks passed: ten public pages return direct 200 with matching initial metadata, schema, material hashes and dates; every Markdown alternative and both LLM files return correct content and MIME; robots permit the named public search/citation bots; the sitemap has zero indexable UAT entries; the IndexNow file matches; error paths return genuine 404. All 19 slashless/index.html aliases reach canonical 200 destinations in one 308 hop.

The initial checker also required application response headers on redirects and reported 57 missing-header failures. Vercel's 19 generated redirects carry a 15-byte text/plain stub and omit the configured nosniff, referrer-policy and noindex headers. These were retained as explicit platform observations, rather than application-document failures. All canonical HTML, discovery-file and 404 header checks remain strict and pass. The original response evidence was preserved before this classification.

Read-only Chrome verification on the deployed site confirmed Home → Programme → Blogs navigation, UAT canonical/noindex after hydration, one schema script, matching poster/preload URLs, the loaded blog hero and no horizontal overflow at 390 px. No application console errors were observed. No parent email, payment, registration or indexing notification was sent.
