# Sharing and static deployment

The React build emits a complete HTML document for each route. The header,
footer, content, title and social-preview metadata are present in the HTML
before JavaScript runs. React hydrates the same markup for interactive forms,
galleries and testimonials.

## Build

```sh
npm ci
npm run build
```

Deploy the contents of `dist/` at the domain root. The build runs Vite's client
build, creates a temporary server rendering bundle, and then runs
`scripts/prerender.mjs`. The temporary `.ssr/` directory is removed afterward
and is not required in deployment or the source export.

The current canonical origin is:

```text
https://letsaimit-review.one92843.chatgpt.site
```

When moving the same source to another domain, set `VITE_SITE_ORIGIN` to its
HTTPS origin in `.env.local` and rebuild. For example:

```text
VITE_SITE_ORIGIN=https://letsaimit.com
```

Use the origin only, with no path or query. The build rejects invalid origins.
This value is public configuration, not a credential.

## Page routes

| Page | Generated file | Share URL path |
| --- | --- | --- |
| Home | `dist/index.html` | `/` |
| Programme | `dist/programme/index.html` | `/programme/` |
| Meet the coach | `dist/coach/index.html` | `/coach/` |
| For societies | `dist/societies/index.html` | `/societies/` |
| For schools | `dist/schools/index.html` | `/schools/` |
| Events | `dist/events/index.html` | `/events/` |
| Privacy | `dist/privacy/index.html` | `/privacy/` |
| Terms | `dist/terms/index.html` | `/terms/` |
| Cancellations and refunds | `dist/refunds/index.html` | `/refunds/` |
| Page not found | `dist/404/index.html` and `dist/404.html` | `/404/` |

Previously shared hash links still open the matching page in the browser.
Share the clean paths above for a page-specific link preview. A URL fragment
is not sent to the server, so a `/#/programme` share can only fetch the home
document's metadata. See the [MDN URL fragment reference](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment).

## Social previews

Each document has exactly one canonical link, description, Open Graph title,
description and URL, plus Twitter card metadata. All routes use the same
branded `assets/share-letsaimit-1200x630.png` image, with explicit dimensions
and alternative text. The image URL is absolute and follows the configured
origin.

Metadata uses the [Open Graph protocol](https://ogp.me/). The exact display and
refresh timing remain controlled by the sharing service; a previously shared
URL may retain an older cached preview.

The share image uses the approved logo, Plus Jakarta Sans, forest green, lime,
and code-drawn football and basketball graphics. It contains no stock parent
portraits, private lead data, public prices or unconfirmed event details.

## Favicon assets

| File | Purpose |
| --- | --- |
| `public/assets/favicon.svg` | Self-contained vector of the existing running mark |
| `public/assets/favicon-32.png` | 32 × 32 browser icon |
| `public/assets/favicon-180.png` | 180 × 180 Apple touch icon |

To regenerate these assets and the share image, run
`python3 scripts/create-brand-assets.py` in an environment with Pillow
available. The generated assets are already committed, so deployment does not
require Python or image-processing packages. The original logo and font
remain unchanged.

## Hosting and 404s

Configure the host to serve directory index documents for the routes above.
Configure unknown paths to serve `404.html` with HTTP status **404**. The file
is included, but the hosting platform decides the HTTP status; simply
rewriting every unknown path to the home page with status 200 is not a real
HTTP 404. No host-specific redirect file is generated without a verified
hosting contract.

The 404 page has its own title and `noindex, follow` metadata. The React
router also renders its page-not-found view for an unknown legacy hash route.

## Verified during implementation

- The production client build and server rendering build complete.
- All ten route documents contain one rendered H1.
- Titles, descriptions, canonical URLs, OG tags and Twitter tags are present
  exactly once and match their route.
- The share PNG is exactly 1200 × 630; PNG icons are 32 × 32 and 180 × 180.
- The generated 404 files have identical content and `noindex` metadata.

Browser interaction, real hosted route status codes, actual transfer sizes,
and a sharing service's cached preview are separate end-to-end checks.
