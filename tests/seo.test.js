import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_META, PUBLIC_PAGES, buildPageGraph, isIndexablePage, robotsForPage, serializeJsonLd } from "../src/lib/seo.js";
import { programmeFaqs } from "../src/data/programmeFaqs.js";
import { blogPosts } from "../src/features/blog/blog-posts.js";
import { syncPageMeta } from "../src/lib/routes.js";

const origin = "https://letsaimit.com";
const privatePages = ["admin", "parent", "coaching", "signin", "register", "notfound"];
const hasType = (node, type) => [node["@type"]].flat().includes(type);

test("the public inventory is explicit and search permission belongs to production public pages", () => {
  assert.deepEqual(PUBLIC_PAGES.map(page => page.path), [
    "/", "/programme/", "/coach/", "/societies/", "/schools/",
    "/events/", "/blogs/", "/privacy/", "/terms/", "/refunds/",
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

test("FAQ and original article graphs reflect the actual published content", () => {
  const programme = buildPageGraph("programme", { origin })["@graph"];
  const faq = programme.find(node => hasType(node, "FAQPage"));
  assert.deepEqual(faq.mainEntity.map(row => [row.name, row.acceptedAnswer.text]), programmeFaqs.map(row => row.slice(0, 2)));
  assert.ok(programme.some(node => hasType(node, "Service")));
  assert.ok(!programme.some(node => hasType(node, "Product") || hasType(node, "Offer")));
  const blog = buildPageGraph("blogs", { origin })["@graph"];
  const works = blog.filter(node => hasType(node, "Article") || hasType(node, "SocialMediaPosting"));
  assert.equal(works.length, 5);
  assert.deepEqual(works.map(work => work.url), blogPosts.map(post => post.url));
  assert.deepEqual(works.filter(work => hasType(work, "Article")).map(work => work.datePublished), ["2026-05-21", "2026-05-06"]);
  assert.ok(works.filter(work => hasType(work, "SocialMediaPosting")).every(work => !Object.hasOwn(work, "datePublished")));
  const policy = buildPageGraph("terms", { origin })["@graph"];
  assert.ok(!policy.some(node => ["FAQPage", "Article", "Product"].some(type => hasType(node, type))));
  const video = programme.find(node => hasType(node, "VideoObject"));
  assert.equal(video.duration, "PT12S");
  assert.match(video.creditText, /Marsel Sharipov/);
  assert.ok(!Object.hasOwn(video, "uploadDate"));
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
    'meta[name="twitter:title"]', 'meta[name="twitter:description"]',
    'meta[name="robots"]', 'link[rel="canonical"]',
  ];
  for (const selector of selectors) nodes.set(selector, createNode());
  globalThis.document = {
    title: "",
    querySelector: selector => nodes.get(selector),
    getElementById: id => nodes.get(id),
    createElement: createNode,
    head: { append: node => nodes.set(node.id ?? `link[rel="${node.attributes.rel}"][type="${node.attributes.type}"]`, node) },
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

    syncPageMeta("programme");
    assert.equal(document.title, PAGE_META.programme.title + " — LetsAimIt");
    assert.equal(nodes.get('link[rel="canonical"]').attributes.href, origin + "/programme/");
    assert.equal(nodes.get('meta[property="og:url"]').attributes.content, origin + "/programme/");
    assert.equal(nodes.get(markdownSelector).attributes.href, origin + "/programme.md");
    assert.deepEqual(JSON.parse(schema.textContent), buildPageGraph("programme"));
    assert.ok(JSON.parse(schema.textContent)["@graph"].some(node => hasType(node, "FAQPage")));

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
