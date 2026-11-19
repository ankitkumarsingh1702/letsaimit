import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGE_META } from "../src/lib/seo.js";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const canonicalPages = Object.entries(PAGE_META).filter(([page]) => page !== "notfound");
const legacyAliases = [
  ["/privacy-policy", PAGE_META.privacy.path],
  ["/terms-and-conditions", PAGE_META.terms.path],
  ["/refund-policy", PAGE_META.refunds.path],
];

// Vercel compiles redirect sources with strict:true and sensitive:true:
// https://github.com/vercel/vercel/blob/main/packages/routing-utils/src/superstatic.ts
// This fixture deliberately supports only our literal sources and the existing
// index.html wildcard. New routing syntax requires an explicit coverage update.
function matchesSource(source, pathname) {
  if (source === "/:path+/index.html") return /^\/(?:[^/]+\/)+index\.html$/.test(pathname);
  assert.match(source, /^\/[a-z0-9/.-]*$/);
  return source === pathname;
}

function redirectsFor(pathname) {
  return config.redirects.filter(rule => matchesSource(rule.source, pathname));
}

function assertOneHop(source, destination) {
  const rules = redirectsFor(source);
  assert.equal(rules.length, 1, source + " must match exactly one redirect");
  assert.equal(rules[0].permanent, true);
  const actual = rules[0].source === "/:path+/index.html"
    ? rules[0].destination.replace(":path+", source.slice(1, -"/index.html".length))
    : rules[0].destination;
  assert.equal(actual, destination, source + " must reach its canonical destination directly");
  assert.deepEqual(redirectsFor(destination), [], destination + " must not redirect again");
}

test("known public and private routes explicitly canonicalize without global slash normalization", () => {
  assert.equal(Object.hasOwn(config, "trailingSlash"), false);
  const sources = config.redirects.map(rule => rule.source);
  assert.equal(new Set(sources).size, sources.length);
  for (const [page, meta] of canonicalPages) {
    assert.deepEqual(redirectsFor(meta.path), [], page + " canonical URL must remain terminal");
    if (page !== "home") assertOneHop(meta.path.slice(0, -1), meta.path);
  }
  for (const path of ["/404", "/404/", "/unknown", "/programme/extra", "/privacy-policy/extra"]) {
    assert.deepEqual(redirectsFor(path), [], "Unknown/error paths must retain their error response: " + path);
  }
});

test("both exact spellings of every legacy policy alias reach the canonical policy in one hop", () => {
  for (const [source, destination] of legacyAliases) {
    assertOneHop(source, destination);
    assertOneHop(source + "/", destination);
  }
});

test("index.html aliases keep their direct canonical destinations without loops", () => {
  assertOneHop("/index.html", PAGE_META.home.path);
  for (const [page, meta] of canonicalPages) {
    if (page !== "home") assertOneHop(meta.path + "index.html", meta.path);
  }
  const wildcard = config.redirects.find(rule => rule.source === "/:path+/index.html");
  assert.equal(wildcard.destination, "/:path+/");
});
