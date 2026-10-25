# LetsAimIt — React codebase

A complete React + Vite export of the approved four-page LetsAimIt website. The pages, forms, navigation and media controls are implemented as React components. The approved layout, colours, wording, responsive styles and locally hosted **Plus Jakarta Sans** font are preserved.

The ZIP includes the editable source, a dependency lockfile, local image/video/font assets and a prebuilt `dist/` folder. `node_modules/` is intentionally excluded; install dependencies with `npm ci`.

## Quick start

Use **Node.js 22.12 or newer** and npm. **Node.js 24 is recommended** and matches the verified runtime used for this export.

Extract the ZIP, open a terminal in the `letsaimit-react` folder, then run:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

**No `.env` file, API key, database or backend service is needed.** The first dependency installation requires an internet connection. The website's images, video and font are bundled locally; WhatsApp and Google Forms open their own external websites when a visitor chooses those actions.

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
| `src/components/ui.jsx` | Shared visual primitives such as icons and buttons. |
| `src/context/SiteActions.jsx` | Shared actions for opening forms and certificates. |
| `src/hooks/useHashRoute.js`, `src/lib/routes.js` | Hash navigation, route lookup and page title labels. |
| `src/lib/formLogic.js` | Official form destinations, validation rules and WhatsApp message text. |
| `src/lib/assets.js` | Asset URL helper, used for root and subdirectory deployments. |
| `src/styles/styles.css` | Shared layout, colours and Home styling. |
| `src/styles/programme.css`, `coach.css`, `societies.css`, `forms.css` | Page and dialog layout styles. |
| `src/styles/typography.css` | Font registration and the shared font-size, line-height and weight system. |
| `public/assets/` | Local photographs, video, posters, certificates, font files and credit notices. |
| `tests/formLogic.test.js` | Tests for required fields, phone/age rules and WhatsApp draft generation. |
| `dist/` | Production output. Regenerate it after source edits; edit the source files above. |

### Keep typography consistent

The entire site uses the bundled Plus Jakarta Sans variable font. Update the shared tokens in `src/styles/typography.css` when changing the type scale, including `--type-action` for CTA labels and `--type-caption` for image descriptions. This keeps matching roles at matching sizes across all four pages and dialogs.

To replace an image or video, place the new file in `public/assets/` and update its reference in the relevant page or media component. Keep the supplied asset URL helper when adding references. Check alternative text, captions and credits when replacing a file.

Fees and programme details are visible in page content and the enrollment panel. Update all displayed instances together when changing those business details.

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

The media notice identifies the stock football footage and the original LetsAimIt business assets. Preserve its attribution and context when reusing or replacing media. LetsAimIt branding, business photographs and certificates retain their original ownership and usage rights; their inclusion in this export does not place them under an open-source license. The font's included license applies to the font, not to the site's business assets.
