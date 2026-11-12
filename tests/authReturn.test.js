import test from "node:test";
import assert from "node:assert/strict";
import { validateAuthReturnTarget, storeAuthReturnTarget, consumeAuthReturnTarget } from "../src/lib/authReturn.js";

function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}

test("OAuth return accepts exact parent/coaching destinations or an exact admin review intent", () => {
  for (const target of ["/parent/", "/parent/?resume=trial", "/parent/?resume=enrol", "/register/?resume=enrol", "/parent/?view=tracker", "/parent/?view=tracking", "/parent/?view=payments", "/parent/?view=requests", "/parent/?view=account", "/admin/", "/coach-dashboard/", "/coach-dashboard/?date=2026-11-13"]) assert.equal(validateAuthReturnTarget(target), target);
  assert.equal(validateAuthReturnTarget("/admin/?requestedDecision=accept&requestId=20000000-0000-4000-8000-000000000001"), "/admin/?requestId=20000000-0000-4000-8000-000000000001&requestedDecision=accept");
});

test("OAuth return rejects open redirects, arbitrary queries, duplicated keys and credential data", () => {
  for (const target of [
    "https://evil.example/parent/", "//evil.example", "/\\evil.example", "/parent/#fragment", "/parent/?next=https://evil.example", "/parent/?resume=enroll", "/parent/?resume=trial&resume=enrol", "/parent/?code=secret", "/register/?resume=trial", "/register/?resume=enrol&code=secret", "/parent/?access_token=secret", "/admin/?requestId=bad&requestedDecision=accept", "/admin/?requestId=20000000-0000-4000-8000-000000000001&requestedDecision=accepted", "/admin/?requestId=20000000-0000-4000-8000-000000000001&requestedDecision=accept&next=evil", "/parent/\n", "/parent/other", "/coach/",
  ]) assert.equal(validateAuthReturnTarget(target), null, target);
  for (const target of ['/coach-dashboard/?role=admin', '/coach-dashboard/?next=evil', '/coach-dashboard/?access_token=secret', '/coach-dashboard/?date=2026-02-30', '/coach-dashboard/?date=2026-11-13&date=2026-11-12']) assert.equal(validateAuthReturnTarget(target), null);
});

test("stored return is session-scoped, consumed once, and expires after thirty minutes", () => {
  const storage = memoryStorage();
  assert.equal(storeAuthReturnTarget("/parent/?resume=enrol", storage, 1000), true);
  assert.equal(consumeAuthReturnTarget(storage, 1001), "/parent/?resume=enrol");
  assert.equal(consumeAuthReturnTarget(storage, 1002), null);
  storeAuthReturnTarget("/parent/", storage, 1000);
  assert.equal(consumeAuthReturnTarget(storage, 1000 + 30 * 60 * 1000), null);
  storeAuthReturnTarget("/parent/", storage, 1000);
  assert.equal(consumeAuthReturnTarget(storage, 999), null);
});

test("invalid target clears an earlier return; blocked storage is a safe fallback", () => {
  const storage = memoryStorage();
  storeAuthReturnTarget("/parent/", storage, 1000);
  assert.equal(storeAuthReturnTarget("//evil.example", storage, 1001), false);
  assert.equal(consumeAuthReturnTarget(storage, 1002), null);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(storeAuthReturnTarget("/parent/", blocked), false);
  assert.equal(consumeAuthReturnTarget(blocked), null);
});
