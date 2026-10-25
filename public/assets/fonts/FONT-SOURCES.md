# LetsAimIt typography: Plus Jakarta Sans

The website uses one locally hosted family: **Plus Jakarta Sans**, upright variable font.

## Delivered files

- `plus-jakarta-sans-variable.woff2` — 47,556 bytes (approximately 46.4 KiB).
- `Plus-Jakarta-Sans-OFL.txt` — original SIL Open Font License 1.1.
- `Plus-Jakarta-Sans-FONTLOG.txt` — original upstream font history.

## Official sources

- Google Fonts font binary: https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf
- Google Fonts metadata: https://github.com/google/fonts/blob/main/ofl/plusjakartasans/METADATA.pb
- License: https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/OFL.txt
- Author project: https://github.com/tokotype/PlusJakartaSans
- Font history: https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/FONTLOG.txt

Downloaded and prepared on 25 October 2026. The source file reports version `2.071;gftools[0.9.30]`.

## Variable range and glyph verification

The font retains its `wght` axis from **200 to 800**, default **400**. It has no optical-size or custom axes. Use `font-weight` for all weights; no custom `font-variation-settings` are required.

The delivered WOFF2 was reopened with fontTools and its cmap checked. The following are present: rupee `₹` (U+20B9), curly single quotes `‘ ’` (U+2018/U+2019), curly double quotes `“ ”` (U+201C/U+201D), en dash `–` (U+2013), and em dash `—` (U+2014).

The official TrueType font was subset to Basic Latin, Latin Extended, Latin Additional, punctuation, currencies and supported symbols, then compressed to WOFF2. Original layout features and the complete variable weight range were preserved. No runtime external font request is required.

`verification.json` records the source/output SHA-256 hashes, exact byte size, glyph checks and axis range. The original TTF and downloaded metadata are retained in the preparation directory for reproducibility; they do not need to ship with the website.

## CSS registration

```css
@font-face {
  font-family: 'Plus Jakarta Sans';
  src: url('assets/fonts/plus-jakarta-sans-variable.woff2') format('woff2');
  font-style: normal;
  font-weight: 200 800;
  font-display: swap;
}
```
