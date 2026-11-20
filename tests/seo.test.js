import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGE_META, PUBLIC_PAGES, buildPageGraph, isIndexablePage, robotsForPage, serializeJsonLd, pageSocialMeta } from "../src/lib/seo.js";
import { programmeFaqs } from "../src/data/programmeFaqs.js";
import { blogPosts } from "../src/features/blog/blog-posts.js";
import { articles } from "../src/features/blog/articles.js";
import { localPages } from "../src/features/locations/local-pages.js";
import { syncPageMeta } from "../src/lib/routes.js";

const origin = "https://letsaimit.com";
const privatePages = ["admin", "parent", "coaching", "signin", "register", "notfound"];
const hasType = (node, type) => [node["@type"]].flat().includes(type);

test("the public inventory is explicit and search permission belongs to production public pages", () => {
  assert.deepEqual(PUBLIC_PAGES.map(page => page.path), [
    "/", "/programme/", "/coach/", "/societies/", "/schools/",
    "/events/", "/blogs/",
    "/blogs/choosing-football-coaching-bengaluru/", "/blogs/choosing-basketball-coaching-bengaluru/",
    "/blogs/football-or-basketball-for-beginners/", "/blogs/first-basketball-session/",
    "/blogs/beginner-basketball-skills/", "/blogs/beginner-football-rules-and-skills/",
    "/blogs/society-sports-coaching-checklist/", "/blogs/understanding-your-childs-practice-progress/",
    "/blogs/balancing-sport-and-school/",
    "/blogs/first-football-session/", "/blogs/encouragement-without-pressure/",
    "/blogs/questions-about-training-preparation/", "/blogs/first-community-match/",
    "/bengaluru/", "/bengaluru/football-coaching/", "/bengaluru/basketball-coaching/",
    "/bengaluru/nambiar-bellezea/", "/bengaluru/nambiar-ellegenza/",
    "/privacy/", "/terms/", "/refunds/",
  ]);
  for (const page of PUBLIC_PAGES) {
    assert.equal(isIndexablePage(page.page, origin), true);
    assert.equal(robotsForPage(page.page, origin), "index, follow, max-image-preview:large");
    assert.equal(isIndexablePage(page.page, "https://uat.letsaimit.com"), false);
    assert.equal(robotsForPage(page.page, "https://letsaimit-preview.vercel.app"), "noindex, follow");
    assert.equal(isIndexablePage(page.page, "https://letsaimit.com.evil.example"), false);
  }
  for (const page of privatePages) {
    assert.equal(isIndexablePage(page, origin), false);
    assert.equal(robotsForPage(page, origin), "noindex, follow");
  }
  assert.equal(isIndexablePage("unknown", origin), false);
  assert.equal(new Set(PUBLIC_PAGES.map(page => page.title)).size, PUBLIC_PAGES.length);
});

test("every route has a connected public graph with an exact page identity", () => {
  for (const page of Object.keys(PAGE_META)) {
    const graph = buildPageGraph(page, { origin })["@graph"];
    const nodes = new Map(graph.map(node => [node["@id"], node]));
    for (const type of ["Organization", "WebSite", "WebPage", "BreadcrumbList", "ImageObject"]) {
      assert.ok(graph.some(node => hasType(node, type)), page + " lacks " + type);
    }
    const webpage = graph.find(node => hasType(node, "WebPage"));
    assert.equal(webpage.url, origin + PAGE_META[page].path);
    assert.equal(webpage.name, PAGE_META[page].title + " — LetsAimIt");
    assert.ok(nodes.has(webpage.isPartOf["@id"]));
    assert.ok(nodes.has(webpage.about["@id"]));
    assert.ok(nodes.has(webpage.breadcrumb["@id"]));
    if (webpage.mainEntity) assert.ok(nodes.has(webpage.mainEntity["@id"]));
    const serialized = JSON.stringify(graph);
    assert.doesNotMatch(serialized, /private-parent@example\.test|child-record-secret|rzp_live_secret/);
  }
  const privateGraph = buildPageGraph("parent", {
    origin,
    parentEmail: "private-parent@example.test",
    registration: { childName: "child-record-secret" },
    credentials: "rzp_live_secret",
  });
  assert.doesNotMatch(JSON.stringify(privateGraph), /private-parent@example\.test|child-record-secret|rzp_live_secret/);
});

test("FAQ and external reading references reflect visible content without claiming hosted social posts", () => {
  const programme = buildPageGraph("programme", { origin })["@graph"];
  const faq = programme.find(node => hasType(node, "FAQPage"));
  assert.deepEqual(faq.mainEntity.map(row => [row.name, row.acceptedAnswer.text]), programmeFaqs.map(row => row.slice(0, 2)));
  assert.ok(programme.some(node => hasType(node, "Service")));
  assert.ok(!programme.some(node => hasType(node, "Product") || hasType(node, "Offer")));
  const blog = buildPageGraph("blogs", { origin })["@graph"];
  const works = blog.filter(node => node.url?.startsWith("https://www.linkedin.com/"));
  assert.equal(works.length, 5);
  assert.deepEqual(works.map(work => work.url), blogPosts.map(post => post.url));
  assert.ok(works.every(work => hasType(work, "WebPage")));
  assert.ok(!blog.some(node => hasType(node, "Article") || hasType(node, "SocialMediaPosting") || hasType(node, "DiscussionForumPosting")));
  assert.deepEqual(works.filter(work => work.datePublished).map(work => work.datePublished), ["2026-05-21", "2026-05-06"]);
  assert.ok(works.filter(work => blogPosts.find(post => post.url === work.url)?.publishedAt == null).every(work => !Object.hasOwn(work, "datePublished")));
  assert.deepEqual(blog.find(node => node["@id"] === origin + "/blogs/#coaching-guides").itemListElement.map(item => item.item["@id"]),
    articles.map(article => origin + article.path + "#webpage"));
  const policy = buildPageGraph("terms", { origin })["@graph"];
  assert.ok(!policy.some(node => ["FAQPage", "Article", "Product"].some(type => hasType(node, type))));
  const video = programme.find(node => hasType(node, "VideoObject"));
  assert.equal(video.duration, "PT12S");
  assert.match(video.creditText, /Marsel Sharipov/);
  assert.ok(!Object.hasOwn(video, "uploadDate"));
});

test("local articles carry their complete public bodies and real publisher attribution", () => {
  assert.equal(articles.length, 13);
  for (const article of articles) {
    const meta = PAGE_META[article.page];
    assert.equal(meta.path, article.path);
    assert.equal(meta.title, article.title);
    assert.equal(meta.description, article.description);
    assert.ok(meta.sources.includes("src/features/blog/articles.js"));
    const graph = buildPageGraph(article.page, { origin, dateModified: "2026-11-20T09:30:00+00:00" })["@graph"];
    const story = graph.find(node => hasType(node, "Article"));
    const page = graph.find(node => node["@id"] === origin + article.path + "#webpage");
    assert.equal(story.url, origin + article.path);
    assert.equal(story.headline, article.title);
    assert.equal(story.datePublished, "2026-11-20");
    assert.equal(story.dateModified, "2026-11-20T09:30:00+00:00");
    assert.equal(story.author["@id"], origin + "/#organization");
    assert.deepEqual(story.author, story.publisher);
    assert.equal(graph.find(node => node["@id"] === story.author["@id"])["@type"], "Organization");
    assert.equal(article.author, "LetsAimIt team");
    assert.notEqual(story.author["@id"], origin + "/#coach-dhiraj");
    assert.equal(story.mainEntityOfPage["@id"], page["@id"]);
    assert.equal(page.mainEntity["@id"], story["@id"]);
    assert.equal(story.image["@id"], page.primaryImageOfPage["@id"]);
    assert.ok(story.articleBody.includes(article.intro));
    for (const section of article.sections) {
      assert.ok(story.articleBody.includes(section.heading));
      for (const paragraph of [...section.paragraphs, ...(section.bullets ?? [])]) assert.ok(story.articleBody.includes(paragraph));
      if (section.table) {
        assert.ok(story.articleBody.includes(section.table.caption));
        for (const row of section.table.rows) assert.ok(story.articleBody.includes(row.join(" | ")));
      }
      if (section.image) assert.ok(story.articleBody.includes(section.image.caption));
    }
    if (article.faq?.length) {
      const faq = graph.find(node => hasType(node, "FAQPage"));
      assert.ok(faq, article.page + " with visible FAQ must include FAQPage");
      assert.deepEqual(faq.mainEntity.map(item => [item.name, item.acceptedAnswer.text]), article.faq.map(item => [item.question, item.answer]));
    }
    const org = graph.find(node => hasType(node, "Organization"));
    assert.equal(org.areaServed.alternateName, "Bangalore");
    const coach = graph.find(node => hasType(node, "Person"));
    assert.equal(coach.hasCredential.length, 4);
    assert.ok(page.speakable?.cssSelector?.includes("h1"));
    assert.deepEqual(story.citation, article.reading.map(reference => new URL(reference.url, origin).href));
    const breadcrumbs = graph.find(node => hasType(node, "BreadcrumbList"));
    assert.deepEqual(breadcrumbs.itemListElement.map(item => item.item), [origin + "/", origin + "/blogs/", story.url]);
    assert.equal(isIndexablePage(article.page, "https://uat.letsaimit.com"), false);
    const social = pageSocialMeta(article.page, { origin });
    assert.equal(social.type, "article");
    assert.equal(social.article.publishedTime, "2026-11-20");
    assert.equal(social.article.author, origin + "/");
    assert.equal(social.image.alt, article.image.alt);
    assert.ok(!Object.hasOwn(social.article, "modifiedTime"));
  }
  assert.equal(pageSocialMeta("programme", { origin }).type, "website");
  assert.ok(!Object.hasOwn(pageSocialMeta("programme", { origin }), "article"));
});

test("all 31 requested content gaps map to substantive public guide sections", () => {
  const plan = JSON.parse(readFileSync(new URL("../docs/local-seo-queries-200.json", import.meta.url), "utf8"));
  const expected = ["L002", "L003", "L004", "L016", "L022", "L023", "L035", "L036", "L037", "L038", "L039", "L041", "L042", "L043", "L044", "L046", "L059", "L060", "L069", "L077", "L104", "L121", "L129", "L146", "L156", "L166", "L177", "L180", "L181", "L184", "L185"];
  const resolved = plan.queries.filter(query => query.previous_coverage === "gap");
  assert.equal(plan.queries.length, 200);
  assert.deepEqual(resolved.map(query => query.id), expected);
  assert.equal(plan.queries.filter(query => query.coverage === "gap").length, 0);
  assert.equal(plan.queries.filter(query => query.coverage === "access/availability-check").length, 57);
  assert.equal(articles[0].id, "choosing-football-coaching-bengaluru");
  for (const query of resolved) {
    const article = articles.find(item => item.path === query.target_path);
    assert.ok(article, query.id + " needs a real public article");
    assert.ok(PUBLIC_PAGES.some(page => page.path === article.path));
    const section = article.sections.find(item => item.id === query.answer_section);
    assert.ok(section?.paragraphs.length, query.id + " needs a visible answer section");
    assert.ok(["source_implemented", "published"].includes(query.content_status));
    assert.equal(query.coverage, "supported");
    assert.ok(query.service_path.startsWith("/bengaluru/"));
    if (query.id !== "L016") assert.ok(article.queryIds.includes(query.id));
    if (["L002", "L003", "L004"].includes(query.id)) assert.equal(query.priority, "P0");
    const story = buildPageGraph(article.page, { origin })["@graph"].find(node => hasType(node, "Article"));
    assert.ok(story.articleBody.includes(section.paragraphs[0]));
    assert.ok(story.wordCount >= 500);
    assert.match(pageSocialMeta(article.page, { origin }).image.url, /\/assets\/optimised\/.+\.webp$/);
    assert.equal(article.author, "LetsAimIt team");
  }
});

test("schema dates are supplied provenance and JSON-LD is safe inside an HTML script", () => {
  const graph = buildPageGraph("home", { origin, datePublished: "2026-11-01T08:00:00+00:00", dateModified: "2026-11-19T12:34:56Z" });
  const webpage = graph["@graph"].find(node => hasType(node, "WebPage"));
  assert.equal(webpage.datePublished, "2026-11-01T08:00:00+00:00");
  assert.equal(webpage.dateModified, "2026-11-19T12:34:56Z");
  const undated = buildPageGraph("home", { origin })["@graph"].find(node => hasType(node, "WebPage"));
  assert.ok(!Object.hasOwn(undated, "dateModified"));
  assert.ok(!Object.hasOwn(undated, "datePublished"));
  for (const value of ["today", "2026-02-30", "2026-11-19T99:00:00Z", "</script>"]) {
    assert.throws(() => buildPageGraph("home", { origin, dateModified: value }), /valid ISO date/);
  }
  for (const value of ["http://letsaimit.com", "https://letsaimit.com/path", "https://user:password@letsaimit.com", "https://letsaimit.com?x=1"]) {
    assert.throws(() => buildPageGraph("home", { origin: value }), /complete HTTPS origin/);
  }
  const hostile = { text: "</script><script>alert(1)</script>&\u2028\u2029" };
  const serialized = serializeJsonLd(hostile);
  assert.doesNotMatch(serialized, /<|>|&|\u2028|\u2029/);
  assert.deepEqual(JSON.parse(serialized), hostile);
});

test("local coaching represents the two real societies as service areas without inventing branches or reputation", () => {
  assert.equal(localPages.length, 5);
  const societies = ['Nambiar Bellezea', 'Nambiar Ellegenza'];
  for (const local of localPages) {
    const graph = buildPageGraph(local.page, { origin })['@graph'];
    const service = graph.find(node => hasType(node, 'Service'));
    const page = graph.find(node => node['@id'] === origin + local.path + '#webpage');
    assert.equal(service.url, origin + local.path);
    assert.equal(service.provider['@id'], origin + '/#organization');
    assert.equal(page.mainEntity['@id'], service['@id']);
    const places = service.areaServed.map(reference => graph.find(node => node['@id'] === reference['@id']));
    assert.deepEqual(places.map(place => place.name).sort(), (local.society ? [local.society] : societies).slice().sort());
    for (const place of places) {
      assert.equal(place['@type'], 'Place');
      const source = localPages.find(content => content.society === place.name);
      assert.equal(place.address, source.location.address);
      assert.equal(place.subjectOf.url, source.location.sourceUrl);
      assert.equal(place.containedInPlace['@id'], origin + '/bengaluru/#city');
    }
    const faq = graph.find(node => hasType(node, 'FAQPage'));
    assert.deepEqual(faq.mainEntity.map(item => [item.name, item.acceptedAnswer.text]), local.faq.map(item => [item.question, item.answer]));
    assert.deepEqual(graph.find(node => hasType(node, 'BreadcrumbList')).itemListElement.map(item => item.item), local.page === 'local-bengaluru' ? [origin + '/', service.url] : [origin + '/', origin + '/bengaluru/', service.url]);
    assert.ok(!graph.some(node => ['LocalBusiness', 'Review', 'AggregateRating', 'GeoCoordinates', 'Offer', 'Product', 'Article'].some(type => hasType(node, type))));
    assert.doesNotMatch(JSON.stringify(graph), /openingHours|ratingValue|priceRange|latitude|longitude/);
    assert.ok(!Object.hasOwn(page, 'datePublished'));
    assert.equal(isIndexablePage(local.page, 'https://uat.letsaimit.com'), false);
  }
});

test("client navigation replaces page schema and metadata without carrying another page's dates", () => {
  const previousDocument = globalThis.document;
  const nodes = new Map();
  const createNode = () => ({
    textContent: "",
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    remove() {
      for (const [key, value] of nodes) if (value === this) nodes.delete(key);
    },
  });
  const selectors = [
    'meta[name="description"]', 'meta[property="og:title"]',
    'meta[property="og:description"]', 'meta[property="og:url"]',
    'meta[property="og:type"]', 'meta[property="og:image"]',
    'meta[property="og:image:type"]', 'meta[property="og:image:width"]',
    'meta[property="og:image:height"]', 'meta[property="og:image:alt"]',
    'meta[name="twitter:title"]', 'meta[name="twitter:description"]',
    'meta[name="twitter:image"]', 'meta[name="twitter:image:alt"]',
    'meta[name="robots"]', 'link[rel="canonical"]',
  ];
  for (const selector of selectors) nodes.set(selector, createNode());
  globalThis.document = {
    title: "",
    querySelector: selector => nodes.get(selector),
    getElementById: id => nodes.get(id),
    createElement: createNode,
    head: { append: node => nodes.set(node.id ?? (node.attributes.property ? `meta[property="${node.attributes.property}"]` : node.attributes.name ? `meta[name="${node.attributes.name}"]` : `link[rel="${node.attributes.rel}"][type="${node.attributes.type}"]`), node) },
  };
  try {
    syncPageMeta("home");
    const markdownSelector = 'link[rel="alternate"][type="text/markdown"]';
    const llmsSelector = 'link[rel="describedby"][type="text/plain"]';
    assert.equal(nodes.get(markdownSelector).attributes.href, origin + "/index.md");
    assert.equal(nodes.get(llmsSelector).attributes.href, origin + "/llms.txt");
    const schema = nodes.get("site-schema");
    assert.equal(schema.type, "application/ld+json");
    const datedHome = buildPageGraph("home", { dateModified: "2026-11-19T12:34:56Z" });
    schema.textContent = serializeJsonLd(datedHome);
    syncPageMeta("home");
    assert.deepEqual(JSON.parse(schema.textContent), datedHome);

    const article = articles[0];
    syncPageMeta(article.page);
    assert.equal(document.title, article.title + " — LetsAimIt");
    assert.equal(nodes.get('meta[property="og:type"]').attributes.content, "article");
    assert.equal(nodes.get('meta[property="article:published_time"]').attributes.content, "2026-11-20");
    assert.equal(nodes.get('meta[property="article:author"]').attributes.content, origin + "/");
    assert.equal(nodes.get('link[rel="canonical"]').attributes.href, origin + article.path);
    assert.equal(nodes.get(markdownSelector).attributes.href, origin + article.path.slice(0, -1) + ".md");
    assert.equal(JSON.parse(schema.textContent)["@graph"].find(node => hasType(node, "Article")).headline, article.title);
    schema.textContent = serializeJsonLd(buildPageGraph(article.page, { origin, dateModified: "2026-11-20T09:30:00Z" }));
    syncPageMeta(article.page);
    assert.equal(nodes.get('meta[property="article:modified_time"]').attributes.content, "2026-11-20T09:30:00Z");

    syncPageMeta("programme");
    assert.equal(document.title, PAGE_META.programme.title + " — LetsAimIt");
    assert.equal(nodes.get('link[rel="canonical"]').attributes.href, origin + "/programme/");
    assert.equal(nodes.get('meta[property="og:url"]').attributes.content, origin + "/programme/");
    assert.equal(nodes.get(markdownSelector).attributes.href, origin + "/programme.md");
    assert.deepEqual(JSON.parse(schema.textContent), buildPageGraph("programme"));
    assert.ok(JSON.parse(schema.textContent)["@graph"].some(node => hasType(node, "FAQPage")));
    assert.equal(nodes.get('meta[property="og:type"]').attributes.content, "website");
    for (const property of ["published_time", "modified_time", "author"]) assert.equal(nodes.has(`meta[property="article:${property}"]`), false);
    assert.equal(nodes.get('meta[property="og:image"]').attributes.content, origin + "/assets/share-letsaimit-1200x630.png");

    syncPageMeta("parent");
    assert.equal(nodes.get('meta[name="robots"]').attributes.content, "noindex, follow");
    assert.deepEqual(JSON.parse(schema.textContent), buildPageGraph("parent"));
    assert.ok(!JSON.parse(schema.textContent)["@graph"].some(node => hasType(node, "FAQPage")));
    assert.equal(nodes.has(markdownSelector), false);
    assert.equal(nodes.has(llmsSelector), false);
    assert.equal(nodes.size, selectors.length + 1);

    syncPageMeta("blogs");
    assert.equal(nodes.get(markdownSelector).attributes.href, origin + "/blogs.md");
    assert.equal(nodes.get(llmsSelector).attributes.href, origin + "/llms.txt");
    assert.equal(nodes.size, selectors.length + 3);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
