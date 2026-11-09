import test from "node:test";
import assert from "node:assert/strict";
import { buildNewRequestEmail, buildDigestEmail } from "../supabase/functions/_shared/notification-email.js";

const dashboardOrigin = "https://uat.letsaimit.com";
const request = {
  id: "20000000-0000-4000-8000-000000000001", formType: "enrol",
  parentName: "Parent & Guardian", childName: "Child <name>", sport: "Basketball",
  community: "Community A", submittedAt: "2026-11-10T05:00:00+00:00",
};
const summary = {
  windowStartUtc: "2026-11-10T04:00:00Z", windowEndUtc: "2026-11-10T08:00:00Z", generatedAtUtc: "2026-11-10T08:05:00Z",
  newTrials: 3, newEnrolments: 2, acceptedDecisions: 1, declinedDecisions: 2, pendingRequests: 7,
};

test("new-request content escapes every rendered field and preserves readable plain text", () => {
  const email = buildNewRequestEmail({ request: { ...request, parentName: '<script>alert("parent")</script>', childName: "O'Neil & Child", sport: '<img src=x onerror="bad">', community: '<a href="evil">Community</a>' }, dashboardOrigin });
  assert.match(email.html, /&lt;script&gt;alert\(&quot;parent&quot;\)&lt;\/script&gt;/);
  assert.match(email.html, /O&#39;Neil &amp; Child/);
  assert.match(email.html, /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
  assert.match(email.html, /&lt;a href=&quot;evil&quot;&gt;Community&lt;\/a&gt;/);
  assert.doesNotMatch(email.html, /<script|<img|onerror="bad"/);
  assert.match(email.text, /O'Neil & Child/);
  assert.equal(email.subject, "LetsAimIt: New enrolment request");
  assert.doesNotMatch(email.subject, /[\r\n]/);
});

test("Accept and Decline navigate only to the configured dashboard with exact review intents", () => {
  const email = buildNewRequestEmail({ request: { ...request, dashboardOrigin: "https://evil.example", acceptUrl: "https://evil.example" }, dashboardOrigin });
  const links = [...email.html.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1].replaceAll("&amp;", "&")));
  assert.equal(links.length, 2);
  assert.deepEqual(links.map(url => url.searchParams.get("requestedDecision")), ["accept", "decline"]);
  for (const link of links) {
    assert.equal(link.origin, dashboardOrigin);
    assert.equal(link.pathname, "/admin/");
    assert.equal(link.searchParams.get("requestId"), request.id);
    assert.deepEqual([...link.searchParams.keys()], ["requestId", "requestedDecision"]);
    assert.doesNotMatch(link.href, /token|secret|api\/|decide_registration/);
  }
  assert.match(email.text, /saved only after you confirm it there/);
});

test("the configured production origin works without importing a row-supplied URL", () => {
  const email = buildNewRequestEmail({ request, dashboardOrigin: "https://letsaimit.com/" });
  assert.match(email.text, /https:\/\/letsaimit\.com\/admin\/\?requestId=/);
  assert.doesNotMatch(email.text, /uat\.letsaimit/);
});

test("names and untrusted text reject header/control injection without echoing private input", () => {
  for (const name of ["parentName", "childName", "sport", "community"]) {
    for (const attack of ["Name\r\nBcc: victim@example.com", "Name\u0000hidden", "Name\u2028injected"]) {
      assert.throws(() => buildNewRequestEmail({ request: { ...request, [name]: attack }, dashboardOrigin }), error => error instanceof TypeError && !error.message.includes("victim"));
    }
  }
  assert.throws(() => buildNewRequestEmail({ request: { ...request, parentName: "x".repeat(81) }, dashboardOrigin }), /parent name/);
  assert.throws(() => buildNewRequestEmail({ request: { ...request, community: "x".repeat(121) }, dashboardOrigin }), /community/);
});

test("unsafe origins, request IDs, types and invalid calendar timestamps are rejected", () => {
  for (const invalidOrigin of ["http://uat.letsaimit.com", "javascript:alert(1)", "//uat.letsaimit.com", "https://user:password@uat.letsaimit.com", "https://uat.letsaimit.com/path", "https://uat.letsaimit.com?next=evil", "https://uat.letsaimit.com#fragment", "https://uat.letsaimit.com\n.evil.example"]) {
    assert.throws(() => buildNewRequestEmail({ request, dashboardOrigin: invalidOrigin }), /dashboard origin/);
  }
  assert.throws(() => buildNewRequestEmail({ request: { ...request, id: "id&requestedDecision=decline" }, dashboardOrigin }), /request id/);
  assert.throws(() => buildNewRequestEmail({ request: { ...request, formType: "enrol\r\nBcc: victim@example.com" }, dashboardOrigin }), /request type/);
  for (const submittedAt of ["2026-02-30T05:00:00Z", "2026-11-10T25:00:00Z", "2026-11-10 05:00:00", "invalid"]) {
    assert.throws(() => buildNewRequestEmail({ request: { ...request, submittedAt }, dashboardOrigin }), /received time/);
  }
});

test("trial email does not invent a child name and both formats show received IST time", () => {
  const email = buildNewRequestEmail({ request: { ...request, formType: "trial", childName: null }, dashboardOrigin });
  assert.equal(email.subject, "LetsAimIt: New trial request");
  assert.doesNotMatch(email.text, /Child:/);
  assert.match(email.text, /Received \(IST\): .*10:30/);
  assert.match(email.html, /Received \(IST\)/);
});

test("four-hour summary separates window activity from pending backlog snapshot", () => {
  const email = buildDigestEmail({ summary, dashboardOrigin });
  for (const line of ["New trial requests: 3", "New enrolment requests: 2", "Accepted decisions: 1", "Declined decisions: 2"]) assert.ok(email.text.includes(line));
  assert.match(email.text, /Pending requests as of .*1:35.*IST: 7/);
  assert.match(email.text, /Window: .*9:30.*1:30.*IST/);
  assert.match(email.text, /New requests and saved decisions are counted within this window/);
  assert.match(email.html, /href="https:\/\/uat\.letsaimit\.com\/admin\/"/);
  assert.doesNotMatch(email.text + email.html, /abandoned|unregistered|time spent|payment|revenue|attendance/i);
});

test("summary windows must be closed, UTC-aligned and exactly four hours", () => {
  for (const changed of [
    { windowEndUtc: "2026-11-10T09:00:00Z" },
    { windowStartUtc: "2026-11-10T04:30:00Z", windowEndUtc: "2026-11-10T08:30:00Z", generatedAtUtc: "2026-11-10T09:00:00Z" },
    { generatedAtUtc: "2026-11-10T07:59:59Z" },
    { windowStartUtc: "invalid" },
  ]) assert.throws(() => buildDigestEmail({ summary: { ...summary, ...changed }, dashboardOrigin }), /window|summary time/);
});

test("summary counts reject missing, negative, fractional, string and overflowing values", () => {
  for (const name of ["newTrials", "newEnrolments", "acceptedDecisions", "declinedDecisions", "pendingRequests"]) {
    for (const invalid of [undefined, -1, 1.5, "4", Infinity]) assert.throws(() => buildDigestEmail({ summary: { ...summary, [name]: invalid }, dashboardOrigin }), /count/);
  }
  assert.throws(() => buildDigestEmail({ summary: { ...summary, newTrials: Number.MAX_SAFE_INTEGER, newEnrolments: 1 }, dashboardOrigin }), /too large/);
});

test("helpers expose content only and never introduce recipient lists or send side effects", () => {
  for (const email of [buildNewRequestEmail({ request, dashboardOrigin }), buildDigestEmail({ summary, dashboardOrigin })]) {
    assert.deepEqual(Object.keys(email).sort(), ["html", "subject", "text"]);
    assert.equal(typeof email.subject, "string");
    assert.equal(typeof email.html, "string");
    assert.equal(typeof email.text, "string");
  }
});

test("late-only summary activity is labelled separately and never added to the four-hour counts", () => {
  const email = buildDigestEmail({ dashboardOrigin, summary: { ...summary, newTrials: 0, newEnrolments: 0, acceptedDecisions: 0, declinedDecisions: 0, lateNewTrials: 4, lateNewEnrolments: 1, lateAcceptedDecisions: 2, lateDeclinedDecisions: 3 } });
  for (const line of ["New trial requests: 0", "New enrolment requests: 0", "Accepted decisions: 0", "Declined decisions: 0", "Earlier trial requests: 4", "Earlier enrolment requests: 1", "Earlier accepted decisions: 2", "Earlier declined decisions: 3"]) assert.ok(email.text.includes(line));
  assert.match(email.html, /Carried forward: activity recorded earlier and first available since the previous summary/);
  assert.match(email.text, /separate from the window above/);
  assert.match(email.text, /IST: 7/);
});

test("absent or zero carry-forward values do not add a carry-forward section; present values are strict counts", () => {
  assert.doesNotMatch(buildDigestEmail({ summary, dashboardOrigin }).text, /Carried forward/);
  assert.doesNotMatch(buildDigestEmail({ summary: { ...summary, lateNewTrials: 0 }, dashboardOrigin }).html, /Carried forward/);
  for (const key of ["lateNewTrials", "lateNewEnrolments", "lateAcceptedDecisions", "lateDeclinedDecisions"]) {
    for (const invalid of [null, -1, 1.5, "1"]) assert.throws(() => buildDigestEmail({ summary: { ...summary, [key]: invalid }, dashboardOrigin }), /count/);
  }
});
