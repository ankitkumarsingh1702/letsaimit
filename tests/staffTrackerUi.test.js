import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const child = { registrationId: "c6fa700e-ce24-4b11-9d5c-7417d7724c00", childName: "Sample child", sport: "Basketball", community: "Sample community", coachEmail: "coach@example.test", weekdays: [1, 3], startsOn: "2026-11-01", assignmentRevision: 1 };
const auth = { phase: "denied", user: { id: "sample-coach", isGoogle: true, email: "coach@example.test" }, client: { rpc() { assert.fail("rendering must not save or grant access"); } } };

// Only the snapshot transport is replaced. These are actual React presentation components.
async function withStaffUi(snapshot, run) {
  const state = { snapshot, loading: snapshot === null, error: "", lastSynced: snapshot ? "2026-11-11T15:30:00Z" : null };
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error", plugins: [{
    name: "fixture-tracker-snapshot",
    enforce: "pre",
    load(id) { if (id.split("?")[0].endsWith("/src/features/tracker/useParentTracker.js")) return `export function useParentTracker() { return { ...${JSON.stringify(state)}, refresh() {} }; }`; },
  }] });
  try { await run(await vite.ssrLoadModule("/src/features/tracker/StaffTracker.jsx"), vite); }
  finally { await vite.close(); }
}

test("assigned non-admin coach sees scoped attendance controls and can also open parent workspace", () => withStaffUi({ isAdmin: false, emailEnabled: false, children: [child], attendance: [], feedback: [] }, async ({ CoachingWorkspace }) => {
  const html = renderToStaticMarkup(React.createElement(CoachingWorkspace, { auth }));
  assert.match(html, /aria-label="Coaching navigation"/);
  assert.match(html, /aria-label="Switch workspace from Coach"/);
  assert.match(html, /href="\/parent\/"[^>]*>Parent<\/a>/);
  assert.match(html, /Attendance for Sample child/);
  assert.match(html, /1 child · Assigned, approved enrolments only/);
  assert.match(html, /<option value="unmarked" selected="">Not marked<\/option>/);
  assert.match(html, /Not marked is not counted as absent/);
  assert.doesNotMatch(html, />Coach access<|href="\/admin\/"|Send attendance email/);
  assert.doesNotMatch(html, /Gmail[^<]*ready|Email[^<]*sent|Attendance saved/);
}));

test('admin email action waits for dispatch status instead of relying on the scheduled-email flag', () => withStaffUi({ isAdmin: true, emailEnabled: false, children: [child], attendance: [], feedback: [] }, async ({ CoachingWorkspace }) => {
  const html = renderToStaticMarkup(React.createElement(CoachingWorkspace, { auth: { ...auth, phase: 'authorized' }, embedded: true }));
  assert.match(html, /Checking email status/);
  assert.doesNotMatch(html, /Daily at 9 PM IST|Gmail sender setup/);
  assert.match(html, /<button[^>]* disabled=""[^>]*>Send attendance email<\/button>/);
}));

test("admin attendance opens inside Team Dashboard even before the register loads", () => withStaffUi(
  { isAdmin: true, emailEnabled: false, children: [child, { ...child, registrationId: "c6fa700e-ce24-4b11-9d5c-7417d7724c01", childName: "Unassigned child", coachEmail: "" }], attendance: [], feedback: [] },
  async (_, vite) => {
    const { AuthorizedAdmin } = await vite.ssrLoadModule("/src/features/admin/AdminPage.jsx");
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      location: new URL("https://uat.letsaimit.com/admin/?view=attendance&date=2026-11-01"),
    } });
    try {
      const html = renderToStaticMarkup(React.createElement(AuthorizedAdmin, { auth: { ...auth, phase: "authorized" } }));
      assert.match(html, /aria-label="Admin navigation"/);
      assert.match(html, /aria-label="Switch workspace from Admin"/);
      assert.match(html, /href="\/coach-dashboard\/"[^>]*>Coach<\/a>/);
      assert.match(html, /aria-current="page"[^>]*><svg[^]*?<span>Attendance<\/span>/);
      assert.match(html, /<h1 tabindex="-1">Attendance<\/h1>/);
      assert.match(html, /type="date"[^>]*value="2026-11-01"/);
      assert.match(html, /Attendance for Sample child/);
      assert.match(html, /Attendance for Unassigned child/);
      assert.match(html, /2 children · Approved enrolments only/);
      assert.match(html, /Send attendance email/);
      assert.match(html, /aria-label="Coaching tools"[^]*?Weekly feedback[^]*?Coach access/);
      assert.doesNotMatch(html, /aria-label="Coaching navigation"|Loading saved requests/);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else delete globalThis.window;
    }
  },
));

test("unloaded coaching state never claims attendance is saved or emails are enabled", () => withStaffUi(null, async ({ CoachingWorkspace }) => {
  const html = renderToStaticMarkup(React.createElement(CoachingWorkspace, { auth }));
  assert.match(html, /Loading coaching records/);
  assert.doesNotMatch(html, /Save attendance|Attendance saved|Daily admin email|Scheduling on/);
}));

test("manual feedback starts from the saved draft, escapes content and cannot publish an empty update", () => withStaffUi(null, async ({ FeedbackEditor, AssignmentEditor }) => {
  const blank = renderToStaticMarkup(React.createElement(FeedbackEditor, { child, weekStart: "2026-11-09", saved: undefined, auth, onSaved() {} }));
  assert.match(blank, /<textarea required="" maxLength="1500"/);
  assert.match(blank, /disabled=""[^>]*>Publish feedback/);
  const saved = renderToStaticMarkup(React.createElement(FeedbackEditor, { child, weekStart: "2026-11-09", saved: { summary: "<script>bad()</script>", nextStep: "Practise passing.", revision: 3 }, auth, onSaved() {} }));
  assert.match(saved, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(saved, /<script>/);
  assert.match(saved, /Practise passing/);
  assert.match(saved, /Load latest/);
  const assignment = renderToStaticMarkup(React.createElement(AssignmentEditor, { child, auth: { ...auth, phase: "authorized" }, onSaved() {} }));
  assert.match(assignment, /value="coach@example\.test"/);
  assert.match(assignment, /Leave the email empty to remove coach access/);
  assert.match(assignment, /One Google account can also be a parent or admin/);
}));

test("losing admin scope removes the coach-access view without a stale private editor", () => withStaffUi(null, async ({ coachingView }) => {
  assert.equal(coachingView("coaches", true), "coaches");
  assert.equal(coachingView("coaches", false), "attendance");
  assert.equal(coachingView("coaches", undefined), "attendance");
  assert.equal(coachingView("feedback", false), "feedback", "assigned coaches keep feedback access independently of admin access");
}));

test("child, week and view navigation cannot discard a dirty editor without confirmation or interrupt its save", () => withStaffUi(null, async ({ mayLeaveTrackerEditor }) => {
  let confirmations = 0;
  const keep = () => { ++confirmations; return false; };
  assert.equal(mayLeaveTrackerEditor({ dirty: true, busy: false }, keep), false);
  assert.equal(confirmations, 1);
  assert.equal(mayLeaveTrackerEditor({ dirty: true, busy: false }, () => true), true);
  assert.equal(mayLeaveTrackerEditor({ dirty: false, busy: false }, () => assert.fail("clean drafts do not need confirmation")), true);
  assert.equal(mayLeaveTrackerEditor({ dirty: true, busy: true }, () => assert.fail("an in-flight save must remain bound to its editor")), false);
}));
