# Bengaluru local search: scope and evidence

Prepared 20 November 2026 against baseline `c223ed8`.

## Requested outcome and measured limits

The user wants LetsAimIt to be discoverable for football, basketball and the
two current Bengaluru communities, including searches using “best” and “near me”.
The deliverable is a 200-query coverage plan and useful local pages. It is not
200 measured rankings or a guarantee of a number-one position. Google describes
local results through relevance, distance and prominence; a keyword list cannot
override the searcher's distance or establish a business's reputation.
[Google local-ranking guidance](https://support.google.com/business/answer/7091).

## Baseline audit diff

| Area | Before | Change in this release |
| --- | --- | --- |
| Public inventory | 14 pages, with Bengaluru and two societies mentioned within general programme pages | Five explicit local pages, bringing the public inventory to 19 |
| Local intent | No dedicated city, sport or society landing pages | One city hub, two sport pages and two society pages with distinct practical information |
| Arrival information | Community names without a dedicated location explanation | Official developer-sourced society addresses, source links and clearly labelled map searches; coaching entry remains subject to confirmation |
| Discovery | Existing metadata/schema/sitemap/Markdown pipeline | Same React/Vite pipeline, self-canonicals, nested breadcrumbs, Service + real Place context, visible FAQs and contextual incoming links |
| Business claims | No verified storefront, coordinates, hours, rating or Google Business Profile ownership in this audit | Preserve unknowns; no fabricated LocalBusiness locations, opening hours, rankings or reviews |
| Query planning | Previous 120-query general editorial baseline | A separate 200-query local matrix with 112 supported facts/guides, 31 gaps and 57 availability/access checks |

## Five useful destinations

| Destination | Purpose |
| --- | --- |
| `/bengaluru/` | Choose between the actual communities and sports, understand the programme and trial process |
| `/bengaluru/football-coaching/` | Football preparation, kit, coach background and local group enquiries |
| `/bengaluru/basketball-coaching/` | Beginner basketball group fit, equipment questions and first-visit preparation |
| `/bengaluru/nambiar-bellezea/` | Narayanaghatta society context, actual sports and confirmed arrival arrangements |
| `/bengaluru/nambiar-ellegenza/` | Muthanallur/Gopasandra society context, actual photographs and community events |

Related questions can share a useful page. The 200 targets do not generate 200
nearly identical local pages. Google cautions against substantially similar
doorway pages and keyword stuffing.
[Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies).

The complete matrix has
[searchable HTML](local-seo-queries-200.html),
[all 200 queries in Markdown](local-seo-queries-200.md),
[CSV](local-seo-queries-200.csv) and [JSON](local-seo-queries-200.json).
Eight exact phrases have provider-estimated Semrush India volume, stored in the
[research receipt](local-seo-queries-200-research.json). These are demand estimates
for that database, not LetsAimIt positions or Bengaluru-only “near me” demand.
The remaining 192 queries have no measured volume. “Supported” means public
programme information or an existing guide supports the fact, not that the new
target is already indexed or answers every related query.

## Location facts and Maps boundary

Bellezea's society address is supported by
[Nambiar's official FAQ](https://nambiarbuilders.com/faq/) and
[project page](https://nambiarbuilders.com/bellezea/).
Ellegenza's locality is supported by the
[official developer page](https://nambiarbuilders.com/ellegenza/) and
[project subsite](https://ellegenza.nambiarbuilders.com/).
The Ellegenza subsite has a malformed postcode, which is omitted. The developer's
sales telephone is not LetsAimIt's coaching telephone. No entrance, precise
coaching pin or coordinates were inferred from these sources.

Google Maps links search for the named society. They are explicitly labelled
society locations, and do not pretend to be a verified LetsAimIt business pin.
The public LetsAimIt contact remains `+91 88688 86074`.

The owner-dashboard check could not run: the existing Chrome connection detached;
a fresh runtime inventory then timed out. No Business Profile was created,
claimed, renamed or modified. This is **unverified ownership/access**, not evidence
that LetsAimIt has no profile. Browser visual QA and a new manual Search Console
submission receipt also remain unavailable through that disconnected session.

For the real Business Profile, the remaining facts to verify are its existing URL
and ownership, actual business model, exact meeting points, resident/non-resident
access and customer-facing hours. A society's address does not prove that a coach
operates a separately staffed, permanently signed storefront there. Google's
[Business Profile guidelines](https://support.google.com/business/answer/3038177)
govern that distinction. Retain the real name **LetsAimIt**; do not add “best”,
neighbourhoods or sports keywords to the business name unless they are its real
established name. No permission or listing was changed to bypass verification.

Source, build, deployed HTTP checks and provider receipts are recorded separately
in [the release ledger](RELEASE-PARITY.md). A successful technical release does
not establish an indexed local page, a Google Maps position or a ranking gain.
