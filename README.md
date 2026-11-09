# LetsAimIt — React website

The updated website, with all editable React source, shared header/footer, approved content and local assets.

**Public review site:** https://letsaimit-review.one92843.chatgpt.site/

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Create and inspect the production build:

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` at your domain root. The production build contains real HTML for each page and hydrates it with React. It does not require a React server at runtime. Keep directory-index routing and configure unknown URLs to serve `404.html` with HTTP 404 where supported by the host.

## Included

- Home, Programme, Coach, Societies, Schools and Events.
- Internal Privacy, Terms, and Fees & refunds pages.
- A page-not-found view; old `/#/…` links remain compatible.
- Shared responsive header, mobile menu and multisport footer.
- A floating Socials disclosure with LinkedIn, Instagram, WhatsApp and Call links.
- Eight approved Frisco parent stories with card browsing, native touch scrolling, keyboard controls and full-story dialogs. No parent portraits are invented.
- Twenty-three gallery photos, four coaching credentials and all original bundled media.
- Responsive WebP photographs, small gallery thumbnails and a 1.61 MB video that loads only after Play.
- Page-specific Open Graph/Twitter metadata, canonical URLs and a 1200×630 share image.
- SVG, 32px and 180px favicon assets.
- Trial, enrolment, society and school enquiry UI with consent and clear delivery states.
- A free Google Apps Script integration, plus optional native Google Forms setup linked to a private workbook.

## Floating socials

The **Socials** pill appears after the first screen of scrolling and stays at the upper right, below the sticky header. Tap or click to open the four labelled links. Escape, an outside tap or moving keyboard focus away closes the panel. It hides while the mobile navigation is open, and native enquiry/photo dialogs take priority. Reduced-motion settings remove the new animation.

Edit the destinations in `SOCIAL_LINKS` in `src/components/SocialDock.jsx`; styling is in `src/styles/social-dock.css`. These are ordinary profile/contact links, with no new API, server or animation dependency. Backend implementation remains with the site owner; this update changes only the front end.

## Confirmed content

Basketball is available at **Nambiar Ellegenza** and **Nambiar Bellezea**, Bengaluru. The site retains the established football programme and describes fitness as part of the activities. Ages are 5–14. The first session is free. Public prices are omitted.

Paid enrolment is non-refundable for voluntary withdrawal or missed sessions, including leaving after one, two or three sessions. Provider cancellations, verified payment errors and legally required remedies are covered separately in the internal policies. Have the operational policy reviewed before relying on it for paid enrolments.

School services remain consultancy for the school's existing PE team. Salesforce experience appears on the Schools page. The coaching story consistently uses Frisco, Texas.

## What is connected now

On **UAT**, parents request a trial or enrol inside the React site. Supabase validates and saves each submission before the site shows confirmation. WhatsApp is an optional next step. Retries reuse a submission ID; editing answers starts a new request. Parent email addresses may repeat for siblings.

Invited Gmail admins sign in at [uat.letsaimit.com/admin/](https://uat.letsaimit.com/admin/) to use the live register, edit follow-up details, manage access and download saved rows as CSV. Google provides admin identity; parent submissions are stored in Supabase, not Google Forms or Sheets. The separate `letsaimit-uat-health` Vercel project tracks `uat` and runs the database health schedule.

See [registration deployment and verification](README-SHEET-DEPLOYMENT.md) for the database migrations, Google OAuth configuration, environment variables, access controls, scheduler and observed checks. The production website at `letsaimit.com` remains on its separate release path.

Society and school enquiries retain their existing WhatsApp handoff while `VITE_LEAD_ENDPOINT` is blank. Their optional historical Apps Script integration remains documented in [integrations/google-sheets/README.md](integrations/google-sheets/README.md); parent registration does not use it. No registration responses are stored in browser local storage.

## Configuration

Copy `.env.example` to `.env.local` if changing configuration. These are public build-time settings, not secrets.

| Variable | Purpose |
| --- | --- |
| `VITE_SITE_ORIGIN` | Canonical HTTPS origin. Defaults to the current ChatGPT.site URL. Use `https://letsaimit.com` when deploying there. |
| `VITE_LEAD_ENDPOINT` | Optional legacy school/society Apps Script URL; blank for their WhatsApp handoff. |
| `VITE_SUPABASE_URL` | Public Supabase project URL for the intended environment. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase key; private access is enforced by database rules. |
| `VITE_SUPABASE_ANON_KEY` | Optional legacy public-key fallback. |
| `VITE_GA4_ID` | Optional GA4 measurement ID. Blank; analytics are not active. |
| `VITE_GA4_MANUAL_EVENTS_ONLY_CONFIRMED` | Set `true` only after disabling automatic Enhanced Measurement and user-provided data collection in the GA4 stream. |

Before enabling GA4, disable automatic outbound-link and form events. Those automatic events can otherwise include a pre-filled WhatsApp URL. The manual events contain only the page and form category; never names, phone numbers, children’s details, messages or full WhatsApp URLs. Analytics loads only after explicit visitor consent; the site and forms work when it is declined.

Prepared events: `free_trial_click`, `enrol_click`, `whatsapp_click`, `call_click`, `society_enquiry_click`, `school_enquiry_click`, and `lead_saved`. Only a newly acknowledged, saved row fires `lead_saved`; a WhatsApp click is not a saved lead or a sent message.

## Content still awaiting owner details

- Exact days and start times by community and age group.
- The August/October match dates, attendance figures, age groups and highlights. Supplied photos remain in the undated Ellegenza Match Day recap.
- Venue, time and age brackets for the planned **3 December 2026** match day.
- GA4 measurement ID, if tracking should be enabled.

The website does not invent those details. The December event remains marked Planned.

## Source map

```text
src/
  App.jsx                  Shared shell and page registry
  components/              Header, footer, dialogs, gallery and film players
  pages/                   Home, programme, coach, societies, policies and 404
  features/schools/        Consultancy page and school enquiry
  features/events/         Planned and past match content
  features/stories/        Approved parent stories and founder profile
  lib/                     Routes, media, lead delivery and analytics
  data/                    Gallery and generated media manifest
  styles/                  Established design and responsive refinements
public/assets/             Originals, optimised media, fonts and licenses
integrations/google-sheets/Code.gs
scripts/                   Build, prerendering, media and asset verification
```

`public/assets/` retains all source originals. The final build removes superseded original images/video from `dist/` after checking the rendered HTML and CSS use their optimised replacements. Certificates, footer art, fonts and source/license records are retained.

Run `npm run verify:assets` to check the 54 original assets against the prior approved snapshot. `src/data/media-manifest.json` records the generated derivatives and their hashes. Python and ffmpeg are needed only to regenerate media; they are not needed for the normal React build.

## Supporting notes

- [Sharing and deployment](docs/SHARING-DEPLOYMENT.md)
- [Native registration and private register](README-SHEET-DEPLOYMENT.md)
- [Optional school/society capture](integrations/google-sheets/README.md)
- [Policy sources and assumptions](docs/POLICY-SOURCES.md)
- [Update verification and remaining dependencies](docs/UPDATE-VERIFICATION.md)

The ZIP contains no credentials, private form responses, customer CSV files, Git metadata or hosting account identity. Source and build are included together for handoff.

## UAT deployment

Push a verified merge to `uat` to trigger a Vercel Preview deployment at [uat.letsaimit.com](https://uat.letsaimit.com). The Vercel build uses the UAT origin for canonical and share URLs on this branch. Run `npm test`, `npm run verify:assets`, and `npm run build` before merging. Production uses a separate release path.
