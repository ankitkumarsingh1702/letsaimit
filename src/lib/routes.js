import { PAGE_META, SITE_ORIGIN, robotsForPage, buildPageGraph, serializeJsonLd } from "./seo.js";
export { PAGE_META, SITE_ORIGIN, PUBLIC_PAGES, INDEXABLE_PAGES, isProductionOrigin, isIndexablePage, robotsForPage } from "./seo.js";

export const PAGE_TITLES = Object.fromEntries(Object.entries(PAGE_META).map(([key, value]) => [key, value.title]));
export function pageFromPath(pathname = "/") {
  let path;
  try { path = decodeURIComponent(pathname).replace(/\/index\.html$/, "/").replace(/\/+$/, "") || "/"; }
  catch { return "notfound"; }
  return Object.entries(PAGE_META).find(([key, value]) => key !== "notfound" && (value.path.replace(/\/$/, "") || "/") === path)?.[0] || "notfound";
}
export function pageFromHash(hash = "") {
  if (!hash || hash === "#" || hash === "#/") return "home";
  return pageFromPath("/" + hash.replace(/^#\/?/, "").split("?")[0]);
}
export function readRoute(location) {
  return location.hash.startsWith("#/") ? pageFromHash(location.hash) : pageFromPath(location.pathname);
}
export function syncPageMeta(page) {
  const meta = PAGE_META[page] || PAGE_META.notfound;
  const title = `${meta.title} — LetsAimIt`;
  document.title = title;
  const values = {
    'meta[name="description"]': meta.description,
    'meta[property="og:title"]': title,
    'meta[property="og:description"]': meta.description,
    'meta[property="og:url"]': SITE_ORIGIN + meta.path,
    'meta[name="twitter:title"]': title,
    'meta[name="twitter:description"]': meta.description,
    'meta[name="robots"]': robotsForPage(page),
  };
  for (const [selector, value] of Object.entries(values)) document.querySelector(selector)?.setAttribute("content", value);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", SITE_ORIGIN + meta.path);
  const publicPage = PAGE_META[page]?.indexable === true;
  const markdownPath = meta.path === "/" ? "/index.md" : meta.path.slice(0, -1) + ".md";
  for (const [rel, type, href] of [
    ["alternate", "text/markdown", SITE_ORIGIN + markdownPath],
    ["describedby", "text/plain", SITE_ORIGIN + "/llms.txt"],
  ]) {
    let link = document.querySelector(`link[rel="${rel}"][type="${type}"]`);
    if (!publicPage) {
      link?.remove();
      continue;
    }
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", rel);
      link.setAttribute("type", type);
      document.head.append(link);
    }
    link.setAttribute("href", href);
  }
  let schema = document.getElementById("site-schema");
  const dates = {};
  if (schema?.textContent) {
    try {
      const existing = JSON.parse(schema.textContent)["@graph"]?.find(node => node["@id"] === SITE_ORIGIN + meta.path + "#webpage");
      if (existing?.datePublished) dates.datePublished = existing.datePublished;
      if (existing?.dateModified) dates.dateModified = existing.dateModified;
    } catch {
      // A stale or malformed graph is replaced from the current public route.
    }
  }
  if (!schema) {
    schema = document.createElement("script");
    schema.id = "site-schema";
    schema.type = "application/ld+json";
    document.head.append(schema);
  }
  schema.textContent = serializeJsonLd(buildPageGraph(page, dates));
}
