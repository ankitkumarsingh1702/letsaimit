# 200 Bengaluru and society search targets

This plan contains **exactly 200 distinct query candidates**, mapped to five
published local landing pages. It is not a claim of 200 Google rankings, 200 new
pages, 200 measured search volumes or guaranteed first position.

- [CSV](local-seo-queries-200.csv): one query per row.
- [JSON](local-seo-queries-200.json): metadata, counts and the same 200 records.
- [Keyword-research receipt](local-seo-queries-200-research.json): actual Semrush
  responses for two focused India-database keyword seeds.

The target paths are `/bengaluru/`, its football and basketball pages,
and dedicated Nambiar Bellezea and Nambiar Ellegenza pages. These paths passed production HTTP, content and discovery checks on **20 November
2026**, from tested source `e367793`. The planning classifications below retain
their baseline meaning; publication does not establish Google indexing or rankings.
The original planning source and published source are saved in the JSON metadata.

## Coverage and scope

| Label | Queries | Meaning |
| --- | ---: | --- |
| `supported` | 112 | Existing public source supports the programme fact or guide. |
| `gap` | 31 | A useful comparison or substantive answer needs accurate content. |
| `access/availability-check` | 57 | Venue entry, proximity, timing, fees, places or arrangements need confirmation. |

There are 150 city-level candidates, 25 for Nambiar Bellezea and 25 for Nambiar
Ellegenza. Ten clusters cover discovery, choosing a programme, first sessions,
practical details, the two communities, society partnerships, parent learning
and enrolment. Editorial priorities are not estimated difficulty or predicted
rankings.

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
removal and whitespace collapse. Every target belongs to the five explicit
published routes, every coverage value is valid, and every row identifies intent,
geography, priority, verification status and a concrete next action.

No individual LetsAimIt Google position is measured by this artifact. The five
pages were released separately through UAT and production; see the
[release ledger](RELEASE-PARITY.md). This report does not create a Business Profile
or change backend, email or provider settings.
