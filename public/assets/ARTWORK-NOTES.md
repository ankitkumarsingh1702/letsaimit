# Football footer artwork

- Final asset: `football-footer-scene.png`
- Dimensions: 2172 × 724, RGB PNG (3:1).
- Created with the built-in image generation tool. This is original decorative illustration, not documentary photography of LetsAimIt participants or venue.
- Reference inspiration: uploaded `image(20261025-142740).png`; layered green scenery merging into footer. The reference was inspected for art direction; no reference interface, text or logos were copied into the generated artwork.
- Integration: use empty alt/aria-hidden for the decorative background; keep real heading, buttons and links as HTML. The center contains the main pass and goal for narrow crops. The lower edge is near forest green but is not a mathematically uniform `#143e35`; apply a CSS fade in the bottom 15–20% to join the solid footer without a seam.

## Generation prompt

Use case: illustration-story. Asset type: finished panoramic website footer background, 2304 × 768 pixels (3:1 ratio), no interface, NO TEXT, no lettering, no logos, no watermarks. Create an elegant, atmospheric layered landscape illustration of a community children's football pitch. Restrained tonal forest-green palette: dark #143e35 foreground, medium #2e6b54 tree layers, muted #78a97a distant field/sky, tiny soft lime #c5f66b accent on one ball only. It should feel like a premium editorial landscape whose scenery melts into a green website footer. Several small believable silhouettes of children playing football, one child passing and another receiving, a single ball, one clearly recognisable football goal with understated net, distant community trees, subtle field markings. Keep the main passing action and goal within the central third, so a narrow mobile crop still communicates football. Secondary trees can frame the far edges. Top third mostly quiet smooth muted-green sky for later HTML heading placement; this asset itself contains NO typography. Bottom 15 percent must settle into a FLAT, UNIFORM dark green #143e35 band across its entire width, no objects or textures touching the bottom edge, to blend seamlessly into an HTML footer. Layered silhouettes, graceful soft atmospheric depth, natural human proportions and poses, sparse and refined. No photorealistic stock photograph, no 3D, no glossy effects, no outlined cartoon people, no floating balls, no mountain fantasy, no decorative UI panels. Completely original football scenery.


# Coach image background removal

- Final asset: `coach-and-player-cutout.png`, 1448 × 1086 RGBA.
- Method: built-in image generation, background-extraction mode, with the original coach/goalkeeper photograph as the sole edit target and transparent background enabled.
- The original photograph is retained unchanged. CSS crops the transparent canvas around the two people using a 466 × 780 window beginning at (522,306). No raster editing was performed after generation.

## Selected extraction prompt

BACKGROUND REMOVAL ONLY. Preserve the source photograph's original 1600×1200 landscape canvas, original scale, framing, resolution, and exact positions of the two foreground people. Do NOT zoom in, reframe, sharpen, upscale, reconstruct, beautify, redraw, or reinterpret either person. Output must be the same original image pixels for Coach Dhiraj and the goalkeeper, with everything outside their silhouettes made transparent. Keep their actual photographed low-resolution face and hair details exactly; do not create a clearer face. Keep the complete full-length figures with the goalkeeper on left, coach on right, their original orange shirts, SHAURYA 19 lettering, grey trousers, shorts, socks, shoes, clipboard and hands. Make all field, grass, sky, distant persons and structures fully transparent. Preserve transparent gaps between arms, legs and bodies. This is a precise photographic masking operation, not a new image or portrait. No shadows, no glow, no blur halo, no additional background. Fully transparent alpha background on the original landscape canvas.

The requested invariants in the prompt are not a guarantee of pixel-level preservation; the delivered derivative was reviewed visually.
