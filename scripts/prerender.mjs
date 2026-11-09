#!/usr/bin/env node
/** Build real route documents so link-preview crawlers need no JavaScript. */
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist");
const serverOutput = resolve(root, ".ssr");
try {
await build({
  root,
  configFile: resolve(root, "vite.config.js"),
  build: { ssr: "src/entry-server.jsx", outDir: serverOutput, emptyOutDir: true, copyPublicDir: false },
});
const { render, PAGE_META, SITE_ORIGIN } = await import(pathToFileURL(resolve(root, ".ssr/entry-server.js")).href);
const origin = new URL(SITE_ORIGIN);
if (origin.protocol !== "https:" || origin.origin !== SITE_ORIGIN) {
  throw new Error("VITE_SITE_ORIGIN must be a complete HTTPS origin, without a path, query or trailing slash.");
}
const template = await readFile(resolve(output, "index.html"), "utf8");
const headMarker = /<!-- SITE_META_START -->[\s\S]*?<!-- SITE_META_END -->/;
const rootMarker = /<div\s+id="root"\s*><\/div>/;
if (!headMarker.test(template) || !rootMarker.test(template)) {
  throw new Error("The built HTML is missing its metadata or root placeholder.");
}

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const shareImage = `${SITE_ORIGIN}/assets/share-letsaimit-1200x630.png`;
const imageAlt = "LetsAimIt. Sport, close to home. Football, basketball and fitness. First session free.";

function metadata(page, details) {
  const title = `${details.title} — LetsAimIt`;
  const url = `${SITE_ORIGIN}${details.path}`;
  return [
    "<!-- SITE_META_START -->",
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(details.description)}" />`,
    `<link rel="canonical" href="${escape(url)}" />`,
    `<meta name="robots" content="${["notfound", "admin", "signin"].includes(page) ? "noindex, follow" : "index, follow, max-image-preview:large"}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="LetsAimIt" />',
    '<meta property="og:locale" content="en_IN" />',
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(details.description)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    `<meta property="og:image" content="${escape(shareImage)}" />`,
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escape(imageAlt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escape(title)}" />`,
    `<meta name="twitter:description" content="${escape(details.description)}" />`,
    `<meta name="twitter:image" content="${escape(shareImage)}" />`,
    `<meta name="twitter:image:alt" content="${escape(imageAlt)}" />`,
    "<!-- SITE_META_END -->",
  ].join("\n    ");
}

const routes = [];
for (const [page, details] of Object.entries(PAGE_META)) {
  if (!/^\/(?:[a-z0-9-]+\/)?$/.test(details.path)) throw new Error(`Unsupported route path: ${details.path}`);
  const body = render(page);
  if (!body || !/<h1\b/.test(body)) throw new Error(`No rendered page heading for ${page}.`);
  const html = template
    .replace(headMarker, metadata(page, details))
    .replace(rootMarker, () => `<div id="root" data-prerender-page="${escape(page)}">${body}</div>`)
    .replace(/<body>/, `<body data-page="${escape(page)}">`);
  const target = resolve(output, "." + details.path, "index.html");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
  if (page === "notfound") await writeFile(resolve(output, "404.html"), html);
  routes.push({ page, path: details.path, file: target.slice(output.length + 1), htmlBytes: Buffer.byteLength(html) });
}

// Only build metadata is published here; no responses, account data or credentials.
await writeFile(resolve(output, "route-manifest.json"), JSON.stringify({ origin: SITE_ORIGIN, routes }, null, 2) + "\n");
console.log(`Prerendered ${routes.length} route documents and 404.html with page-specific share metadata.`);
for (const { path, htmlBytes } of routes) console.log(`${path} ${htmlBytes.toLocaleString("en-IN")} bytes`);
} finally {
  // This server bundle is a build-time helper, never part of the public Site.
  await rm(serverOutput, { recursive: true, force: true });
}
