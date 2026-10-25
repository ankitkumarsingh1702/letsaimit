# LetsAimIt design system

Current design reference for the four-page React website, updated 25 October 2026. This document describes the implemented type roles, spacing and responsive rules. `src/styles/typography.css` is the source of truth for font values; component styles control layout. Import typography last, as in `src/main.jsx`.

## Design direction

Keep copy short and easy to understand. Use the existing photographs to show the programme and community. The visual language combines green, lime and sage, rounded image frames and one consistent sans-serif family. The earlier typography scale is restored across all four pages, including large section headings, metrics and the parent quote. The redesigned coach section, football footer and accepted gallery composition remain in place.

## Font family and delivery

| Family | Use | Available style |
| --- | --- | --- |
| Plus Jakarta Sans | Every text role: heroes, section headings, quote, body, navigation, actions, forms, captions, metrics and footer | Normal variable font, weights 200–800. Implemented roles use 400–800. |

The family is bundled as `public/assets/fonts/plus-jakarta-sans-variable.woff2`. `@font-face` registers weights 200–800 and uses `font-display: swap`. The delivered font includes Latin and extended characters, punctuation and supported currency symbols. No runtime Google Fonts request is required. `--font-display` resolves to the same family as `--font-body`.

Keep `font-synthesis: none`; use `font-weight` to select a supported variable weight. Preserve the [font sources](../public/assets/fonts/FONT-SOURCES.md), [SIL Open Font License](../public/assets/fonts/Plus-Jakarta-Sans-OFL.txt) and [original font history](../public/assets/fonts/Plus-Jakarta-Sans-FONTLOG.txt) when redistributing the assets.

## Shared typography roles

All roles use **Plus Jakarta Sans**. Values below are **font size / line height in pixels**.

| Role | Weight | Desktop ≥1024px | Tablet 701–1023px | Mobile ≤700px | Token or selector |
| --- | --- | --- | --- | --- | --- |
| Page hero, including the Home hero's final line | 800 | 88 / 92 | 72 / 76 | 48 / 52 | `--type-h1`, `--line-h1` |
| Section heading / main dialog title | 700 | 56 / 62 | 44 / 50 | 36 / 42 | `--type-h2`, `--line-h2` |
| Card/subheading | 600 | 20 / 28 | 20 / 28 | 20 / 28 | `--type-h3`, `--line-h3` |
| Body | 400 | 16 / 26 | 16 / 26 | 16 / 26 | `--type-body`, `--line-body` |
| Hero / coach introduction | 400 | 18 / 28 | 18 / 28 | 18 / 28 | `--type-intro`, `--line-intro` |
| CTA/action label | 600 | **16 / 24** | **16 / 24** | **16 / 24** | `--type-action`, `--line-action` |
| Navigation | 600 | 14 / 21 | 14 / 21 | 14 / 21 | `--type-nav`, `--line-nav` |
| Form/short label | 600 | 14 / 20 | 14 / 20 | 14 / 20 | `--type-label`, `--line-label` |
| Image caption/context | 400 | **14 / 21** | **14 / 21** | **14 / 21** | `--type-caption`, `--line-caption` |
| Metric/price | 600 | 72 / 76 | 60 / 64 | 44 / 48 | `--type-metric`, `--line-metric` |
| Parent quote | 600 | 48 / 56 | 48 / 56 | 28 / 38 | `--type-quote`, `--line-quote` |
| Footer scene headline / small brand | 600 | 20 / 28 | 20 / 28 | 20 / 28 | `.footer-scene-heading`, `.footer-brand` |
| Legal/small footer copy | 400 | 12 / 18 | 12 / 18 | 12 / 18 | `--type-legal`, `--line-legal` |

At widths of 380px and below, heroes use **44 / 48**. Responsive heading and metric sizes do not change the CTA or caption roles.

Semantic tags do not override their content role: footer column headings and fee-panel labels remain compact navigation/label text. Dialog titles use the section-heading or card-heading role already assigned in `typography.css`. Gallery caption pills and coach chips use the 14px caption size with weight 600 for emphasis.

Shared tracking is `-.035em` for hero and section headings, `-.02em` for subheadings, `-.01em` for actions, `-.045em` for metrics and `-.04em` for the parent quote. Body, captions and navigation use zero tracking. Preserve these roles instead of adding individual font-size overrides. The footer scene headline follows the former 20/28px footer tagline role rather than the larger section-heading role.

## Colour roles

| Role | Value | Use |
| --- | --- | --- |
| Green | `#143e35` | Main ink, dark backing and footer |
| Lime | `#c5f66b` | Primary actions and selected small labels |
| Sage | `#e5ecd9` | Quiet supporting surfaces |
| White | `#ffffff` | Main page surface and text on dark backgrounds |
| Muted ink | `#60736c` | Supporting text and image context |
| Hairline | `#dce4de` | Dividers and light borders |
| Coach surface | `#edf3e2` | Pale coach-section background |

The football artwork blends into the solid green footer. Its top and bottom overlays keep the headline and transition readable. Keep functional controls visually distinct from decorative lime caption pills.

## Spacing and layout roles

Use the existing responsive container and section rules. Avoid adding new offsets solely to compensate for different text sizes.

| Layout role | Current implementation |
| --- | --- |
| Main container | Maximum 1320px; 48px side gutters on wide desktop, 32px at ≤1150px, 24px at ≤900px, 20px at ≤700px. |
| Standard section | 88px vertical padding; 72px at ≤900px; 60px at ≤700px. |
| Section header to content | 38px desktop, 28px mobile. Supporting copy becomes a separate stacked group on mobile. |
| Primary pill button | Minimum 52px height with 12px vertical and 24px horizontal padding in the base rule. Its label remains 16 / 24. |
| Text action | Minimum 44px height with a clear focus outline. |
| Coach section | 56px vertical padding on desktop, 40px on mobile. Two columns become a single column at ≤700px, with copy first. |
| Coach body spacing | 16px above and 22px below the paragraph on desktop; 14px and 18px on mobile. |
| Facts grid | 540px desktop height and 32px card padding; automatic rows of 230px at ≤900px and 190px at ≤700px. At ≤350px, cards form one column with 180px rows. |
| Quote section | 660px minimum desktop height and 172px vertical padding. At ≤700px, the layout uses content-driven height, a 40px gap and 48px vertical padding. |
| Footer scene | 350px tall on wide desktop, 330px at ≤900px. Headline and CTA stack at ≤700px. |
| Footer navigation | Four columns on wide desktop, two at ≤900px, with the brand/contact group spanning both columns on mobile. |

Media and card proportions have their own layout rules. Do not use one fixed height for every image. Preserve important faces and action when changing image framing, and inspect narrow screens after any crop change.

## Protect the approved gallery

The coach and footer work is layered onto the accepted gallery. Its six-image composition, original photo selection, captions, ordering and full viewer remain intact. It inherits the restored Plus Jakarta Sans family and section-heading scale, while keeping **14px captions** and **16px actions**.

The featured images remain, in order:

1. Find your feet.
2. One team.
3. Evening football.
4. Learn together.
5. Play close to home.
6. Find your team.

The full viewer contains all **23 original gallery images**. The package retains all **29 original website image assets** in addition to the new coach cutout and football artwork. Keep source/context metadata in `public/assets/GALLERY-SOURCES.json` and `MEDIA-CREDITS.md`.

Maintain the viewer's previous/next controls, thumbnail selection, Left/Right keyboard navigation, Escape close, focus return and body-scroll handling. Thumbnail centering should move only its horizontal rail. Mobile visual order must match DOM order.

Edit gallery content only in `src/data/gallery.js`; use `HomeGallery.jsx`, `PhotoGalleryDialog.jsx` and `gallery.css` for their existing responsibilities. Avoid broad selectors that silently change its rounded frames, stagger, aspect ratios or responsive grid.

## Coach and footer assets

`HomeCoach.jsx` and `home-coach.css` compose the background-removed `coach-and-player-cutout.png` over a rounded green backing. The source is the existing coach-and-goalkeeper photograph, which remains in the package. At ≤700px, the copy comes first and the two lime labels flow in a separate wrapping row below the image. Keep this image's meaning, the mobile label flow and the established coach-page route. The coach paragraph uses the shared 18/28px introduction role.

`Footer.jsx` and `football-footer.css` use `football-footer-scene.png` as decorative, generated football artwork. It has empty alternative text because the heading, actions and navigation carry the useful content. Do not describe this artwork as a photograph of the actual LetsAimIt venue.

The visible footer photo/film credit line and oversized wordmark remain removed. The replacement headline and small brand use the shared 20/28px subheading size at weight 600. Footer routes, contact links, the free-trial action and the Back to top control remain. Source records and licenses stay in the package; removing a visible credit does not change the provenance or ownership of an asset.

## Editing and review

Update the shared token before changing individual components. Verify the role across all four routes and the dialogs. Preserve the Home gallery and existing form destinations. Check the hero, section headings, facts and quote at desktop, tablet and narrow mobile widths. Keep captions and actions consistent, and retain the new coach and footer layouts when adjusting type.

Use [VERIFICATION.md](VERIFICATION.md) for recorded checks and their limits. This design document specifies the intended current system; it does not claim that an unrecorded browser or device test has passed.
