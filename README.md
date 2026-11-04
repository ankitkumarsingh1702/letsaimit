# LetsAimIt — complete React website

The current six-page website as an editable React project. Includes the shared header and footer, responsive styles, eight parent stories, events, school consultancy, enquiries, gallery and all local media.

## Run locally

Use Node.js **22.12 or later** and npm.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. The project uses React 19.3.1 and Vite 8.3.5, with pinned dependencies in `package-lock.json`.

## Build and preview

```bash
npm run build
npm run preview
```

`dist/` is the production website. A tested build is already included. Upload the contents of that folder to a static web host, or run the preview command after installing dependencies. Use a web server rather than opening `index.html` with a `file://` URL.

The site uses hash routes, so a static host does not need route-rewrite rules. Relative build paths support hosting at a domain root or a subdirectory.

## Where to edit

| Area | Source |
| --- | --- |
| App, page routing and shared dialogs | `src/App.jsx` |
| Shared header and menu | `src/components/Header.jsx` |
| Shared footer and multisport artwork | `src/components/Footer.jsx` |
| Home | `src/pages/Home.jsx` |
| Programme | `src/pages/Programme.jsx` |
| Meet the coach | `src/pages/Coach.jsx` |
| For societies | `src/pages/Societies.jsx` |
| For schools and school enquiry | `src/features/schools/` |
| Events | `src/features/events/EventsPage.js` |
| Parent story cards and swipe controls | `src/features/stories/ParentStories.js` |
| All eight approved testimonials | `src/features/stories/testimonials.js` |
| Founder and adviser story | `src/features/stories/CoachStory.js` |
| Trial, society and enrollment dialogs | `src/components/ContactDialog.jsx` |
| Form validation and external form links | `src/lib/formLogic.js` |
| Photo gallery data | `src/data/gallery.js` |
| Main styles and responsive overrides | `src/styles/` |
| All images, video, fonts and credits | `public/assets/` |

The newer feature modules use React's `createElement` syntax and export standard React components. The other pages use JSX. Both are editable source and are built together by Vite; no retained minified application bundle is needed to rebuild the site.

## Pages

- Home: `#/`
- Programme: `#/programme`
- Meet the coach: `#/coach`
- For societies: `#/societies`
- For schools: `#/schools`
- Events: `#/events`

## Assets

All 54 original bundled asset files are included: 39 images, one MP4, five font files, and nine credit, source and license files. This includes the original logo, 23 gallery photos, five event photos, four certificates, desktop and phone footer artwork, and the self-hosted Plus Jakarta Sans font.

The site renders without an external image, video, font or icon service. WhatsApp, Google Forms, Instagram and policy links keep their existing external destinations. No backend, database or API key is required. Enquiry handoffs work as in the published website and do not silently send messages.

Check asset integrity with:

```bash
npm run verify:assets
```

`docs/ASSET-MANIFEST.json` records the original file hashes. Font licenses and media credits are included with the assets. Additional image and testimonial provenance is in `docs/`.

## Export notes

This source was reconciled with the approved published version 8 on 4 November 2026. It preserves the current design, wording, navigation, responsive layout and interactions, including removal of public pricing, both active communities, the school and event pages, the testimonial card wall and multisport footer.

The older supplied React source had diverged from the approved site. This package restores the current application into named source modules and includes the current feature modules and exact media. It does not depend on that older source or on the original bundle-patching scripts.

`node_modules` and machine-specific hosting/authentication files are intentionally excluded. Run `npm ci` to install dependencies. See `docs/EXPORT-VERIFICATION.md` for the checks completed on this package.

## UAT deployment

Merge changes into the `uat` branch to deploy automatically to [uat.letsaimit.com](https://uat.letsaimit.com). Vercel builds with `npm ci` and `npm run build`, serving `dist/` as configured in `vercel.json`.

Run `npm test`, `npm run verify:assets`, and `npm run build` before merging. The local `git deploy-uat` alias can retrigger the Preview deployment from a clean, up-to-date `uat` checkout. Production uses a separate release path.
