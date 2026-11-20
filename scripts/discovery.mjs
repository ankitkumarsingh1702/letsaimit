import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export const PRODUCTION_ORIGIN = 'https://letsaimit.com';
const sitemapNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const privatePaths = ['/admin/', '/parent/', '/coach-dashboard/', '/sign-in/', '/register/', '/404/'];
const crawlerNames = ['*', 'Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Applebot', 'DuckAssistBot'];
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const omittedTags = new Set(['script', 'style', 'nav', 'footer', 'form', 'dialog', 'button', 'input', 'select', 'textarea', 'noscript', 'svg', 'template']);
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©' };

// These files supply public page content. Shared application state and site chrome
// do not date a page when an unrelated private feature or navigation changes.
export const PAGE_CONTENT_SOURCES = {
  home: ['src/pages/Home.jsx', 'src/components/HomeCoach.jsx', 'src/components/HomeFilm.jsx', 'src/components/HomeGallery.jsx', 'src/data/gallery.js', 'src/features/stories/ParentStories.js', 'src/features/stories/testimonials.js'],
  programme: ['src/pages/Programme.jsx', 'src/data/programmeFaqs.js', 'src/components/ProgrammeFilm.jsx'],
  coach: ['src/pages/Coach.jsx', 'src/features/stories/CoachStory.js'],
  societies: ['src/pages/Societies.jsx'],
  schools: ['src/features/schools/SchoolsPage.js'],
  events: ['src/features/events/EventsPage.js'],
  blogs: ['src/pages/Blogs.jsx', 'src/features/blog/blog-posts.js', 'src/features/blog/articles.js',
    'src/features/blog/guides/choosing-guides.js', 'src/features/blog/guides/learning-guides.js',
    'src/features/blog/guides/community-guides.js'],
  privacy: ['src/pages/Legal.jsx'],
  terms: ['src/pages/Legal.jsx'],
  refunds: ['src/pages/Legal.jsx'],
};

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

export function decodeHtml(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (!entity.startsWith('#')) return entities[entity] ?? match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '�';
  });
}

function attributes(source) {
  const values = {};
  for (const match of source.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    values[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return values;
}

/** Parse the trusted, React-rendered HTML without executing scripts or fetching media. */
export function parseHtml(html) {
  const root = { tag: '#document', attributes: {}, children: [] };
  const stack = [root];
  for (const token of html.match(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+|</gi) ?? []) {
    if (token.startsWith('<!--')) continue;
    const closing = /^<\/([a-z][\w:-]*)\s*>$/i.exec(token);
    if (closing) {
      const at = stack.findLastIndex(node => node.tag === closing[1].toLowerCase());
      if (at > 0) stack.length = at;
      continue;
    }
    const opening = /^<([a-z][\w:-]*)([\s\S]*?)\/?\s*>$/i.exec(token);
    if (opening) {
      const node = { tag: opening[1].toLowerCase(), attributes: attributes(opening[2]), children: [] };
      stack.at(-1).children.push(node);
      if (!voidTags.has(node.tag) && !token.endsWith('/>')) stack.push(node);
    } else {
      stack.at(-1).children.push(decodeHtml(token));
    }
  }
  return root;
}

export function findElements(node, predicate) {
  if (typeof node === 'string') return [];
  const matches = predicate(node) ? [node] : [];
  return matches.concat(node.children.flatMap(child => findElements(child, predicate)));
}

function omitted(node) {
  const attrs = node.attributes;
  return omittedTags.has(node.tag) || Object.hasOwn(attrs, 'hidden') || attrs['aria-hidden'] === 'true' || attrs['data-discovery-exclude'] === 'true'
    || /(?:^|\s)(?:[^\s]*-)?sr-only(?:\s|$)/.test(attrs.class ?? '');
}

function plainText(node) {
  if (typeof node === 'string') return node;
  if (omitted(node)) return '';
  return node.children.map(plainText).join('').replace(/\s+/g, ' ').trim();
}

function markdownText(value) {
  return value.replace(/\s+/g, ' ').replace(/([\\`*_\[\]])/g, '\\$1');
}

function absoluteHref(href, url) {
  if (!href) return null;
  try {
    const target = new URL(href, url);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(target.protocol) ? target.href : null;
  } catch { return null; }
}

function inline(node, url) {
  if (typeof node === 'string') return markdownText(node);
  if (omitted(node)) return '';
  const content = () => node.children.map(child => inline(child, url)).join('');
  if (node.tag === 'br') return ' ';
  if (node.tag === 'img') {
    const alt = node.attributes.alt?.trim();
    const src = absoluteHref(node.attributes.src, url);
    return alt && src ? `![${markdownText(alt)}](<${src}>)` : '';
  }
  if (node.tag === 'a') {
    const label = content().trim();
    const href = absoluteHref(node.attributes.href, url);
    return label && href ? `[${label}](<${href}>)` : label;
  }
  if (['strong', 'b'].includes(node.tag)) return `**${content().trim()}**`;
  if (['em', 'i'].includes(node.tag)) return `*${content().trim()}*`;
  if (node.tag === 'code') return '`' + plainText(node).replaceAll('`', '\\`') + '`';
  return content();
}

function markdown(node, url, indent = 0) {
  if (typeof node === 'string') return markdownText(node);
  if (omitted(node)) return '';
  const children = () => node.children.map(child => markdown(child, url, indent)).join('');
  const content = () => inline(node, url).trim();
  if (/^h[1-6]$/.test(node.tag)) return `\n\n${'#'.repeat(Number(node.tag[1]))} ${content()}\n\n`;
  if (['p', 'summary', 'figcaption', 'address'].includes(node.tag)) return `\n\n${content()}\n\n`;
  if (node.tag === 'hr') return '\n\n---\n\n';
  if (['ul', 'ol'].includes(node.tag)) {
    let number = 0;
    const items = node.children.filter(child => typeof child !== 'string' && child.tag === 'li');
    return '\n' + items.map(child => {
      number += 1;
      const prefix = node.tag === 'ol' ? `${number}. ` : '- ';
      const text = child.children.map(item => markdown(item, url, indent + 1)).join('').trim();
      return '  '.repeat(indent) + prefix + text.replace(/\n/g, '\n' + '  '.repeat(indent + 1));
    }).join('\n') + '\n\n';
  }
  if (node.tag === 'dl') {
    return '\n' + findElements(node, child => ['dt', 'dd'].includes(child.tag)).map(child => {
      if (child.tag === 'dt') return `\n- **${inline(child, url).trim()}**`;
      return `: ${inline(child, url).trim()}\n`;
    }).join('') + '\n';
  }
  if (node.tag === 'table') {
    const rows = findElements(node, child => child.tag === 'tr').map(row => row.children
      .filter(child => typeof child !== 'string' && ['th', 'td'].includes(child.tag))
      .map(cell => inline(cell, url).trim().replaceAll('|', '\\|')));
    if (!rows.length) return '';
    const width = Math.max(...rows.map(row => row.length));
    const line = row => '| ' + Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ') + ' |';
    return '\n\n' + [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n') + '\n\n';
  }
  if (node.tag === 'blockquote') return '\n\n' + children().trim().split('\n').map(line => '> ' + line).join('\n') + '\n\n';
  if (node.tag === 'video') {
    const source = node.attributes.src ?? findElements(node, child => child.tag === 'source')[0]?.attributes.src;
    const href = absoluteHref(source, url);
    return href ? `\n\n[Video](<${href}>)\n\n` : '';
  }
  if (['section', 'article', 'header', 'div', 'figure', 'details', 'main'].includes(node.tag)) return '\n\n' + children() + '\n\n';
  return inline(node, url);
}

export function mainMarkdown(html, url) {
  const document = parseHtml(html);
  const mains = findElements(document, node => node.tag === 'main');
  if (mains.length !== 1) throw new Error(`Expected exactly one public main element at ${new URL(url).pathname}.`);
  const headings = findElements(mains[0], node => node.tag === 'h1' && !omitted(node));
  if (headings.length !== 1 || !plainText(headings[0])) throw new Error(`Expected exactly one public H1 at ${new URL(url).pathname}.`);
  return markdown(mains[0], url).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function validateOrigin(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Discovery origin must be a complete HTTPS origin.');
  return origin;
}

export function validateRoutePath(path) {
  if (typeof path !== 'string' || !/^\/(?:[a-z0-9][a-z0-9-]*\/)*$/.test(path)) throw new Error(`Unsupported canonical route path: ${path}`);
  return path;
}

export function markdownPath(path) {
  validateRoutePath(path);
  return path === '/' ? '/index.md' : path.slice(0, -1) + '.md';
}

export function routeOutputFile(page, path) {
  validateRoutePath(path);
  return page === 'notfound' ? '404.html' : path.slice(1) + 'index.html';
}

export function contentHash({ path, title, description, markdown: body, graph }, origin) {
  const input = JSON.stringify({ path, title, description, markdown: body, graph });
  const normalized = [origin, PRODUCTION_ORIGIN].filter(Boolean).reduce((text, siteOrigin) => text.replaceAll(siteOrigin, '{SITE_ORIGIN}'), input);
  return createHash('sha256').update(normalized).digest('hex');
}

export function utcTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('Content provenance needs a valid ISO source timestamp.');
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!days[month - 1] || day < 1 || day > days[month - 1]) throw new Error('Content provenance has an invalid calendar date.');
  return new Date(value).toISOString().replace('.000Z', '+00:00');
}

export async function readBaseline(filename) {
  try {
    const value = JSON.parse(await readFile(filename, 'utf8'));
    if (value.schemaVersion !== 1 || !Array.isArray(value.pages)) throw new Error('Invalid discovery baseline.');
    const seen = new Set();
    for (const page of value.pages) {
      validateRoutePath(page.path);
      if (seen.has(page.path) || !/^[a-f0-9]{64}$/.test(page.contentHash)) throw new Error('Invalid discovery baseline page.');
      utcTimestamp(page.lastmod);
      seen.add(page.path);
    }
    return value.pages;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function sourceLastmod({ root, page, path, hash, baseline, sources = PAGE_CONTENT_SOURCES[page] }) {
  const saved = baseline.find(row => row.path === path);
  if (saved?.contentHash === hash) return utcTimestamp(saved.lastmod);
  const dependencies = sources ?? [];
  if (!dependencies.length) throw new Error(`Public content source paths must be declared for ${page}.`);
  const files = [...dependencies, 'src/lib/seo.js', 'src/lib/publicBrand.js', 'src/lib/media.js', 'src/lib/assets.js', 'src/components/ui.jsx', 'src/data/media-manifest.json'];
  let values;
  try {
    values = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...files], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    throw new Error('Git content provenance is unavailable. Supply a matching discovery baseline.');
  }
  if (!values) throw new Error('No tracked source timestamp exists for this public page.');
  return utcTimestamp(values);
}

export function buildRobots(origin) {
  validateOrigin(origin);
  const production = origin === PRODUCTION_ORIGIN;
  const lines = crawlerNames.map(name => `User-agent: ${name}`).concat('Allow: /');
  if (production) lines.push(...privatePaths.map(path => `Disallow: ${path}`), '', `Sitemap: ${origin}/sitemap.xml`);
  else lines.push('', '# Staging documents return noindex; crawling remains available for removal.');
  return lines.join('\n') + '\n';
}

export function buildSitemap(pages) {
  const entries = pages.filter(page => page.indexable);
  if (entries.length > 50_000) throw new Error('Sitemap exceeds 50,000 URLs; split the public inventory before release.');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + `<urlset xmlns="${sitemapNamespace}">\n`
    + entries.map(page => `  <url><loc>${escapeXml(page.url)}</loc><lastmod>${utcTimestamp(page.lastmod)}</lastmod></url>`).join('\n')
    + '\n</urlset>\n';
  if (Buffer.byteLength(xml) > 50 * 1024 * 1024) throw new Error('Sitemap exceeds the 50 MB uncompressed limit.');
  return xml;
}

function documentFacts(html) {
  const document = parseHtml(html);
  const heads = findElements(document, node => node.tag === 'head');
  if (heads.length !== 1) throw new Error('A public document must have one head.');
  const canonical = findElements(heads[0], node => node.tag === 'link' && node.attributes.rel === 'canonical');
  const robots = findElements(heads[0], node => node.tag === 'meta' && node.attributes.name === 'robots');
  const links = findElements(document, node => node.tag === 'a').map(node => node.attributes.href).filter(Boolean);
  const main = findElements(document, node => node.tag === 'main')[0];
  const contextualLinks = main ? findElements(main, node => node.tag === 'a').map(node => node.attributes.href).filter(Boolean) : [];
  return { canonical, robots, links, contextualLinks };
}

export function validatePublicDocuments({ pages, documents, origin }) {
  validateOrigin(origin);
  if (!pages.some(page => page.path === '/')) throw new Error('The public discovery inventory must include its homepage.');
  const urls = new Set();
  const edges = new Map();
  const contextualIncoming = new Map(pages.map(page => [page.url, new Set()]));
  for (const page of pages) {
    validateRoutePath(page.path);
    if (typeof page.indexable !== 'boolean' || !['content', 'policy'].includes(page.kind)) throw new Error('Public discovery entries need an explicit type and indexing policy.');
    if (page.url !== origin + page.path || urls.has(page.url) || new URL(page.url).search) throw new Error('Discovery inventory has duplicate or noncanonical public URLs.');
    if (!/^[a-f0-9]{64}$/.test(page.contentHash)) throw new Error('A public page is missing its material content hash.');
    utcTimestamp(page.lastmod);
    if (page.indexable && origin !== PRODUCTION_ORIGIN) throw new Error('A staging page cannot be indexable.');
    const html = documents.get(page.path);
    if (!html) throw new Error(`Public route has no generated HTML: ${page.path}`);
    const facts = documentFacts(html);
    if (facts.canonical.length !== 1 || facts.canonical[0].attributes.href !== page.url) throw new Error(`Canonical mismatch in generated page: ${page.path}`);
    if (facts.robots.length !== 1) throw new Error(`Missing unique robots policy: ${page.path}`);
    const noindex = /(?:^|[,\s])noindex(?:$|[,\s])/i.test(facts.robots[0].attributes.content ?? '');
    if (noindex === page.indexable) throw new Error(`Indexability differs from the generated robots policy: ${page.path}`);
    mainMarkdown(html, page.url);
    urls.add(page.url);
    for (const href of facts.contextualLinks) {
      const target = absoluteHref(href, page.url);
      if (!target) continue;
      const url = new URL(target);
      const canonical = url.origin + url.pathname;
      if (!url.search && canonical !== page.url) contextualIncoming.get(canonical)?.add(page.url);
    }
    edges.set(page.url, facts.links.flatMap(href => {
      const target = absoluteHref(href, page.url);
      if (!target) return [];
      const url = new URL(target);
      return url.origin === origin && !url.search ? [url.origin + url.pathname] : [];
    }));
  }
  const visited = new Set();
  const queue = [origin + '/'];
  while (queue.length) {
    const next = queue.shift();
    if (visited.has(next) || !urls.has(next)) continue;
    visited.add(next);
    queue.push(...(edges.get(next) ?? []));
  }
  const orphans = [...urls].filter(url => !visited.has(url));
  if (orphans.length) throw new Error(`Public pages have no crawlable path from home: ${orphans.map(url => new URL(url).pathname).join(', ')}`);
  const underlinked = pages.filter(page => page.path !== '/' && contextualIncoming.get(page.url).size < 2);
  if (underlinked.length) throw new Error(`Public pages need two contextual incoming links: ${underlinked.map(page => page.path).join(', ')}`);
  return { publicCount: pages.length, indexableCount: pages.filter(page => page.indexable).length, orphanCount: 0,
    contextualIncoming: Object.fromEntries(pages.map(page => [page.path, contextualIncoming.get(page.url).size])) };
}

export function buildDiscovery({ pages, documents, origin }) {
  const coverage = validatePublicDocuments({ pages, documents, origin });
  const summary = 'LetsAimIt provides football, basketball and fitness coaching for children aged 5–14 at Nambiar Ellegenza and Nambiar Bellezea in Bengaluru.';
  const list = kind => pages.filter(page => page.kind === kind).map(page => `- [${page.title}](${page.url}): ${page.description}`).join('\n');
  const llms = `# LetsAimIt\n\n> ${summary}\n\nSessions run twice a week for 45–60 minutes. Coach Dhiraj Mishra leads the programme. The first session is free; coaching fees are confirmed during enrolment.\n\n## Coaching and community pages\n\n${list('content')}\n\n## Policies\n\n${list('policy')}\n\n## Full public content\n\n- [Full website text](${origin}/llms-full.txt): Public page content in Markdown, with canonical sources and content modification dates.\n`;
  const full = '# LetsAimIt public page content\n\n> ' + summary + '\n\n' + pages.map(page => {
    const body = page.markdown.replace(/^(#{1,5}) /gm, '##$1 ');
    return `---\n\n## ${page.title}\n\nCanonical source: ${page.url}\n\nLast content modification: ${page.lastmod}\n\n${body}`;
  }).join('\n');
  const markdownFiles = pages.map(page => ({ path: page.markdownPath, content: `Source: ${page.url}\n\nLast content modification: ${page.lastmod}\n\n${page.markdown}` }));
  const manifest = { schemaVersion: 1, origin, productionOrigin: PRODUCTION_ORIGIN, sitemapUrl: origin + '/sitemap.xml', coverage,
    pages: pages.map(({ page, path, url, title, description, contentHash, lastmod, indexable, markdownPath }) => ({ page, path, url, title, description, contentHash, lastmod, indexable, markdownPath, indexingType: 'general' })) };
  return { sitemap: buildSitemap(pages), robots: buildRobots(origin), llms, full, markdownFiles, manifest };
}
