# Export verification

Verified on 4 November 2026 against the current approved website (published version 8).

## Build and assets

- Dependency installation completed with the included package manifest and lockfile.
- `npm run build` completed successfully with React 19.3.1 and Vite 8.3.5.
- `npm run verify:assets` verified all 54 local asset files, totaling 19,573,506 bytes, against the current published originals.
- Readability cleanup retained the same generated production JavaScript and CSS hashes as the first reconstructed build.
- The production build contains all local images, video, fonts and license/source files.

## Browser comparison

Compared the rebuilt export with an isolated copy of the approved published output.

- All six routes rendered: Home, Programme, Coach, Societies, Schools and Events.
- Page content and measured layout matched at desktop and phone widths (1440px and 390px iframe viewports).
- No horizontal overflow was observed in those page comparisons.
- Phone navigation opened and closed, with all six destinations available.
- The free-trial dialog opened, and submitting empty fields showed the expected local validation errors.
- Parent story cards opened the full approved testimonial.
- The gallery opened with all 23 photos, and next-photo navigation worked.
- The Safe Soccer certificate viewer opened the correct local image.
- No application console errors were observed. Browser-extension messages were excluded.

Animation timing and film playback state were excluded from content/layout comparisons. Closed-form validation text can remain in the DOM after interaction; clean-state page comparisons were used where needed.

No messages, registrations or enquiries were sent during verification. External links keep their existing destinations; their receiving services were not modified or tested through submission.
