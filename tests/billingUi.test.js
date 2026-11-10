import test from "node:test";
import assert from "node:assert/strict";
import { billingInvoice, billingSnapshot, safeRazorpayUrl, fetchBilling, stopMonthlyBilling, filterBillingInvoices, billingCsv, formatMoney, publicBillingTerms, fetchBillingTerms } from "../src/features/billing/billingData.js";
import { parentRegistrationResolver } from "../src/features/registration/registrationResolver.js";
import { createRegistrationDraft, storeRegistrationDraft, consumeRegistrationDraft } from "../src/features/registration/registrationDraft.js";

const row = {
  id: "inv-local-1", registration_id: "registration-1", invoice_number: "LAI-202611-001", child_name: "Test child",
  parent_name: "Test parent", parent_email: "parent@example.test", community: "Test community", sport: "Basketball",
  currency: "INR", status: "pending", created_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-10T10:00:00Z",
  period_start: "2026-11-01", due_date: "2026-11-14T18:29:59Z", amount_paise: 100, base_amount_paise: 100,
  late_fee_paise: 0, paid_paise: 0, refunded_paise: 0, payment_url: "https://rzp.io/i/example", invoice_url: "https://rzp.io/i/example", kind: "monthly",
};
const snapshot = {
  invoices: [row], accounts: [{ id: "account-1", registration_id: row.registration_id, status: "active", revision: 1, monthly_amount_paise: 100, next_month_amount_paise: 100, next_effective_month: "2026-12-01", pricing_model: "legacy" }],
  settings: { regular_amount_paise: 60000, charge_amount_paise: 100, team_testing: true, due_day: 5, late_fee_policy: "disabled", late_fee_paise: 10000 },
  summary: { captured_paise: 0, refunded_paise: 0, outstanding_paise: 100, paid_count: 0, pending_count: 1, overdue_count: 0 },
};
const user = { id: "parent-1", isGoogle: true };
const terms = { enabled: true, pricing_model: "custom_quote", default_amount_paise: 600000, late_fee_paise: 10000, late_fee_policy: "daily", late_fees_enabled: true, due_day: 5, version: `billing-2026-11-10-${"a".repeat(64)}` };

test("the enrolment quote policy and consent version come from public server terms", async () => {
  let called = "";
  const saved = await fetchBillingTerms({ rpc: async name => { called = name; return { data: terms }; } });
  assert.equal(called, "get_billing_terms"); assert.equal(saved.pricingModel, "custom_quote"); assert.equal(saved.defaultAmountPaise, 600000); assert.equal(saved.lateFeesEnabled, true); assert.equal(saved.version, terms.version);
  for (const change of [{ default_amount_paise: -1 }, { version: "client-chosen" }, { due_day: 6 }, { late_fees_enabled: "false" }, { pricing_model: "legacy" }]) assert.throws(() => publicBillingTerms({ ...terms, ...change }), /could not load/);
  await assert.rejects(fetchBillingTerms({ rpc: async () => ({ error: { code: "offline" } }) }), /could not load/);
});

test("enabled monthly billing requires separate consent and OAuth never carries it forward", () => {
  const draft = { ...createRegistrationDraft(), childName: "Test child", parentName: "Test parent", phoneCountry: "US", phone: "2025550123", age: "9", community: "Nambiar Ellegenza", sport: "Basketball", email: "parent@example.test", address: "1 Test Street", consent: true, terms: true, billingConsent: false, billingTermsVersion: terms.version };
  assert.equal(parentRegistrationResolver("enroll")(draft).errors.billingConsent, undefined, "disabled billing remains an enquiry without payment authority");
  assert.match(parentRegistrationResolver("enroll", { billingRequired: true })(draft).errors.billingConsent.message, /monthly payment/);
  draft.billingConsent = true;
  assert.deepEqual(parentRegistrationResolver("enroll", { billingRequired: true })(draft).errors, {});
  const values = new Map(); const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key), removeItem: key => values.delete(key) };
  assert.equal(storeRegistrationDraft("enroll", draft, storage, 1000), true);
  const resumed = consumeRegistrationDraft("enroll", storage, 1100);
  assert.equal(resumed.billingConsent, false); assert.equal(resumed.billingTermsVersion, ""); assert.equal(resumed.consent, false); assert.equal(resumed.terms, false);
});

test("Razorpay links allow only HTTPS provider hosts without embedded credentials", () => {
  assert.equal(safeRazorpayUrl("https://rzp.io/i/abc"), "https://rzp.io/i/abc");
  assert.equal(safeRazorpayUrl("https://pages.razorpay.com/a"), "https://pages.razorpay.com/a");
  for (const value of ["javascript:alert(1)", "http://rzp.io/i/abc", "https://rzp.io.evil.example/a", "https://evilrazorpay.com/a", "https://user:secret@rzp.io/a", "https://rzp.io:8443/a", "//rzp.io/a"]) assert.equal(safeRazorpayUrl(value), null);
});

test("a saved invoice preserves paise and server status rather than assuming checkout success", () => {
  const invoice = billingInvoice(row);
  assert.equal(invoice.amountPaise, 100);
  assert.equal(invoice.status, "pending");
  assert.equal(invoice.paidPaise, 0);
  assert.equal(formatMoney(100), "₹1");
  assert.equal(formatMoney(60000), "₹600");
  for (const change of [{ amount_paise: 1.5 }, { amount_paise: -100 }, { amount_paise: 60000 }, { refunded_paise: 100 }, { status: "checkout-returned" }, { currency: "USD" }, { due_date: null }]) assert.throws(() => billingInvoice({ ...row, ...change }), /could not be confirmed/);
  assert.equal(billingInvoice({ ...row, payment_url: "https://evil.example/" }).paymentUrl, null);
});

test("a missing financial snapshot never becomes a fabricated zero-revenue dashboard", () => {
  assert.equal(billingSnapshot(snapshot, { admin: true }).summary.outstandingPaise, 100);
  assert.equal(billingSnapshot(snapshot).summary, null);
  assert.throws(() => billingSnapshot({ ...snapshot, summary: null }, { admin: true }), /could not be confirmed/);
  assert.throws(() => billingSnapshot({ ...snapshot, settings: null }), /could not load/);
  assert.throws(() => billingSnapshot({ ...snapshot, accounts: [{ ...snapshot.accounts[0], revision: 0 }] }), /could not be confirmed/);
});

test("parent and admin use separate ownership-enforcing RPCs with identity checks on both sides", async () => {
  for (const admin of [false, true]) {
    const calls = []; let verified = 0; let access = 0;
    const result = await fetchBilling({ admin, userId: user.id, verifyGoogleUser: async () => { ++verified; return user; }, checkAccess: async () => { ++access; return true; }, client: { rpc: async name => { calls.push(name); return { data: snapshot, error: null }; } } });
    assert.deepEqual(calls, [admin ? "list_admin_billing" : "list_my_billing"]);
    assert.equal(verified, 2); assert.equal(access, admin ? 2 : 0);
    assert.equal(result.invoices[0].paidPaise, 0);
  }
});

test("revoked or switched identity discards the returned financial data", async () => {
  let calls = 0;
  const base = { userId: user.id, verifyGoogleUser: async () => user, client: { rpc: async () => { ++calls; return { data: snapshot }; } } };
  await assert.rejects(fetchBilling({ ...base, admin: true, checkAccess: async () => false }), { code: "access_denied" });
  assert.equal(calls, 0);
  let verification = 0;
  await assert.rejects(fetchBilling({ ...base, verifyGoogleUser: async () => ++verification === 1 ? user : { ...user, id: "another-parent" } }), { code: "identity_changed" });
  assert.equal(calls, 1);
  await assert.rejects(fetchBilling({ ...base, client: { rpc: async () => ({ error: { code: "42501" } }) } }), { code: "access_denied" });
});

test("billing cancellation requires current admin identity and a saved advanced revision", async () => {
  const account = billingSnapshot(snapshot).accounts[0];
  const options = { account, userId: user.id, verifyGoogleUser: async () => user, checkAccess: async () => true };
  let calls = 0;
  const result = await stopMonthlyBilling({ ...options, client: { rpc: async (name, args) => {
    ++calls; assert.equal(name, "cancel_billing_account"); assert.deepEqual(args, { p_registration_id: row.registration_id, p_expected_revision: 1 });
    return { data: { registration_id: row.registration_id, status: "cancelled", revision: 2 } };
  } } });
  assert.equal(result.status, "cancelled"); assert.equal(calls, 1);
  await assert.rejects(stopMonthlyBilling({ ...options, checkAccess: async () => false, client: { rpc: async () => { throw new Error("must not call"); } } }), /Admin access/);
  await assert.rejects(stopMonthlyBilling({ ...options, client: { rpc: async () => ({ data: { registration_id: row.registration_id, status: "cancelled", revision: 1 } }) } }), /could not be confirmed/);
  await assert.rejects(stopMonthlyBilling({ ...options, client: { rpc: async () => ({ error: { code: "PT409" } }) } }), /Billing changed/);
});

test("invoice CSV exports the filtered saved financial values and escapes formulas", () => {
  const invoices = [billingInvoice({ ...row, parent_name: '=HYPERLINK("bad")' }), billingInvoice({ ...row, id: "paid-2", status: "paid", paid_paise: 100 })];
  const paid = filterBillingInvoices(invoices, { status: "paid", query: "Basketball" });
  assert.equal(paid.length, 1);
  const csv = billingCsv(paid);
  assert.match(csv, /total_paise/); assert.match(csv, /paid_paise/); assert.match(csv, /"100"/); assert.doesNotMatch(csv, /HYPERLINK/);
  assert.match(billingCsv(invoices), /'=HYPERLINK/);
  assert.match(billingCsv([{ ...invoices[0], parentName: "\u200B=HYPERLINK(bad)" }]), /'\u200B=HYPERLINK/);
});

test("review copy distinguishes free trials from paid enrolments", async () => {
  const [{ createServer }, React, { renderToStaticMarkup }] = await Promise.all([import("vite"), import("react"), import("react-dom/server")]);
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: ReviewDecision } = await vite.ssrLoadModule("/src/features/admin/ReviewDecision.jsx");
    const props = { row: { id: "review-1", formType: "trial", reviewDecision: "pending", parentName: "Test parent" }, canReview: true, onReview: async () => {} };
    const trial = renderToStaticMarkup(React.createElement(ReviewDecision, props));
    assert.match(trial, /Free trial\. No fee/); assert.doesNotMatch(trial, /Monthly fee/);
    const enrol = renderToStaticMarkup(React.createElement(ReviewDecision, { ...props, row: { ...props.row, formType: "enrol" } }));
    assert.match(enrol, /New consent needed/); assert.match(enrol, /disabled=""[^>]*>Accept/);
  } finally { await vite.close(); }
});
