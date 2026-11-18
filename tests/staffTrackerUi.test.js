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
  assert.match(html, /Sample community <span>· 1 student<\/span>/);
  assert.match(html, /data-attendance="present"/);
  assert.match(html, /data-attendance="absent"/);
  assert.match(html, />Email parents<\/button>/);
  assert.doesNotMatch(html, /Email staff|href="\/admin\/"/);
  assert.doesNotMatch(html, /Gmail[^<]*ready|Email[^<]*sent|Attendance saved/);
}));

test('Students keeps staff delivery and roster marking together while dispatch status loads', () => withStaffUi({ isAdmin: true, emailEnabled: false, children: [child], attendance: [], feedback: [] }, async (_, vite) => {
  const { default: StudentsWorkspace } = await vite.ssrLoadModule("/src/features/tracker/StudentsWorkspace.jsx");
  const html = renderToStaticMarkup(React.createElement(StudentsWorkspace, { auth: { ...auth, phase: 'authorized' } }));
  assert.match(html, /Checking email status/);
  assert.doesNotMatch(html, /Daily at 9 PM IST|Gmail sender setup/);
  assert.match(html, /<button[^>]* disabled=""[^>]*>Email staff<\/button>/);
  assert.match(html, /Attendance tools.*Mark shown present.*Email parents/);
}));

test("a dated legacy attendance link opens the relevant day inside Students", () => withStaffUi(
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
      assert.match(html, /aria-current="page"[^>]*><svg[^]*?<span>Students<\/span>/);
      assert.match(html, /<h1 tabindex="-1">Students<\/h1>/);
      assert.match(html, /type="date"[^>]*value="2026-11-01"/);
      assert.match(html, /Attendance for Sample child/);
      assert.match(html, /Attendance for Unassigned child/);
      assert.match(html, /Sample community <span>· 2 students<\/span>/);
      assert.match(html, /Email staff/);
      assert.doesNotMatch(html, /<span>Attendance<\/span>/);
      assert.doesNotMatch(html, /aria-label="Coaching navigation"|Loading saved requests/);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else delete globalThis.window;
    }
  },
));

test("unloaded coaching state never claims attendance is saved or emails are enabled", () => withStaffUi(null, async ({ CoachingWorkspace }) => {
  const html = renderToStaticMarkup(React.createElement(CoachingWorkspace, { auth }));
  assert.match(html, /Loading students/);
  assert.doesNotMatch(html, /Save attendance|Attendance saved|Daily admin email|Scheduling on/);
}));

test("Students opens separately in Admin and groups attendance by society", async () => {
  const societies = ["Nambiar Bellezea", "Nambiar Ellegenza"];
  const children = societies.flatMap((community, group) => Array.from({ length: 5 }, (_, index) => ({
    ...child,
    registrationId: `c6fa700e-ce24-4b11-9d5c-7417d7724c${group}0${index}`,
    childName: `${group === 0 ? "Bellezea" : "Ellegenza"} student ${index + 1}`,
    community,
  })));
  await withStaffUi({ children, attendance: [], feedback: [], isAdmin: true, emailEnabled: false }, async (_, vite) => {
    const { AuthorizedAdmin } = await vite.ssrLoadModule("/src/features/admin/AdminPage.jsx");
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: new URL("https://uat.letsaimit.com/admin/?view=students") } });
    try {
      const html = renderToStaticMarkup(React.createElement(AuthorizedAdmin, { auth: { ...auth, phase: "authorized" } }));
      assert.match(html, /aria-current="page"[^>]*><svg[^]*?<span>Students<\/span>/);
      assert.match(html, /Nambiar Bellezea <span>· 5 students<\/span>/);
      assert.match(html, /Nambiar Ellegenza <span>· 5 students<\/span>/);
      assert.ok(html.indexOf("Bellezea student 5") < html.indexOf("<h2>Nambiar Ellegenza"));
      assert.equal((html.match(/data-attendance="present"/g) || []).length, 10);
      assert.equal((html.match(/data-attendance="absent"/g) || []).length, 10);
      assert.match(html, /<option value="" selected="">All societies<\/option>/);
      assert.doesNotMatch(html, /Loading saved requests|Search requests|<span>Attendance<\/span>/);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else delete globalThis.window;
    }
  });
});

test("manual feedback starts from the saved draft, escapes content and cannot publish an empty update", () => withStaffUi(null, async (_, vite) => {
  const { FeedbackEditor, AssignmentEditor } = await vite.ssrLoadModule("/src/features/tracker/CoachingEditors.jsx");
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
  assert.match(assignment, /Coach assignment/);
}));

test("both coaching societies stay visible even when one roster is empty", () => withStaffUi(null, async (_, vite) => {
  const { groupStudents } = await vite.ssrLoadModule("/src/features/tracker/StudentsWorkspace.jsx");
  const assigned = [{ ...child, community: " Nambiar   Bellezea " }];
  assert.deepEqual(groupStudents(assigned).map(group => [group.society, group.children.length]), [
    ["Nambiar Bellezea", 1], ["Nambiar Ellegenza", 0],
  ]);
  assert.deepEqual(groupStudents(assigned, "", "nambiar ellegenza").map(group => group.children.length), [0]);
}));

test("child, week and view navigation cannot discard a dirty editor without confirmation or interrupt its save", () => withStaffUi(null, async (_, vite) => {
  const { mayLeaveTrackerEditor } = await vite.ssrLoadModule("/src/features/tracker/CoachingEditors.jsx");
  let confirmations = 0;
  const keep = () => { ++confirmations; return false; };
  assert.equal(mayLeaveTrackerEditor({ dirty: true, busy: false }, keep), false);
  assert.equal(confirmations, 1);
  assert.equal(mayLeaveTrackerEditor({ dirty: true, busy: false }, () => true), true);
  assert.equal(mayLeaveTrackerEditor({ dirty: false, busy: false }, () => assert.fail("clean drafts do not need confirmation")), true);
  assert.equal(mayLeaveTrackerEditor({ dirty: true, busy: true }, () => assert.fail("an in-flight save must remain bound to its editor")), false);
}));
