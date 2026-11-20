# 200 Bengaluru and society search targets

This plan contains **exactly 200 distinct query candidates**, mapped to five
published local service pages and substantive first-party guides. It is not a claim of 200 Google rankings, 200 new
pages, 200 measured search volumes or guaranteed first position.

- [CSV](local-seo-queries-200.csv): one query per row.
- [JSON](local-seo-queries-200.json): metadata, counts and the same 200 records.
- [Keyword-research receipt](local-seo-queries-200-research.json): actual Semrush
  responses for two focused India-database keyword seeds.

The target paths are `/bengaluru/`, its football and basketball pages,
and dedicated Nambiar Bellezea and Nambiar Ellegenza pages. These paths passed production HTTP, content and discovery checks on **20 November
2026**, from tested source `e367793`. The original classifications were reassessed after the owner prioritised all content gaps.
Publication does not establish Google indexing or rankings.
The original planning source and published source are saved in the JSON metadata.

## Coverage and scope

| Label | Queries | Meaning |
| --- | ---: | --- |
| `supported` | 143 | Programme facts or an original guide answer the mapped topic; guide publication status is recorded separately. |
| `gap` | 0 | All31 former content gaps now have substantive source content and exact section mappings. |
| `access/availability-check` | 57 | Venue entry, proximity, timing, fees, places or arrangements need confirmation. |

There are 150 city-level candidates, 25 for Nambiar Bellezea and 25 for Nambiar
Ellegenza. Ten clusters cover discovery, choosing a programme, first sessions,
practical details, the two communities, society partnerships, parent learning
and enrolment. L002–L004 are P0 at the owner’s request. Editorial priorities are not estimated
difficulty or predicted rankings.

“Best” is a real searcher comparison intent. It does not license an unsupported
best-in-city claim, fake ratings, awards, reviews, competitor facts or basketball
certification. Dhiraj's displayed U.S. Soccer credentials remain football
credentials. Community coaching must not be relabelled as a professional academy
or player-development pathway without evidence.

Only Bengaluru and the two confirmed societies are represented as service
locations. A near-me query depends on the searcher's position and venue access.
No new branch, city-wide network, open public court, visitor permission,
guaranteed place, fixed fee, weekend batch, private lesson or extra age range is
invented. Real questions about those matters remain explicit checks.

## What the research measured

Semrush's India `phrase_related` report returned keyword estimates for
`football coaching in bangalore` and `basketball coaching in bangalore`.
Eight exact candidate phrases match returned terms. The estimates are preserved
in `metadata.exact_query_keyword_estimates`; no estimate has been extrapolated
to a different city spelling, society or longer question.

Examples from the returned data:

| Exact keyword | Provider-estimated search volume |
| --- | ---: |
| football academy in bangalore | 1,300 |
| best football academy in bangalore | 390 |
| best football coaching in bangalore | 110 |
| basketball academy in bangalore | 140 |

These are third-party keyword estimates from the India database, not LetsAimIt
positions, Search Console counts or proof of traffic. Near-me estimates in the
receipt are **not Bengaluru-only volumes**. The provider did not supply a
precise estimation window in these responses. Most candidates have no measured
volume. Irrelevant club, ticket and competitor-name results were excluded.

## Validation

The JSON and CSV contain 200 matching rows with sequential `L001`–`L200` IDs.
All queries are unique after Unicode normalization, case folding, punctuation
removal and whitespace collapse. Every target belongs to an explicit
public service or guide route, every coverage value is valid, and every row identifies intent,
geography, priority, verification status and a concrete next action.

## Content-gap follow-up

Nine new original guides and the existing first-football-session guide cover the
31 former gaps. Every resolved row preserves its original service destination in
`service_path` and names a real `target_path`, `answer_section` and `answer_title`.
The report links directly to the answer. All nine new guides were published on
UAT and production on 20 November 2026 from tested source `df470f7`; each resolved
row now records `content_status: published`. All 13 articles, 31 answer anchors
and 48 unique responsive image URLs passed live checks on both targets.
The original 112/31/57 counts are retained in JSON metadata.
The 57 access/availability checks still require genuine current information.

The new guides use actual Ellegenza photographs or labelled original diagrams;
no basketball-session photo, coach-review claim or academy accreditation is invented.

Regenerate HTML/Markdown after editing the structured plan with
`python3 scripts/build-local-query-report.py`. CSV contains the same200 rows
and their additional answer/service mappings.

No individual LetsAimIt Google position is measured by this artifact. The five
pages were released separately through UAT and production; see the
[release ledger](RELEASE-PARITY.md). This report does not create a Business Profile
or change backend, email or provider settings.
