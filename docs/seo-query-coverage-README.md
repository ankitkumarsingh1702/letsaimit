# LetsAimIt query coverage: 120 candidates

Snapshot: source `aae92e9`, before the subsequent first-party article release.
Later publication and schema verification are recorded in [the release ledger](RELEASE-PARITY.md).

This is a plan for **exactly 120 distinct target queries**, not 120 ranked wins,
120 live Google ranking checks, or search-volume research. It maps reader needs
to the current public site and identifies missing answers.

- [Searchable report](seo-query-coverage-120.html): filters and direct Google links.
- [Complete Markdown list](seo-query-coverage-120.md): all 120 queries in one table.
- [CSV matrix](seo-query-coverage-120.csv): one query per row.
- [JSON matrix](seo-query-coverage-120.json): `metadata`, `summary` and the same
  120 records in `queries`.
- [Visibility audit](SEO-VISIBILITY-AUDIT-2026-11-20.md): current crawl and
  discovery evidence, separate from this content plan.

Only `blogs from coach dhiraj from letsaimit` has a focused Google observation:
Home and Coach appeared, while Blogs did not, in personalized India results on
20 November 2026. That observation does not establish universal positions. The
other **119 queries have not had individual Google ranking checks**.

The coverage labels mean:

| Coverage | Count | Meaning |
| --- | ---: | --- |
| `existing` | 36 | The current public page directly answers the question. |
| `preview` | 13 | The site hosts a short attributed blog preview; the complete work is linked on LinkedIn. |
| `gap` | 71 | The requested answer or operational detail is missing. |

The blog collection contains five previews, not first-party article-detail
pages. Its recorded Search Console status is **Discovered – currently not
indexed (GSC 20 Nov 2026)**. This target status appears on all 65 rows pointing
to `/blogs/`; it is a page status, not 65 individual query checks. The other 55
rows say **Not individually inspected**. A successful live fetch or an indexing
request does not prove that a page has entered Google's index.

Every `target_url` is an existing public hub. A gap may also have a
`proposed_path`, which is a future suggestion, not a live route or a URL to
submit now. No timetable, fee, staffing arrangement, school partnership,
medical outcome, ranking or traffic estimate is invented. Only three rows
concern policy or photo consent; the emphasis is coaching, reading, local
programmes, schools and practical questions from parents and children.

Priorities are editorial judgments: **P1** covers brand discovery, the current
blog discovery issue and information families need before deciding or
attending; **P2** covers substantive guides to prepare and review; **P3** covers
practice-measurement interpretation needing careful context. These are not
predicted demand or ranking scores.

Validation confirmed 120 sequential IDs, 120 unique queries after Unicode
normalization, case folding, punctuation removal and whitespace collapse,
matching CSV/JSON rows, valid coverage labels, and a separate proposed-path
field for future pages. The JSON `summary` contains category, coverage,
priority and verification counts. No runtime changes, publication or provider
submissions are part of these files.
