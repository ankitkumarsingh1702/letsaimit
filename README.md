# LetsAimIt — React codebase

A complete React + Vite codebase for the four-page LetsAimIt website, including the expanded Home gallery, redesigned coach feature and football landscape footer. The pages, forms, navigation, gallery and media controls are implemented as React components. The current design restores locally hosted **Plus Jakarta Sans throughout** and the earlier typography scale, with the established green, lime and sage palette.

The ZIP includes the editable source, a dependency lockfile, local image/video/font assets and a prebuilt `dist/` folder. `node_modules/` is intentionally excluded; install dependencies with `npm ci`.

## Quick start

Use **Node.js 22.12 or newer** and npm. **Node.js 24 is recommended** and matches the verified runtime used for this export.

Extract the ZIP, open a terminal in the `letsaimit-react` folder, then run:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

**No `.env` file, API key, database or backend service is needed.** The first dependency installation requires an internet connection. The website's images, video and fonts are bundled locally; WhatsApp and Google Forms open their own external websites when a visitor chooses those actions.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact dependencies recorded in `package-lock.json`. |
| `npm run dev` | Start the development server with live updates. |
| `npm run build` | Generate a fresh production build in `dist/`. |
| `npm run preview` | Preview the current `dist/` build over HTTP, normally at `http://localhost:4173`. |
| `npm test` | Run the form validation and WhatsApp message tests. |

To check a fresh production build locally:

```bash
npm run build
npm run preview
```

The included prebuilt `dist/` can also be previewed immediately after `npm ci` by running `npm run preview`, without rebuilding it first.

## Pages and routes

Navigation uses hash routes, matching the approved site:

| Page | Route | Main source file |
| --- | --- | --- |
| Home | `#/` | `src/pages/Home.jsx` |
| Programme & fees | `#/programme` | `src/pages/Programme.jsx` |
| Meet Coach Dhiraj | `#/coach` | `src/pages/Coach.jsx` |
| For societies | `#/societies` | `src/pages/Societies.jsx` |

For example, the local programme page is `http://localhost:5173/#/programme`. An empty or unrecognised hash falls back to Home. Hash routing allows the four pages to work on a normal static host without a separate server endpoint for each page.

## Project structure and editing guide

| Location | What it contains / where to edit |
| --- | --- |
| `src/main.jsx` | React entry point and stylesheet imports. Typography is imported last to keep the shared type scale consistent. |
| `src/App.jsx` | Page composition, page titles, navigation focus and shared dialog state. |
| `src/pages/` | The four pages. Edit section copy, headings, page-specific images and content here. |
| `src/components/Header.jsx`, `Footer.jsx` | Shared navigation and footer content. |
| `src/components/ContactDialog.jsx` | Trial, society enquiry and enrollment panel markup and behaviour. |
| `src/components/HomeFilm.jsx`, `ProgrammeFilm.jsx` | Local video presentation and playback controls. |
| `src/components/MediaDialog.jsx` | Coaching certificate viewer. |
| `src/components/HomeGallery.jsx` | The six featured Home photographs and the action that opens the full gallery. |
| `src/components/HomeCoach.jsx` | The coach feature with its cutout photograph, rounded backing, small labels and coach-page link. |
| `src/components/PhotoGalleryDialog.jsx` | Full photo viewer with previous/next controls, keyboard navigation, thumbnails and close/focus behaviour. |
| `src/components/ui.jsx` | Shared visual primitives such as icons and buttons. |
| `src/data/gallery.js` | Original gallery image filenames, alternative text, captions, locations and featured-photo selection. |
| `src/context/SiteActions.jsx` | Shared actions for opening forms and certificates. |
| `src/hooks/useHashRoute.js`, `src/lib/routes.js` | Hash navigation, route lookup and page title labels. |
| `src/lib/formLogic.js` | Official form destinations, validation rules and WhatsApp message text. |
| `src/lib/assets.js` | Asset URL helper, used for root and subdirectory deployments. |
| `src/styles/styles.css` | Shared layout, colours and Home styling. |
| `src/styles/gallery.css` | Featured-photo composition and full-gallery viewer layout, including responsive rules. |
| `src/styles/home-coach.css` | Coach feature composition, image framing and responsive stacking. |
| `src/styles/football-footer.css` | Football landscape, readable footer content and responsive footer layout; markup is in `src/components/Footer.jsx`. |
| `src/styles/programme.css`, `coach.css`, `societies.css`, `forms.css` | Page and dialog layout styles. |
| `src/styles/typography.css` | Font registration and the shared font-size, line-height and weight system. |
| `public/assets/` | Local photographs, video, posters, certificates, font files and credit notices. |
| `tests/formLogic.test.js` | Tests for required fields, phone/age rules and WhatsApp draft generation. |
| `docs/DESIGN-SYSTEM.md` | Current typography, spacing, responsive rules and protection of the approved gallery. |
| `dist/` | Production output. Regenerate it after source edits; edit the source files above. |

### Keep typography consistent

**Plus Jakarta Sans** handles every text role, including the Home hero's final word, “together.” The hero uses **88/92px on desktop, 72/76px on tablet and 48/52px on mobile**, with 44/48px at widths of 380px and below. Section headings use **56/62px on desktop, 44/50px on tablet and 36/42px on mobile**. These values are font size / line height. All CTA labels remain **16/24px**, and image captions remain **14/21px**.

Use the shared tokens in `src/styles/typography.css`, including `--type-action` for CTA labels and `--type-caption` for image descriptions. The locally hosted variable font supports weights 200–800; hero text uses 800, section headings 700, and actions and card headings 600. Keep `font-synthesis: none`. The footer scene headline and small brand text use the 20/28px subheading role, and the coach introduction uses 18/28px. The full role and spacing reference is [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md).

To replace an image or video, place the new file in `public/assets/` and update its reference in the relevant page or media component. Keep the supplied asset URL helper when adding references. Check alternative text, captions and credits when replacing a file.

Fees and programme details are visible in page content and the enrollment panel. Update all displayed instances together when changing those business details.

## Home photo gallery

The “Learn. Play. Make friends.” section features **six original LetsAimIt photographs**. Visitors can open the full viewer to browse **all 23 images from the original website gallery**, using the previous/next buttons, Left/Right arrow keys or thumbnails. Escape or the close button returns them to the page.

All **29 source image assets** from the original website are bundled locally, including the gallery photographs and other website images. The gallery keeps the photos' captions and location context; business images, certificates and milestone pictures retain their original meaning.

Edit gallery entries and featured-photo selection in `src/data/gallery.js`, the section in `src/components/HomeGallery.jsx`, and its layout in `src/styles/gallery.css`. The full viewer uses `src/components/PhotoGalleryDialog.jsx`. Keep caption and CTA styling tied to the shared typography tokens: **14px captions and 16px text actions**.

The gallery composition, image selection and full-viewer behaviour are retained through the coach and footer update and the restoration of the previous typography. The verification history and recorded checks are in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Coach feature and football footer

`src/components/HomeCoach.jsx` presents the coach and young goalkeeper over a rounded dark-green backing, with two small lime labels. On mobile, the labels flow in a wrapping row below the photograph, and the copy appears first. Its `coach-and-player-cutout.png` asset is a background-removed derivative of the existing `Coach_Goalie_conversation_before_the_game.jpg` photograph. The original photo remains bundled. The copy and “Meet your coach” destination remain part of the existing four-page journey.

`src/components/Footer.jsx` and `src/styles/football-footer.css` place the generated `football-footer-scene.png` landscape above the footer links. This is decorative football artwork, not a photograph of the actual venue. The footer retains the free-trial action, page navigation, contact links, policy links and Back to top control.

The visible “Photos: LetsAimIt · Stock film: Marsel Sharipov” footer line and oversized footer wordmark remain removed. The footer uses a small brand label. Media provenance and font licenses remain included in the source package.

## Forms and external handoffs

The free trial form and two-step society enquiry form validate the visitor's entries, then open a prepared **WhatsApp draft**. The visitor reviews the message and presses Send in WhatsApp. The website does not send the message itself. An explicit **Open WhatsApp** link remains available after a valid submission.

Form drafts remain in React memory while the app is open, including when a panel is closed or a society visitor goes Back between steps. Reloading the page clears these drafts; they are not saved to a database or browser storage.

Enrollment opens the existing **Google Forms registration form**. The society enquiry panel also offers the existing Google Forms alternative. The coach confirms the batch and payment details; this codebase does not collect payments.

The destinations are collected in `FORM_LINKS` inside `src/lib/formLogic.js`:

| Action | Destination |
| --- | --- |
| WhatsApp | `https://wa.me/918868886074` |
| Child registration | `https://forms.gle/zNEWMbwzLcEiA3Ym8` |
| Society enquiry | `https://forms.gle/H6CmdvR8qxJ4UpVM9` |
| Privacy policy | `https://letsaimit.com/privacy-policy` |

There is no backend API, payment processor, authentication service or database included or required for these existing flows.

## Static deployment

### Vercel

The `letsaimit` Vercel project builds this repository with Node.js 24, `npm ci` and `npm run build`, then serves `dist/`. These build settings are recorded in `vercel.json`. The four hash routes work without server rewrites. Pushes to the connected `main` branch deploy to production; other branches receive preview deployments.

No environment variables are required. Vercel account metadata and pulled environment files under `.vercel/` are excluded from Git.

1. Run `npm ci` and `npm run build` if you have edited the source. The ZIP also includes a ready-built `dist/`.
2. Upload **the contents of `dist/`** to your static host's public directory. Include `index.html` and all asset folders/files together.
3. Open the deployed HTTP or HTTPS address and check the four hash routes.

For hosts that build from the source repository, use `npm run build` as the build command and `dist` as the output directory. The Vite configuration uses a relative base so the build can be served from a domain root or a subdirectory.

**Serve the site over HTTP or HTTPS.** Opening `dist/index.html` by double-clicking it creates a `file://` URL and is not a supported preview method for the JavaScript modules. `npm run preview` provides the local HTTP preview; use a static web host for the public site.

## Media, font credits and ownership

Keep the supplied notices with the assets:

- [Media sources and context](public/assets/MEDIA-CREDITS.md)
- [Plus Jakarta Sans font sources](public/assets/fonts/FONT-SOURCES.md)
- [Plus Jakarta Sans SIL Open Font License](public/assets/fonts/Plus-Jakarta-Sans-OFL.txt)
- [Original font history](public/assets/fonts/Plus-Jakarta-Sans-FONTLOG.txt)

The media notice identifies the stock football footage and the original LetsAimIt business assets. Preserve its attribution and context when reusing or replacing media. LetsAimIt branding, business photographs and certificates retain their original ownership and usage rights; their inclusion in this export does not place them under an open-source license. The included font licenses apply to the fonts, not to the site's business assets.
