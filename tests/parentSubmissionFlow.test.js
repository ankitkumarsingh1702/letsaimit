import test from "node:test";
import assert from "node:assert/strict";
import { createRegistrationDraft, storeRegistrationDraft, consumeRegistrationDraft, canConfirmRegistrationReceipt } from "../src/features/registration/registrationDraft.js";
import { parentRegistrationResolver } from "../src/features/registration/registrationResolver.js";
import { parseRegistration } from "../src/lib/registrationSchema.js";
import { storeAuthReturnTarget, consumeAuthReturnTarget } from "../src/lib/authReturn.js";
import { readGoogleUser } from "../src/lib/adminAuth.js";
import { submitRegistration } from "../src/lib/leadCapture.js";
import { fetchMyRegistrations } from "../src/features/parent/parentRequests.js";

const id = "7cb18796-e86b-410e-8b17-a080c14fd820";
const google = { id: "parent-test-user", email: "parent@example.test", app_metadata: { provider: "google" } };
const receipt = { ok: true, id: "saved-request", submissionId: id, savedAt: "2026-11-10T08:00:00Z", duplicate: false };
const values = () => ({ ...createRegistrationDraft(), parentName: "Test parent", childName: "Test child", email: google.email, phoneCountry: "US", phone: "2025550123", age: "9", community: "Nambiar Ellegenza", sport: "Basketball", address: "1 Test Street", consent: true, terms: true, billingConsent: true, billingTermsVersion: "current-billing-terms" });
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };

async function modules() {
  const [{ createServer }, React, { renderToStaticMarkup }] = await Promise.all([import("vite"), import("react"), import("react-dom/server")]);
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  const registration = await vite.ssrLoadModule("/src/features/registration/ParentRegistration.jsx");
  return { vite, React, renderToStaticMarkup, registration };
}

test("composed Google handoff resumes unsent answers; fresh consent gates one receipt-backed save and owned refresh", async () => {
  const { vite, registration } = await modules();
  try {
    let currentUser = null;
    const calls = []; const savedRows = [];
    const client = {
      auth: { getUser: async () => ({ data: { user: currentUser } }) },
      rpc(name, args) {
        calls.push(name);
        if (name === "list_my_registrations") return Promise.resolve({ data: savedRows });
        assert.equal(name, "submit_registration");
        return { abortSignal: async () => {
          assert.equal(args.payload.metadata.submissionId, id);
          assert.equal(args.payload.metadata.guardianConsent, true);
          assert.equal(args.payload.metadata.billingConsent, true);
          savedRows.push({ id: receipt.id, submission_id: id, created: receipt.savedAt, review_decision: "pending", metadata: args.payload.metadata });
          return { data: receipt };
        } };
      },
    };
    const tab = storage();
    assert.equal(await readGoogleUser(client), null);
    assert.equal(storeRegistrationDraft("enroll", values(), tab, 1000), true);
    assert.equal(storeAuthReturnTarget("/parent/?resume=enrol", tab, 1000), true);
    assert.deepEqual(calls, [], "the Google handoff has not submitted anything");
    currentUser = google;
    assert.equal(consumeAuthReturnTarget(tab, 1100), "/parent/?resume=enrol");
    const resumed = consumeRegistrationDraft("enroll", tab, 1100);
    const resolver = parentRegistrationResolver("enroll", { billingRequired: true });
    assert.equal(resumed.childName, "Test child");
    assert.deepEqual(Object.keys(resolver(resumed).errors).sort(), ["billingConsent", "consent", "terms"], "resuming is not renewed consent");
    assert.deepEqual(calls, [], "a resumed unsigned draft still has no saved request");
    Object.assign(resumed, { consent: true, terms: true, billingConsent: true, billingTermsVersion: "current-billing-terms" });
    assert.deepEqual(resolver(resumed).errors, {});
    const actor = await readGoogleUser(client);
    const data = { ...parseRegistration("enroll", resumed), billingConsent: resumed.billingConsent, billingTermsVersion: resumed.billingTermsVersion, billingPricingMode: "custom_quote" };
    const saved = await submitRegistration({ formType: "enrol", data, consent: { agreed: true, guardian: true, terms: true }, submissionId: id }, { client, onSaved: () => {} });
    const target = new EventTarget(); let refresh = null;
    target.addEventListener("letsaimit:registration-saved", event => {
      assert.equal(event.detail.userId, actor.id);
      refresh = fetchMyRegistrations({ client, verifyGoogleUser: () => readGoogleUser(client), userId: actor.id });
    });
    assert.equal(registration.notifyVerifiedRegistrationSave({ receipt: saved, submittedUserId: actor.id, verifiedUser: await readGoogleUser(client), target }), true);
    const rows = await refresh;
    assert.equal(rows.length, 1); assert.equal(rows[0].reviewDecision, "pending"); assert.equal(rows[0].childName, "Test child");
    assert.equal(calls.filter(name => name === "submit_registration").length, 1);
    assert.equal(calls.filter(name => name === "list_my_registrations").length, 1);
  } finally { await vite.close(); }
});

test("closing during a committed save still notifies the verified parent without showing a stale success panel", async () => {
  const { vite, registration } = await modules();
  try {
    let finish;
    const client = { rpc: () => ({ abortSignal: () => new Promise(resolve => { finish = () => resolve({ data: receipt }); }) }) };
    const save = submitRegistration({ formType: "enrol", data: values(), consent: { agreed: true, guardian: true, terms: true }, submissionId: id }, { client, onSaved: () => {} });
    const target = new EventTarget(); const events = [];
    target.addEventListener("letsaimit:registration-saved", event => events.push(event.detail));
    const presentation = { submittedUserId: google.id, verifiedUser: { id: google.id, isGoogle: true }, generation: 3, currentGeneration: 4, active: false };
    finish();
    const saved = await save;
    assert.equal(registration.notifyVerifiedRegistrationSave({ receipt: saved, submittedUserId: google.id, verifiedUser: presentation.verifiedUser, target }), true);
    assert.equal(canConfirmRegistrationReceipt(presentation), false);
    assert.deepEqual(events, [{ userId: google.id, requestId: receipt.id }]);
    for (const verifiedUser of [null, { id: "another-parent", isGoogle: true }, { id: google.id, isGoogle: false }]) assert.equal(registration.notifyVerifiedRegistrationSave({ receipt: saved, submittedUserId: google.id, verifiedUser, target }), false);
    assert.equal(events.length, 1, "an account switch cannot emit an old parent's saved notification");
    assert.equal(registration.notifyVerifiedRegistrationSave({ receipt: { ...receipt, ok: false }, submittedUserId: google.id, verifiedUser: presentation.verifiedUser, target }), false);
  } finally { await vite.close(); }
});

test("resumed instructions, visible requests and parent errors state the unfinished step accurately", async () => {
  const { vite, React, renderToStaticMarkup, registration } = await modules();
  try {
    const { OwnRequests, PendingEnrolmentNotice, ParentRequestError } = await vite.ssrLoadModule("/src/features/parent/ParentRequests.jsx");
    const { SiteActionsProvider } = await vite.ssrLoadModule("/src/context/SiteActions.jsx");
    const copy = renderToStaticMarkup(React.createElement(registration.RegistrationResumeNotice));
    assert.match(copy, /Not sent yet/); assert.match(copy, /Confirm consent, then send/);
    const auth = { user: { id: google.id, email: google.email, isGoogle: true }, phase: "denied", client: null };
    const page = renderToStaticMarkup(React.createElement(SiteActionsProvider, { value: { openForm: () => {} } }, React.createElement(OwnRequests, { auth })));
    assert.match(page, /<details class="parent-request-history" open=""/);
    const error = renderToStaticMarkup(React.createElement(ParentRequestError, { error: "Connection lost. Try again.", loaded: true }));
    assert.match(error, /role="alert"/); assert.match(error, /Showing your previously loaded requests/);
    const pending = [{ formType: "enrol", reviewDecision: "pending" }, { formType: "trial", reviewDecision: "pending" }, { formType: "enrol", reviewDecision: "accepted" }];
    assert.match(renderToStaticMarkup(React.createElement(PendingEnrolmentNotice, { loaded: true, rows: pending })), /Awaiting approval · 1 enrolment/);
    assert.equal(renderToStaticMarkup(React.createElement(PendingEnrolmentNotice, { loaded: false, rows: pending })), "");
    assert.equal(renderToStaticMarkup(React.createElement(PendingEnrolmentNotice, { loaded: true, rows: pending.slice(1) })), "");
  } finally { await vite.close(); }
});
