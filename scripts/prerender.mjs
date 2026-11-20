#!/usr/bin/env node
/** Build initial HTML and discovery documents from the same public route inventory. */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
import { buildDiscovery, contentHash, escapeXml, findElements, mainMarkdown, markdownPath, parseHtml, readBaseline, routeOutputFile, sourceLastmod, validateOrigin, validateRoutePath } from './discovery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const serverOutput = resolve(root, '.ssr');

try {
  await build({
    root,
    configFile: resolve(root, 'vite.config.js'),
    build: { ssr: 'src/entry-server.jsx', outDir: serverOutput, emptyOutDir: true, copyPublicDir: false },
  });
  const { render, PAGE_META, SITE_ORIGIN, PUBLIC_PAGES, isIndexablePage, robotsForPage, buildPageGraph, serializeJsonLd, pageSocialMeta } = await import(pathToFileURL(resolve(serverOutput, 'entry-server.js')).href);
  validateOrigin(SITE_ORIGIN);
  const template = await readFile(resolve(output, 'index.html'), 'utf8');
  const headMarker = /<!-- SITE_META_START -->[\s\S]*?<!-- SITE_META_END -->/;
  const rootMarker = /<div\s+id="root"\s*><\/div>/;
  if (!headMarker.test(template) || !rootMarker.test(template)) throw new Error('The built HTML is missing its metadata or root placeholder.');

  const baseline = await readBaseline(resolve(root, 'deployment/discovery-baseline.json'));
  const rendered = new Map(Object.entries(PAGE_META).map(([page]) => [page, render(page)]));
  const publicPages = PUBLIC_PAGES.map(details => {
    validateRoutePath(details.path);
    const url = SITE_ORIGIN + details.path;
    const markdown = mainMarkdown(rendered.get(details.page), url);
    const graph = buildPageGraph(details.page, { origin: SITE_ORIGIN });
    const hash = contentHash({ ...details, markdown, graph }, SITE_ORIGIN);
    const lastmod = sourceLastmod({ root, page: details.page, path: details.path, hash, baseline, sources: details.sources });
    return { ...details, url, markdown, contentHash: hash, lastmod, markdownPath: markdownPath(details.path), indexable: isIndexablePage(details.page, SITE_ORIGIN) };
  });
  const publicByPage = new Map(publicPages.map(page => [page.page, page]));
  function metadata(page, details) {
    const title = `${details.title} — LetsAimIt`;
    const url = SITE_ORIGIN + details.path;
    const publicPage = publicByPage.get(page);
    const graph = buildPageGraph(page, { origin: SITE_ORIGIN, dateModified: publicPage?.lastmod });
    const social = pageSocialMeta(page, { origin: SITE_ORIGIN, dateModified: publicPage?.lastmod });
    const poster = page === 'home' ? findElements(parseHtml(rendered.get(page)), node => node.tag === 'video')[0]?.attributes.poster : null;
    // Match the rendered poster request on aliases and local previews too.
    const homePoster = poster || null;
    return [
      '<!-- SITE_META_START -->',
      `<title>${escapeXml(title)}</title>`,
      `<meta name="description" content="${escapeXml(details.description)}" />`,
      `<link rel="canonical" href="${escapeXml(url)}" />`,
      `<meta name="robots" content="${robotsForPage(page, SITE_ORIGIN)}" />`,
      `<meta property="og:type" content="${social.type}" />`,
      '<meta property="og:site_name" content="LetsAimIt" />',
      '<meta property="og:locale" content="en_IN" />',
      `<meta property="og:title" content="${escapeXml(title)}" />`,
      `<meta property="og:description" content="${escapeXml(details.description)}" />`,
      `<meta property="og:url" content="${escapeXml(url)}" />`,
      `<meta property="og:image" content="${escapeXml(social.image.url)}" />`,
      `<meta property="og:image:type" content="${social.image.type}" />`,
      `<meta property="og:image:width" content="${social.image.width}" />`,
      `<meta property="og:image:height" content="${social.image.height}" />`,
      `<meta property="og:image:alt" content="${escapeXml(social.image.alt)}" />`,
      ...(social.article ? [
        `<meta property="article:published_time" content="${social.article.publishedTime}" />`,
        ...(social.article.modifiedTime ? [`<meta property="article:modified_time" content="${social.article.modifiedTime}" />`] : []),
        `<meta property="article:author" content="${escapeXml(social.article.author)}" />`,
      ] : []),
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${escapeXml(title)}" />`,
      `<meta name="twitter:description" content="${escapeXml(details.description)}" />`,
      `<meta name="twitter:image" content="${escapeXml(social.image.url)}" />`,
      `<meta name="twitter:image:alt" content="${escapeXml(social.image.alt)}" />`,
      ...(publicPage ? [
        `<link rel="alternate" type="text/markdown" href="${escapeXml(SITE_ORIGIN + publicPage.markdownPath)}" />`,
        `<link rel="describedby" type="text/plain" href="${SITE_ORIGIN}/llms.txt" />`,
      ] : []),
      ...(homePoster ? [`<link rel="preload" as="image" fetchpriority="high" href="${escapeXml(homePoster)}" />`] : []),
      `<script id="site-schema" type="application/ld+json">${serializeJsonLd(graph)}</script>`,
      '<!-- SITE_META_END -->',
    ].join('\n    ');
  }

  const routes = [];
  const publicDocuments = new Map();
  for (const [page, details] of Object.entries(PAGE_META)) {
    validateRoutePath(details.path);
    const body = rendered.get(page);
    if (!body || !/<h1\b/.test(body)) throw new Error(`No rendered page heading for ${page}.`);
    const html = template
      .replace(headMarker, () => metadata(page, details))
      .replace(rootMarker, () => `<div id="root" data-prerender-page="${escapeXml(page)}">${body}</div>`)
      .replace(/<body>/, `<body data-page="${escapeXml(page)}">`);
    // An explicit /404/index.html would return 200 on static hosting. Only
    // publish the platform's error document so /404/ remains a genuine 404.
    const file = routeOutputFile(page, details.path);
    const target = resolve(output, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
    if (publicByPage.has(page)) publicDocuments.set(details.path, html);
    routes.push({ page, path: details.path, file, htmlBytes: Buffer.byteLength(html) });
  }

  const discovery = buildDiscovery({ pages: publicPages, documents: publicDocuments, origin: SITE_ORIGIN });
  const files = [
    ['sitemap.xml', discovery.sitemap], ['robots.txt', discovery.robots],
    ['llms.txt', discovery.llms], ['llms-full.txt', discovery.full],
    ['discovery-manifest.json', JSON.stringify(discovery.manifest, null, 2) + '\n'],
    ...discovery.markdownFiles.map(file => [file.path.slice(1), file.content]),
    ['route-manifest.json', JSON.stringify({ origin: SITE_ORIGIN, routes }, null, 2) + '\n'],
  ];
  for (const [file, contents] of files) {
    const target = resolve(output, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  console.log(`Prerendered ${routes.length} route documents with initial metadata and connected schema.`);
  console.log(`Discovery covers ${publicPages.length} public pages, ${discovery.manifest.coverage.indexableCount} indexable URLs and zero orphans.`);
  for (const { path, htmlBytes } of routes) console.log(`${path} ${htmlBytes.toLocaleString('en-IN')} bytes`);
} finally {
  // The server bundle is a build helper and never part of the public deployment.
  await rm(serverOutput, { recursive: true, force: true });
}
