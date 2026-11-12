import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rememberParentRegistration, takeParentRegistration } from "../src/features/parent/parentRequests.js";

async function withUi(run) {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
  try {
    const { default: ParentTracker } = await vite.ssrLoadModule("/src/features/parent/ParentTracker.jsx");
    await run({ React, renderToStaticMarkup, ParentTracker, vite });
  } finally { await vite.close(); }
}

const child = { registrationId: "child-1", childName: "Sample child", sport: "Basketball", community: "Sample community" };
const tracker = snapshot => ({ snapshot, loading: false, error: "", lastSynced: "2026-11-11T15:30:00Z", refresh() {} });

test("parent tracker counts only recorded present/absent sessions, excluding no-session days", () => withUi(async ({ React, renderToStaticMarkup, ParentTracker }) => {
  const snapshot = { children: [child], attendance: [
    { id: "a1", registrationId: child.registrationId, sessionDate: "2026-11-08", status: "present", coachName: "Coach" },
    { id: "a2", registrationId: child.registrationId, sessionDate: "2026-11-09", status: "absent", coachName: "Coach" },
    { id: "a3", registrationId: child.registrationId, sessionDate: "2026-11-10", status: "no_session", coachName: "Coach" },
    { id: "a4", registrationId: child.registrationId, sessionDate: "2026-11-11", status: "present", coachName: "Coach" },
  ], feedback: [{ id: "f1", registrationId: child.registrationId, weekStart: "2026-11-09", summary: "Good balance. Practise passing.", nextStep: "Ten passes each side.", coachName: "Coach", publishedAt: "2026-11-11T14:00:00Z" }], range: { from: "2025-11-12", to: "2026-11-11", feedbackFrom: "2025-11-17" } };
  const before = structuredClone(snapshot);
  const html = renderToStaticMarkup(React.createElement(ParentTracker, { tracker: tracker(snapshot) }));
  assert.match(html, /<dt>Present<\/dt><dd>2<\/dd>/);
  assert.match(html, /<dt>Absent<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>Attendance<\/dt><dd>67%<\/dd>/);
  assert.match(html, /No session/);
  assert.match(html, /An unmarked session is not counted as an absence/);
  const attendanceHeader = html.match(/class="parent-tracker-table parent-attendance-table"[\s\S]*?<thead>(.*?)<\/thead>/)?.[1] || "";
  assert.deepEqual([...attendanceHeader.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map(match => match[1]), ["Date", "Child", "Attendance", "Sport", "Community", "Marked by"], "mobile readers see the attendance result before secondary context, and the marker may be an admin");
  assert.match(html, /<th scope="col">Shared by<\/th>/);
  assert.match(html, /Good balance\. Practise passing\./);
  assert.match(html, /View feedback for Sample child, week of 9 Nov 2026/);
  assert.match(html, /Attendance · 12 Nov 2025 – 11 Nov 2026/);
  assert.match(html, /Feedback since 17 Nov 2025/);
  assert.deepEqual(snapshot, before, "sorting and filtering must not mutate the verified snapshot");
}));

test("loading, failed reads and empty tracker never fabricate attendance or feedback", () => withUi(async ({ React, renderToStaticMarkup, ParentTracker }) => {
  const loading = renderToStaticMarkup(React.createElement(ParentTracker, { tracker: { ...tracker(null), loading: true, lastSynced: null } }));
  assert.match(loading, /Loading your tracker…/);
  assert.doesNotMatch(loading, /<dt>Present<\/dt>/);
  const failed = renderToStaticMarkup(React.createElement(ParentTracker, { tracker: { ...tracker(null), error: "Tracker could not load.", lastSynced: null } }));
  assert.match(failed, /role="alert"/);
  assert.match(failed, />Try again<\/button>/);
  assert.doesNotMatch(failed, /No attendance recorded yet/);
  const empty = renderToStaticMarkup(React.createElement(ParentTracker, { tracker: tracker({ children: [child], attendance: [], feedback: [] }) }));
  assert.match(empty, /<dt>Attendance<\/dt><dd>—<\/dd>/);
  assert.match(empty, /No attendance recorded yet/);
  assert.match(empty, /No weekly feedback shared yet/);
  assert.doesNotMatch(empty, /100%|undefined|NaN/);
  const stale = renderToStaticMarkup(React.createElement(ParentTracker, { tracker: { ...tracker({ children: [], attendance: [], feedback: [] }), error: "Connection lost." } }));
  assert.match(stale, /Showing the last saved tracker/);
  assert.match(stale, /Tracking starts after your child’s registration is approved/);
  assert.doesNotMatch(stale, /<dt>Present<\/dt>/);
}));

test("standalone parent navigation keeps fees, requests and account controls and does not require admin membership", () => withUi(async ({ React, renderToStaticMarkup, vite }) => {
  const { OwnRequests } = await vite.ssrLoadModule("/src/features/parent/ParentRequests.jsx");
  const { SiteActionsProvider } = await vite.ssrLoadModule("/src/context/SiteActions.jsx");
  const auth = { user: { id: "sample-parent", email: "parent@example.test", displayName: "Sample parent", isGoogle: true }, phase: "denied", client: null };
  const render = supplied => renderToStaticMarkup(React.createElement(SiteActionsProvider, { value: { openForm() {} } }, React.createElement(OwnRequests, { auth: supplied })));
  const html = render(auth);
  assert.match(html, /aria-label="Parent navigation"/);
  assert.match(html, /aria-current="page"[^>]*>.*My requests/s);
  assert.match(html, /href="\/parent\/\?view=payments"[^>]*>.*Payments/s);
  assert.match(html, /href="\/parent\/\?view=tracking"[^>]*>.*Tracking/s);
  assert.match(html, /<div hidden=""><section class="billing-panel billing-parent"[\s\S]*?Loading saved invoices/);
  assert.match(html, /Loading your saved requests/);
  assert.match(html, /Delete account/);
  assert.equal((html.match(/href="\/coach-dashboard\/"/g) || []).length, 1, "the account menu gives the same access on desktop and mobile");
  assert.doesNotMatch(html, /href="\/admin\/"/);
  assert.match(render({ ...auth, phase: "authorized" }), /href="\/admin\/"[^>]*>.*Team dashboard/s, "one Google identity can use both workspaces");
}));

test("registration receipt is one-time and bound to the current parent and tab", () => {
  const values = new Map();
  const storage = {
    setItem: (key, value) => values.set(key, value),
    getItem: key => values.get(key),
    removeItem: key => values.delete(key),
  };
  const marker = { userId: "parent-1", requestId: "new-request" };
  const now = 1234;
  assert.equal(rememberParentRegistration(marker, storage, now), true);
  assert.equal(takeParentRegistration("other-parent", storage, now + 1), null);
  assert.equal(takeParentRegistration(marker.userId, storage, now + 2), null);
  assert.equal(rememberParentRegistration(marker, storage, now), true);
  assert.equal(takeParentRegistration(marker.userId, storage, now + 300_000), null);
  assert.equal(rememberParentRegistration(marker, storage, now), true);
  assert.equal(takeParentRegistration(marker.userId, storage, now + 1), marker.requestId);
  assert.equal(takeParentRegistration(marker.userId, storage, now + 2), null);
});

test("a saved enrolment is highlighted only when it is in the parent's request list", () => withUi(async ({ React, renderToStaticMarkup, vite }) => {
  const { ParentRequestList } = await vite.ssrLoadModule("/src/features/parent/ParentRequests.jsx");
  const base = { formType: "enrol", sport: "Basketball", community: "Sample community", submittedAt: "2026-11-11T14:00:00Z" };
  const rows = [
    { ...base, id: "old-request", childName: "Already approved", reviewDecision: "accepted" },
    { ...base, id: "trial", formType: "trial", reviewDecision: "accepted" },
    { ...base, id: "new-request", childName: "New child", reviewDecision: "pending" },
  ];
  const render = receivedId => renderToStaticMarkup(React.createElement(ParentRequestList, { rows, receivedId }));
  const html = render("new-request");
  assert.match(html, /role="status"[^>]*>.*Registration received.*We’ll email you after review\./s);
  assert.match(html, /data-received="true"[^>]*>.*New child.*Pending review/s);
  assert.equal((html.match(/>View payments/g) || []).length, 1, "only an accepted enrolment offers a payment action");
  assert.ok(html.indexOf("New child") < html.indexOf("Already approved"));
  assert.doesNotMatch(render("trial"), /Registration received|data-received/);
  assert.doesNotMatch(render("other-parent-row"), /Registration received|data-received/);
}));
