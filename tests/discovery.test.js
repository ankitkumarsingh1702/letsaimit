import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { buildDiscovery, buildRobots, buildSitemap, contentHash, mainMarkdown, markdownPath, readBaseline, routeOutputFile, sourceLastmod, utcTimestamp, validatePublicDocuments, validateRoutePath } from '../scripts/discovery.mjs';

const origin = 'https://letsaimit.com';
const lastmod = '2026-11-19T10:00:00+00:00';
const hash = 'a'.repeat(64);
const header = (url, indexable) => `<head><link rel="canonical" href="${url}"/><meta name="robots" content="${indexable ? 'index, follow' : 'noindex, follow'}"/></head>`;

function documentsFor(paths, siteOrigin = origin) {
  const pages = paths.map((path, index) => ({ page: index ? `page-${index}` : 'home', path, url: siteOrigin + path,
    title: `Public page ${index}`, description: `Visible public description ${index}.`, kind: 'content', indexable: siteOrigin === origin,
    lastmod, contentHash: hash, markdownPath: markdownPath(path), markdown: `# Public page ${index}\n\nVisible public copy.\n` }));
  const documents = new Map(pages.map(page => [page.path, `<html>${header(page.url, page.indexable)}<body><main><h1>${page.title}</h1><p>Visible public copy.</p>${pages.filter(other => other !== page).map(other => `<a href="${other.path}">${other.title}</a>`).join('')}</main></body></html>`]));
  return { pages, documents, origin: siteOrigin };
}

test('Markdown keeps public semantic content, source links and facts while excluding site chrome and forms', () => {
  const html = `<header>Site chrome</header><main><header><h1>Football &amp; fitness</h1><p>Public introduction.</p></header>
    <p>Help <strong>young players</strong> <a href="/programme/">enjoy the game</a>.</p>
    <div aria-hidden="true">Hidden decoration</div><p class="blog-sr-only">4 posts</p>
    <nav data-discovery-exclude="true"><a href="/coach/">Keep exploring</a></nav>
    <form><label>SAVED_PRIVATE_RECORD<input value="PRIVATE_ACCOUNT_VALUE"/></label></form>
    <dialog>PRIVATE_DIALOG</dialog><script>window.secret='PRIVATE_SCRIPT'</script>
    <details><summary>What should children bring?</summary><p>Water and suitable shoes.</p></details>
    <ul><li>Football</li><li>Basketball</li></ul>
    <dl><div><dt>Ages</dt><dd>5–14</dd></div><div><dt>Sessions</dt><dd>Twice a week</dd></div></dl>
    <table><thead><tr><th>Session</th><th>Minutes</th></tr></thead><tbody><tr><td>Coaching</td><td>45–60</td></tr></tbody></table>
    <img src="/assets/coach.webp" alt="Coach &amp; player"/><img src="/assets/decor.webp" alt=""/>
    <a href="javascript:alert(1)">Unsafe destination</a></main><footer>Site footer</footer>`;
  const markdown = mainMarkdown(html, origin + '/');
  assert.match(markdown, /^# Football & fitness\n/);
  assert.match(markdown, /Public introduction/);
  assert.match(markdown, /\[enjoy the game\]\(<https:\/\/letsaimit.com\/programme\/>\)/);
  assert.match(markdown, /What should children bring\?/);
  assert.match(markdown, /Water and suitable shoes/);
  assert.match(markdown, /- Football\n- Basketball/);
  assert.match(markdown, /\*\*Ages\*\*: 5–14/);
  assert.match(markdown, /\| Session \| Minutes \|/);
  assert.match(markdown, /!\[Coach & player\]\(<https:\/\/letsaimit.com\/assets\/coach.webp>\)/);
  assert.doesNotMatch(markdown, /PRIVATE|Site chrome|Site footer|Keep exploring|4 posts|Hidden decoration|javascript:|decor.webp/);
});

test('production discovery covers nested public routes and keeps staging sitemap empty', () => {
  const paths = ['/', '/programme/', '/guides/young-players/'];
  const production = buildDiscovery(documentsFor(paths));
  assert.equal(production.manifest.coverage.publicCount, 3);
  assert.equal(production.manifest.coverage.orphanCount, 0);
  assert.equal(production.manifest.coverage.indexableCount, 3);
  assert.match(production.sitemap, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(production.sitemap, /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  assert.equal((production.sitemap.match(/<url>/g) ?? []).length, paths.length);
  assert.doesNotMatch(production.sitemap, /priority|changefreq/);
  for (const page of production.manifest.pages) {
    assert.ok(production.sitemap.includes(`<loc>${page.url}</loc>`));
    assert.ok(production.llms.includes(page.url));
    assert.ok(production.full.includes(`Canonical source: ${page.url}`));
    assert.ok(production.markdownFiles.some(file => file.path === page.markdownPath));
    assert.equal(Object.hasOwn(page, 'markdown'), false);
    assert.equal(page.indexingType, 'general');
  }
  assert.equal(markdownPath('/'), '/index.md');
  assert.equal(markdownPath('/guides/young-players/'), '/guides/young-players.md');
  const staging = buildDiscovery(documentsFor(paths, 'https://uat.letsaimit.com'));
  assert.equal((staging.sitemap.match(/<url>/g) ?? []).length, 0);
  assert.equal(staging.manifest.coverage.indexableCount, 0);
  assert.equal(staging.manifest.pages.every(page => page.indexable === false), true);
  assert.equal(staging.markdownFiles.length, 3);
  assert.doesNotMatch(staging.robots, /Sitemap:|Disallow: \/$/m);
});

test('public inventory validation catches canonical, noindex, absent HTML and orphan errors', () => {
  const fixture = documentsFor(['/', '/programme/', '/coach/']);
  const changed = new Map(fixture.documents);
  changed.set('/programme/', changed.get('/programme/').replace('href="https://letsaimit.com/programme/"', 'href="https://wrong.example/programme/"'));
  assert.throws(() => validatePublicDocuments({ ...fixture, documents: changed }), /Canonical mismatch/);
  changed.set('/programme/', fixture.documents.get('/programme/').replace('index, follow', 'noindex, follow'));
  assert.throws(() => validatePublicDocuments({ ...fixture, documents: changed }), /Indexability differs/);
  changed.delete('/programme/');
  assert.throws(() => validatePublicDocuments({ ...fixture, documents: changed }), /no generated HTML/);
  const orphan = new Map([...fixture.documents].map(([path, html]) => [path, html.replace(/<a href="\/coach\/">[^<]+<\/a>/g, '')]));
  assert.throws(() => validatePublicDocuments({ ...fixture, documents: orphan }), /no crawlable path from home/);
  const underlinked = new Map(fixture.documents);
  underlinked.set('/programme/', underlinked.get('/programme/').replace(/<a href="\/coach\/">[^<]+<\/a>/g, ''));
  assert.throws(() => validatePublicDocuments({ ...fixture, documents: underlinked }), /two contextual incoming links/);
  assert.throws(() => validateRoutePath('/guides/../admin/'), /Unsupported canonical/);
  assert.throws(() => validateRoutePath('/programme/?sort=old'), /Unsupported canonical/);
  assert.throws(() => buildSitemap(Array.from({ length: 50_001 }, () => ({ indexable: true }))), /50,000/);
  assert.equal(routeOutputFile('notfound', '/404/'), '404.html');
  assert.notEqual(routeOutputFile('notfound', '/404/'), '404/index.html');
});

test('material fingerprints preserve dates through refactors and unrelated commits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'letsaimit-discovery-git-'));
  const source = 'content/page.jsx';
  function git(args, timestamp) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env,
      GIT_AUTHOR_NAME: 'Fixture Author', GIT_AUTHOR_EMAIL: 'fixture@example.test',
      GIT_COMMITTER_NAME: 'Fixture Author', GIT_COMMITTER_EMAIL: 'fixture@example.test',
      ...(timestamp ? { GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  const resolveDate = (value, baseline = []) => sourceLastmod({ root, page: 'fixture', path: '/', hash: value, baseline, sources: [source] });
  try {
    await mkdir(join(root, 'content'));
    git(['init', '-q']);
    await writeFile(join(root, source), '<h1>Visible copy</h1>');
    git(['add', source]); git(['commit', '-qm', 'Initial public copy'], '2026-01-02T03:04:05+00:00');
    assert.equal(resolveDate(hash), '2026-01-02T03:04:05+00:00');
    const baseline = [{ path: '/', contentHash: hash, lastmod: resolveDate(hash) }];
    await writeFile(join(root, 'notes.md'), 'Unrelated release notes');
    git(['add', 'notes.md']); git(['commit', '-qm', 'Release notes'], '2026-02-03T04:05:06+00:00');
    assert.equal(resolveDate(hash, baseline), baseline[0].lastmod);
    await writeFile(join(root, source), '<section><h1>Visible copy</h1></section>');
    git(['add', source]); git(['commit', '-qm', 'Presentation refactor'], '2026-03-04T05:06:07+00:00');
    assert.equal(resolveDate(hash, baseline), baseline[0].lastmod, 'unchanged semantic copy retains its prior date');
    assert.equal(resolveDate('b'.repeat(64), baseline), '2026-03-04T05:06:07+00:00', 'changed material content dates from tracked source');
    const baselineFile = join(root, 'baseline.json');
    await writeFile(baselineFile, JSON.stringify({ schemaVersion: 1, pages: baseline }));
    assert.deepEqual(await readBaseline(baselineFile), baseline);
    await writeFile(baselineFile, JSON.stringify({ schemaVersion: 1, pages: [...baseline, baseline[0]] }));
    await assert.rejects(readBaseline(baselineFile), /Invalid discovery baseline page/);
  } finally { await rm(root, { recursive: true, force: true }); }
  assert.equal(utcTimestamp('2026-01-02T08:34:05+05:30'), '2026-01-02T03:04:05+00:00');
  assert.throws(() => utcTimestamp('2026-02-30T00:00:00+00:00'), /invalid calendar/);
  assert.throws(() => utcTimestamp('today'), /valid ISO/);
});

test('content hashes are origin independent and exclude discovery navigation and markup-only wrappers', () => {
  const html = '<main><h1>Public coaching</h1><p>Visible copy.</p><nav data-discovery-exclude="true">Related link</nav></main>';
  const page = { path: '/', title: 'Coaching', description: 'Visible coaching description.' };
  const graph = site => ({ '@graph': [{ '@id': site + '/#organization', url: site + '/' }] });
  const fingerprint = (body, site) => contentHash({ ...page, markdown: mainMarkdown(body, site + '/'), graph: graph(site) }, site);
  assert.equal(fingerprint(html, origin), fingerprint(html, 'https://uat.letsaimit.com'));
  assert.equal(fingerprint(html, origin), fingerprint(html.replace('Related link', 'Different related links'), origin));
  assert.equal(fingerprint(html, origin), fingerprint(html.replace('<p>', '<div><p>').replace('</p>', '</p></div>'), origin));
  assert.notEqual(fingerprint(html, origin), fingerprint(html.replace('Visible copy', 'Changed coaching copy'), origin));
  assert.notEqual(fingerprint(html, origin), contentHash({ ...page, description: 'Changed description.', markdown: mainMarkdown(html, origin + '/'), graph: graph(origin) }, origin));
});

test('the real public route inventory produces complete Markdown and keeps private utilities out', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { PUBLIC_PAGES, render, buildPageGraph, isIndexablePage } = await vite.ssrLoadModule('/src/entry-server.jsx');
    assert.equal(PUBLIC_PAGES.length, 28);
    assert.equal(PUBLIC_PAGES.some(page => /\/(?:admin|parent|coach-dashboard|sign-in|register|404)\//.test(page.path)), false);
    const documents = new Map();
    const pages = PUBLIC_PAGES.map(details => {
      const body = render(details.page);
      const url = origin + details.path;
      const markdown = mainMarkdown(body, url);
      const graph = buildPageGraph(details.page, { origin });
      const content = { ...details, markdown, graph };
      documents.set(details.path, `<html>${header(url, true)}<body>${body}</body></html>`);
      return { ...details, url, markdown, contentHash: contentHash(content, origin), lastmod,
        markdownPath: markdownPath(details.path), indexable: isIndexablePage(details.page, origin) };
    });
    const discovery = buildDiscovery({ pages, documents, origin });
    assert.equal(discovery.manifest.coverage.publicCount, 28);
    assert.equal(discovery.manifest.coverage.indexableCount, 28);
    assert.equal(discovery.markdownFiles.length, 28);
    for (const page of pages) {
      assert.match(page.markdown, /(?:^|\n)# /);
      assert.ok(discovery.full.includes(page.markdown.trim().replace(/^(#{1,5}) /gm, '##$1 ')));
      assert.ok(discovery.llms.includes(page.url));
    }
    const programme = pages.find(page => page.page === 'programme');
    assert.match(programme.markdown, /Which sports are available\?/);
    assert.match(programme.markdown, /When are the sessions\?/);
    assert.match(programme.markdown, /45–60/);
    const blogs = pages.find(page => page.page === 'blogs');
    assert.match(blogs.markdown, /question-doctor-asked-every-sports-parent/);
    assert.match(blogs.markdown, /21 May 2026/);
    assert.doesNotMatch(blogs.markdown, /Article21|Article6 May/);
    const { articles } = await vite.ssrLoadModule('/src/features/blog/articles.js');
    for (const article of articles) {
      const page = pages.find(page => page.page === article.page);
      assert.equal(page.url, origin + article.path);
      assert.ok(page.markdown.includes(article.intro));
      assert.match(page.markdown, /By LetsAimIt team/);
      assert.match(page.markdown, /20 November 2026/);
      for (const section of article.sections) {
        assert.ok(page.markdown.includes(section.heading));
        for (const paragraph of [...section.paragraphs, ...(section.bullets ?? [])]) assert.ok(page.markdown.includes(paragraph));
        if (section.image) assert.ok(page.markdown.includes(section.image.caption));
      }
      assert.ok(blogs.markdown.includes(article.path));
      assert.ok(discovery.sitemap.includes(page.url));
      assert.ok(discovery.full.includes(page.markdown.trim().replace(/^(#{1,5}) /gm, '##$1 ')));
      assert.ok(discovery.manifest.coverage.contextualIncoming[article.path] >= 2);
      const schema = buildPageGraph(article.page, { origin })['@graph'];
      const story = schema.find(node => node['@type'] === 'Article');
      assert.ok(story);
      for (const section of article.sections) for (const paragraph of section.paragraphs) assert.ok(story.articleBody.includes(paragraph));
    }
    const { localPages } = await vite.ssrLoadModule('/src/features/locations/local-pages.js');
    for (const content of localPages) {
      const page = pages.find(page => page.page === content.page);
      assert.ok(page.markdown.includes(content.heading));
      assert.ok(page.markdown.includes(content.intro));
      for (const section of content.sections) for (const paragraph of [...section.paragraphs, ...(section.bullets ?? [])]) assert.ok(page.markdown.includes(paragraph));
      for (const question of content.faq) {
        assert.ok(page.markdown.includes(question.question));
        assert.ok(page.markdown.includes(question.answer));
      }
      if (content.location) {
        assert.ok(page.markdown.includes(content.location.address));
        assert.ok(page.markdown.includes(content.location.mapUrl));
        assert.ok(page.markdown.includes(content.location.sourceUrl));
      }
      assert.ok(discovery.sitemap.includes(page.url));
      assert.ok(discovery.manifest.coverage.contextualIncoming[content.path] >= 2);
      assert.doesNotMatch(page.markdown, /#1|Bengaluru.s best|rated 5|guaranteed results/i);
    }
    assert.doesNotMatch(discovery.full, /Sign in with Google|Keep exploring|Checking your Google account/);
    assert.equal(discovery.aiCatalog.pages.length, 28);
    assert.equal(discovery.aiCatalog.pages.some(page => /\/(?:admin|parent|coach-dashboard|sign-in|register|404)\//.test(page.path)), false);
    assert.ok(discovery.llms.includes('Bangalore'));
    assert.ok(discovery.llms.includes('/.well-known/ai-catalog.json'));
    const footballGuide = pages.find(page => page.page === 'blog-choosing-football-coaching-bengaluru');
    assert.match(footballGuide.markdown, /\| Format \| Typical structure \|/);
    assert.match(footballGuide.markdown, /What should parents check when searching for the best football academy in Bangalore\?/);
    const footballLocal = pages.find(page => page.page === 'local-football');
    assert.match(footballLocal.markdown, /\| Programme detail \| Verified LetsAimIt information \|/);
    assert.ok(discovery.manifest.coverage.contextualIncoming['/bengaluru/football-coaching/'] >= 5);
    const robots = buildRobots(origin);
    for (const name of ['Googlebot', 'Bingbot', 'Applebot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'DuckAssistBot', 'GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended']) assert.ok(robots.includes('User-agent: ' + name));
    for (const path of ['/admin/', '/parent/', '/coach-dashboard/', '/sign-in/', '/register/', '/404/']) assert.ok(robots.includes('Disallow: ' + path));
  } finally { await vite.close(); }
});
