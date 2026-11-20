# Original editorial illustrations — 20 November 2026

These four diagrams were authored as original SVG artwork for LetsAimIt's
parent guides. They are illustrations, not photographs, verified coaching
records, athlete benchmarks, or evidence of an actual lesson. They do not
represent real children or claim that a coach reviewed the accompanying guide.

| Public image | Editable source | Meaning |
| --- | --- | --- |
| `editorial-basketball-start.png` | `src/features/blog/illustrations/editorial-basketball-start.svg` | Meet the coach, try one activity and talk afterwards; a general introduction rather than a promised lesson sequence. |
| `editorial-basketball-skills.png` | `src/features/blog/illustrations/editorial-basketball-skills.svg` | Dribbling, passing, footwork and shooting as separate starting points; no fixed milestones or training prescription. |
| `editorial-sport-choice.png` | `src/features/blog/illustrations/editorial-sport-choice.svg` | Compare a child's interest, group fit and a trial session when exploring football and basketball. Neither sport is ranked above the other. |
| `editorial-practice-progress.png` | `src/features/blog/illustrations/editorial-practice-progress.svg` | Distinguish attendance, separate attempts and coach conversation. No real student data, measured result or age benchmark is shown. |

All public originals are in `public/assets/`. The art uses LetsAimIt's forest,
lime, orange and paper colours. Each source includes an accessible title and
description and embeds the existing Plus Jakarta Sans WOFF2 for consistent
export. Its existing SIL Open Font License and notices remain in
`public/assets/fonts/Plus-Jakarta-Sans-OFL.txt` and
`public/assets/fonts/Plus-Jakarta-Sans-FONTLOG.txt`.

## Export and responsive derivatives

The editable drawings use a 1440 × 1080 viewBox. Mac Quick Look's thumbnail
renderer uses a square canvas, so export uses a temporary 1440 × 1440 viewBox
without changing the drawing. `qlmanage -t -s 1400` produces the square raster;
the blank lower export margin is mechanically trimmed to 1400 × 1050. This
normalisation preserves the entire vector drawing and avoids Quick Look's
right-edge crop of a non-square SVG. It does not alter a photograph.

Responsive WebP variants and thumbnails were generated only for these four
new PNGs through `scripts/optimise-media.py --image NAME.png`. Pillow was used
in an isolated temporary development environment; no application dependency or
global Python package was added. Original project photographs and fonts were
not regenerated or modified.

The source PNG/SVG files and this provenance record are included in
`docs/ASSET-MANIFEST.json`; responsive dimensions, source hashes and derivative
hashes are in `src/data/media-manifest.json`. Image captions on the public
articles should clearly identify the artwork as illustrations. Set
`image.illustration: true` for article heroes to preserve their full aspect
ratio. Inline `section.image` figures preserve their natural proportions and
use lazy loading.
