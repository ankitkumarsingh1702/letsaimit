import test from "node:test";
import assert from "node:assert/strict";
import { captureMonthlyFeeBaseline, DEFAULT_MONTHLY_FEE_PAISE, monthlyFeeBaselineChanged, monthlyFeeInput, parseMonthlyFeeInput } from "../src/features/billing/fee-model.js";
import { billingAccount, billingInvoice, groupParentInvoices, setNextMonthlyFee, upcomingBillingMonth } from "../src/features/billing/billingData.js";
import { captureReviewDraft, reviewArguments, reviewDraftChanged } from "../src/features/admin/review-contract.js";
import { saveRequestReview } from "../src/features/admin/adminTransport.js";
import { toAdminRequest } from "../src/features/admin/admin-model.js";

const registrationId = "0d2560a9-0049-45e1-8ea0-4a6e016b374c";
const accountRecord = { id: "account-1", registration_id: registrationId, status: "active", revision: 3, parent_name: "Test parent", child_name: "Test child", monthly_amount_paise: 600000, next_month_amount_paise: 600000, next_effective_month: "2026-12-01", pricing_model: "custom_quote" };
const actor = { id: "admin-1", isGoogle: true };
const raw = { id: "invoice-base", registration_id: registrationId, invoice_number: "LAI-001", child_name: "Test child", parent_name: "Test parent", parent_email: "parent@example.test", community: "Test community", sport: "Basketball", currency: "INR", status: "overdue", period_start: "2026-11-01", due_date: "2026-11-05T18:29:59Z", created_at: "2026-11-01T03:30:00Z", base_amount_paise: 600000, late_fee_paise: 0, amount_paise: 600000, paid_paise: 0, refunded_paise: 0, kind: "monthly", payment_url: "https://rzp.io/i/base", invoice_url: "https://rzp.io/i/base" };
const record = { id: registrationId, revision: 4, review_decision: "accepted", reviewed_at: "2026-11-10T10:00:00Z", status: "new", metadata: { formType: "enrol", billingPricingMode: "custom_quote", billingConsent: true }, approved_monthly_amount_paise: 600000 };

test("monthly fee input defaults to ₹6000 and parses paise without rounding", () => {
  assert.equal(DEFAULT_MONTHLY_FEE_PAISE, 600000); assert.equal(monthlyFeeInput(DEFAULT_MONTHLY_FEE_PAISE), "6000");
  for (const [input, amount] of [["6000", 600000], ["6000.01", 600001], ["1", 100], ["1.10", 110], ["100000", 10000000]]) assert.equal(parseMonthlyFeeInput(input), amount);
  for (const input of ["", "0", "0.99", "-1", "1e3", "6000.001", "6,000", "₹6000", "Infinity", "100000.01", "0001", 6000]) assert.throws(() => parseMonthlyFeeInput(input), /Enter ₹1/);
  assert.equal(monthlyFeeInput(100), "1"); assert.equal(monthlyFeeInput(10001), "100.01"); assert.equal(monthlyFeeInput(0), "");
});

test("review sends explicit fee or explicit no-fee and confirms the exact saved quote", async () => {
  assert.deepEqual(reviewArguments(registrationId, "accepted", 3, 600000), { p_id: registrationId, p_decision: "accepted", p_expected_revision: 3, p_monthly_amount_paise: 600000 });
  assert.equal(reviewArguments(registrationId, "declined", 3).p_monthly_amount_paise, null);
  assert.throws(() => reviewArguments(registrationId, "declined", 3, 600000));
  for (const amount of [0, 99, 1.5, 10000001]) assert.throws(() => reviewArguments(registrationId, "accepted", 3, amount));
  let calls = 0;
  const result = await saveRequestReview({ rpc: async (name, args) => { ++calls; assert.equal(name, "review_registration"); assert.equal(args.p_monthly_amount_paise, 600000); return { data: record }; } }, registrationId, "accepted", 3, 600000);
  assert.equal(result.ok, true); assert.equal(calls, 1); assert.equal(result.row.status, "new", "approval is not payment");
  for (const amount of [undefined, 100]) await assert.rejects(saveRequestReview({ rpc: async () => ({ data: { ...record, approved_monthly_amount_paise: amount } }) }, registrationId, "accepted", 3, 600000), /approved fee could not be confirmed/);
});

test("old fixed or missing consent is not reinterpreted as a custom quote", async () => {
  const legacy = toAdminRequest({ ...record, metadata: { formType: "enrol", billingConsent: true, billingTerms: { charge_amount_paise: 100 } } });
  assert.equal(legacy.billing.pricingModel, "legacy");
  assert.equal(toAdminRequest(record).billing.pricingModel, "custom_quote");
  const response = await saveRequestReview({ rpc: async () => ({ error: { code: "PT412", message: "internal detail" } }) }, registrationId, "accepted", 3, 600000);
  assert.equal(response.ok, false); assert.equal(response.code, "consent_required"); assert.match(response.error, /New consent needed/); assert.doesNotMatch(response.error, /internal detail/);
});

test("next-month changes use the current revision and preserve existing invoice/current amounts", async () => {
  const account = billingAccount(accountRecord); let verified = 0; let access = 0;
  const result = await setNextMonthlyFee({ account, amountPaise: 650000, userId: actor.id, verifyGoogleUser: async () => { ++verified; return actor; }, checkAccess: async () => { ++access; return true; }, client: { rpc: async (name, args) => {
    assert.equal(name, "set_monthly_coaching_fee"); assert.deepEqual(args, { p_registration_id: registrationId, p_amount_paise: 650000, p_expected_revision: 3 });
    return { data: { ...accountRecord, next_month_amount_paise: 650000, revision: 4 } };
  } } });
  assert.equal(result.monthlyAmountPaise, 600000); assert.equal(result.nextMonthAmountPaise, 650000); assert.equal(result.nextEffectiveMonth, "2026-12-01"); assert.equal(verified, 2); assert.equal(access, 2);
});

test("live account and review refreshes never silently rebase an open fee draft", () => {
  const current = billingAccount(accountRecord);
  const baseline = captureMonthlyFeeBaseline(current);
  const savedElsewhere = { ...current, revision: 4, nextMonthAmountPaise: 700000 };
  assert.equal(baseline.revision, 3); assert.equal(monthlyFeeBaselineChanged(baseline, savedElsewhere), true);
  assert.equal(baseline.nextMonthAmountPaise, 600000); assert.equal(Object.isFrozen(baseline), true);
  assert.equal(monthlyFeeBaselineChanged(baseline, { ...current, nextEffectiveMonth: "2027-01-01" }), true, "month rollover also needs explicit review");
  assert.equal(captureMonthlyFeeBaseline(savedElsewhere).revision, 4, "only explicit use-latest starts a new baseline");
  const pending = { ...toAdminRequest(record), reviewDecision: "pending", revision: 3 };
  const review = captureReviewDraft(pending, "accepted");
  const refreshed = { ...pending, revision: 4 };
  assert.equal(reviewDraftChanged(review, refreshed), true);
  assert.equal(review.expectedRevision, 3);
  assert.equal(reviewArguments(review.id, review.decision, review.expectedRevision, 500000).p_expected_revision, 3);
  assert.equal(captureReviewDraft(refreshed, "accepted").expectedRevision, 4);
  assert.equal(reviewDraftChanged(review, { ...pending, reviewDecision: "accepted" }), true);
});

test("legacy, revoked and conflicting fee changes never show a successful save", async () => {
  const options = { account: billingAccount(accountRecord), amountPaise: 100, userId: actor.id, verifyGoogleUser: async () => actor, checkAccess: async () => true };
  await assert.rejects(setNextMonthlyFee({ ...options, account: { ...options.account, pricingModel: "legacy" }, client: { rpc: () => assert.fail("legacy fee must not mutate") } }), /Check the monthly fee/);
  await assert.rejects(setNextMonthlyFee({ ...options, checkAccess: async () => false, client: { rpc: () => assert.fail("revoked member must not mutate") } }), /Admin access/);
  await assert.rejects(setNextMonthlyFee({ ...options, client: { rpc: async () => ({ error: { code: "PT409" } }) } }), /Fee changed/);
  await assert.rejects(setNextMonthlyFee({ ...options, client: { rpc: async () => ({ data: { ...accountRecord, monthly_amount_paise: 100, next_month_amount_paise: 100, revision: 4 } }) } }), /could not be confirmed/);
  let checks = 0;
  await assert.rejects(setNextMonthlyFee({ ...options, verifyGoogleUser: async () => ++checks === 1 ? actor : { ...actor, id: "another-admin" }, client: { rpc: async () => ({ data: { ...accountRecord, next_month_amount_paise: 100, revision: 4 } }) } }), /Admin access/);
});

test("next-month totals keep old unpaid invoices separate and reject an inconsistent total", () => {
  const dto = { month: "2026-12-01", children: [{ registration_id: registrationId, child_name: "Test child", parent_name: "Test parent", monthly_fee_paise: 600000 }], total_paise: 600000, old_pending_paise: 620000, old_pending_count: 3 };
  const upcoming = upcomingBillingMonth(dto);
  assert.equal(upcoming.totalPaise, 600000); assert.equal(upcoming.oldPendingPaise, 620000); assert.equal(upcoming.children.length, 1);
  assert.throws(() => upcomingBillingMonth({ ...dto, total_paise: 1220000 }), /total could not be confirmed/);
});

test("parent groups one child/month without losing separately payable native invoices", () => {
  const invoices = [billingInvoice(raw), ...[1, 2].map(index => billingInvoice({ ...raw, id: `late-${index}`, invoice_number: `LATE-${index}`, kind: "late_fee", base_amount_paise: 0, late_fee_paise: 10000, amount_paise: 10000, payment_url: `https://rzp.io/i/late${index}`, invoice_url: `https://rzp.io/i/late${index}` }))];
  const [group] = groupParentInvoices(invoices);
  assert.equal(group.invoices.length, 3); assert.equal(group.feesPaise, 600000); assert.equal(group.lateFeePaise, 20000); assert.equal(group.totalPaise, 620000); assert.equal(group.pendingPaise, 620000); assert.equal(group.status, "overdue");
  assert.equal(groupParentInvoices([...invoices, billingInvoice({ ...raw, id: "another-child", registration_id: "another-child", child_name: "Test child" })]).length, 2, "same display name is not an ownership key");
  const cancelled = billingInvoice({ ...raw, id: "cancelled-old", status: "cancelled" });
  assert.equal(groupParentInvoices([...invoices, cancelled])[0].totalPaise, 620000);
  const refunded = groupParentInvoices([billingInvoice({ ...raw, status: "refunded", paid_paise: 600000, refunded_paise: 600000 })])[0];
  assert.equal(refunded.pendingPaise, 0); assert.equal(refunded.status, "refunded");
  const paidMonthly = billingInvoice({ ...raw, status: "paid", paid_paise: 600000 });
  const lateOnly = billingInvoice({ ...raw, id: "late-only", kind: "late_fee", due_date: "2026-11-08T18:29:59Z", base_amount_paise: 0, late_fee_paise: 10000, amount_paise: 10000 });
  assert.equal(groupParentInvoices([paidMonthly, lateOnly])[0].dueDate, raw.due_date, "monthly row keeps the programme due date; fee dates stay in invoice details");
});

test("actual compact components expose exact payment links, not an aggregate amount on a smaller invoice", async () => {
  const [{ createServer }, React, { renderToStaticMarkup }] = await Promise.all([import("vite"), import("react"), import("react-dom/server")]);
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { ParentMonthRows, MonthDetails, UpcomingMonth } = await vite.ssrLoadModule("/src/features/billing/BillingPanel.jsx");
    const { default: ReviewDecision } = await vite.ssrLoadModule("/src/features/admin/ReviewDecision.jsx");
    const { QuotedBillingPolicy } = await vite.ssrLoadModule("/src/features/registration/ParentRegistration.jsx");
    const base = billingInvoice(raw), late = billingInvoice({ ...raw, id: "late-1", kind: "late_fee", base_amount_paise: 0, late_fee_paise: 10000, amount_paise: 10000, payment_url: "https://rzp.io/i/late1", invoice_url: "https://rzp.io/i/late1" });
    const groups = groupParentInvoices([base, late]);
    const rows = renderToStaticMarkup(React.createElement(ParentMonthRows, { groups, onSelect: () => {} }));
    assert.match(rows, /View payments/); assert.doesNotMatch(rows, /href="https:\/\/rzp.io\/i\/base"/);
    assert.equal((rows.match(/<tr>/g) || []).length, 2, "one header plus one child/month row");
    const details = renderToStaticMarkup(React.createElement(MonthDetails, { group: groups[0], onClose: () => {} }));
    assert.match(details, /href="https:\/\/rzp.io\/i\/base"[^>]*>Pay ₹6,000/); assert.match(details, /href="https:\/\/rzp.io\/i\/late1"[^>]*>Pay ₹100/); assert.doesNotMatch(details, />Pay ₹6,100/);
    const paidBase = { ...base, status: "paid", paidPaise: 600000 };
    const onlyLate = renderToStaticMarkup(React.createElement(ParentMonthRows, { groups: groupParentInvoices([paidBase, late]), onSelect: () => {} }));
    assert.match(onlyLate, /href="https:\/\/rzp.io\/i\/late1"[^>]*>Pay ₹100/);
    const pending = toAdminRequest({ ...record, review_decision: "pending", reviewed_at: null });
    const approval = renderToStaticMarkup(React.createElement(ReviewDecision, { row: pending, initialDecision: "accepted", canReview: true, onReview: async () => {} }));
    assert.match(approval, /value="6000"/); assert.match(approval, /Approve · ₹6,000\/month/);
    const trial = renderToStaticMarkup(React.createElement(ReviewDecision, { row: { ...pending, formType: "trial" }, initialDecision: "accepted", canReview: true, onReview: async () => {} }));
    assert.doesNotMatch(trial, /Monthly fee|value="6000"/);
    const policy = renderToStaticMarkup(React.createElement(QuotedBillingPolicy, { lateFeePaise: 10000 }));
    assert.match(policy, /Fee confirmed on approval/); assert.match(policy, /First payment due then/); assert.match(policy, /pay 1–5 in advance/); assert.match(policy, /₹100\/day/); assert.match(policy, /No automatic debit/); assert.doesNotMatch(policy, /Team payment|Regular price|₹600(?:\s|<)/);
    const upcoming = renderToStaticMarkup(React.createElement(UpcomingMonth, { upcoming: { month: "2026-12-01", children: [{ registrationId, childName: "Test child", parentName: "Test parent", monthlyFeePaise: 600000 }], totalPaise: 600000, oldPendingPaise: 620000, oldPendingCount: 3 } }));
    assert.match(upcoming, /Next month total/); assert.match(upcoming, /Older unpaid invoices/); assert.match(upcoming, /₹6,000/); assert.match(upcoming, /₹6,200/);
  } finally { await vite.close(); }
});
