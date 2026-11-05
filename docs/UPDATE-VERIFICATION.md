# Update verification — 5 November 2026

## Floating socials — 5 November 2026

- Added a scroll-revealed **Socials** pill across the shared site shell. It appears after one viewport and stays fixed below the header: 24px from the desktop right edge, 16px on phones.
- Includes the supplied LinkedIn profile, LetsAimIt Instagram, WhatsApp contact and `tel:+918868886074`. External profiles open in a new tab with safe link attributes; no message or call is sent automatically.
- Reuses Plus Jakarta Sans, forest green, lime, rounded surfaces and short fade/slide motion. Reduced-motion styles remove the new animation.
- Browser-checked initial hiding, scroll reveal, tap and keyboard opening, Tab into links, Escape with focus return, outside tap, focus leaving, route reset, mobile menu suspension and enquiry-modal priority.
- Checked 320px and 390px phone frames (305px and 375px document widths with scrollbars). No page overflow; expanded panel stays inside the viewport. Each link is at least 56px high. Desktop dock stays 104px from the top while scrolling; phones use 88px with the existing header.
- Verified all four destination attributes without sending a message, making a call or signing into a social account. Prepared analytics remains inactive and reuses its existing delegated WhatsApp/Call handling.
- Production build and prerender succeeded. Temporary preview files were removed. No backend code, API configuration or dependencies were changed.

Design references reviewed: [Floating Social Menu](https://www.framer.com/marketplace/components/floating-social-menu/) and [vertical floating social icons on Dribbble](https://dribbble.com/shots/15972671-Squarespace-Website-Template). The component is implemented in the existing React/CSS codebase; no reference code or imagery was copied.

## Footer and programme refinement — 5 November 2026

- Footer contact address is now exactly **Nambiar Ellegenza, Bengaluru**; the phone remains **+91 88688 86074**. Coaching locations elsewhere still include both confirmed communities.
- Footer navigation, headings, contact links and Back to top share Plus Jakarta Sans at the existing 14px / 21px navigation scale. The address uses the same size with normal weight; the scene CTA retains its existing treatment.
- Current programme eligibility is **5–14**, including the Home card, Programme FAQ, Terms, share descriptions, enquiry choices, validation and prepared Google integration.
- The community-count card is replaced by **Free / First session**. Numeric community-count marketing is removed from Programme and Societies. Two sessions each week and 45–60 minutes per session are unchanged.
- Browser-checked desktop and 320px/390px phone frames (305px/375px document widths with scrollbars). Cards and footer fit without horizontal overflow; computed footer link sizes are consistently 14px. Selecting age14 in the trial form succeeds. No enquiry was submitted.
- Production build and prerender completed successfully. Temporary preview files were removed before packaging.

## Baseline

This update starts from the reconciled React source for the approved public version 8, not the older scaffold previously in the Site repository. The original logo, Plus Jakarta Sans, forest/lime palette, page layouts, parent-story card wall and multisport footer are retained.

## Implemented and checked

- Owner-confirmed basketball at both correctly spelled communities; first session free; no public price.
- Useful short FAQ answers, with precise schedules still pending.
- Dedicated society fields: society, locality, contact role, estimated children and available space.
- Parent/guardian consent; adult contact consent on society/school enquiries; enrolment terms acceptance.
- Three internal policies matching the site shell, with strict voluntary-withdrawal rules and mandatory legal exceptions.
- Frisco, Texas wording; Salesforce experience confined to school consultancy copy.
- Events remain honest about unconfirmed details; WhatsApp handoff text is explicit.
- Nine content pages plus 404, prerendered with one H1 and route-specific canonical/OG/Twitter metadata.
- Old hash links preserved; unknown routes use the NotFound component without hydrating unrelated Home markup.
- 1200×630 share image and compact favicon set.
- All eight testimonial records byte-identical to the approved source.
- All original source assets verified against their manifest; responsive variants checked for dimensions and hashes.
- Film reduced from 6,697,054 to 1,613,989 bytes, preserving 12 seconds and 1280×720. No video URL is assigned before Play.
- The closed gallery does not mount its image or thumbnail rail. Thumbnail alt text is descriptive; truly decorative footer art has empty alt.

## Browser checks

Production output was served through the managed preview. Desktop and phone layouts were inspected, including 390px and 320px frames (375/305px content width with the browser scrollbar). Checked navigation, the sticky header, required-field errors, guardian/adult consent, society's two steps, gallery next/close, full parent stories, story-rail navigation, tap-to-play, planned-event anchor navigation, internal policies, unknown routes and old hash links.

No horizontal page overflow was observed in the inspected phone layouts. Header remained at the top after scrolling. Playing the film loaded the optimised MP4 successfully, with no media error. No application JavaScript errors were observed; browser extension messages are separate.

### Initial Home payload

Before scrolling, playing video or opening the gallery, the inspected phone frame requested six resources plus its document. Resource Timing reported 419,647 encoded body bytes and 801,236 decoded body bytes. No MP4 request occurred. The browser cache was warm, so its actual transferred-byte counter is not a cold-network benchmark. These measurements support an initial resource payload comfortably below 3 MB; they are not a Lighthouse score or a promise for every device/network. The small final form fixes can change the bundle by a few kilobytes.

## Google capture — not live yet

Apps Script backend and React integration are ready, but there is no owner-deployed `/exec` URL. The available Google connection could not edit the existing forms and the browser was signed out. No real Google submission or response-Sheet link was verified.

Offline contract checks cover trial/enrolment/society/school, age-outside-range trial enquiries, required current consent, guardian declaration, enrolment terms, phone formatting, formula escaping, idempotency, changed-payload conflicts and failed saves. These checks do not replace the final live browser → Sheet test.

The current public build accurately retains WhatsApp handoff and the existing Google registration link. It does not show a saved confirmation without a readable matching acknowledgement. Saving, failure and retry handling are prepared for activation. The existing society Google Form requires sign-in; the site's dedicated society form avoids sending visitors there.

## Analytics — not active

Manual conversion hooks and consent controls are present, but no GA4 ID is configured. Activation also requires confirming automatic Enhanced Measurement is off, to avoid sending form or WhatsApp URL details. No private information is sent to analytics.

## Remaining owner inputs

1. A Google account/session with permission to deploy the prepared script, or the deployed `/exec` URL.
2. Exact current batch times, when ready.
3. Confirmed August/October recap facts and December venue/time, when ready.
4. GA4 measurement ID, if desired.

A host-level 404 status is distinct from the included 404 UI/document and must be checked on the published host.
