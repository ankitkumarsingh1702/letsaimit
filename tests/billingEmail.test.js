import test from "node:test";
import assert from "node:assert/strict";
import { buildBillingEmail } from "../supabase/functions/_shared/billing-email.js";

const invoice = { id: "f84940a4-e4cb-4ebf-88cb-e63537834565", currency: "INR", parent_name: "Synthetic Parent", receipt: "LAIf84940a4e4cb4ebf88cbe63537834565", amount_paise: 100, paid_paise: 100, refunded_paise: 0, period_start: "2026-12-01", due_date: "2026-12-05", payment_url: "https://rzp.io/i/synthetic", invoice_url: "https://rzp.io/i/synthetic" };
const options = { invoice, dashboardOrigin: "https://uat.letsaimit.com", teamTesting: true };

test("invoice email is minimal, branded, and makes the real ₹1 team amount clear", () => {
  const email = buildBillingEmail({ ...options, kind: "send_invoice" });
  assert.equal(email.subject, "LetsAimIt: Monthly fee"); assert.match(email.text, /Amount: ₹1/); assert.match(email.text, /Due by: 5 Dec 2026/);
  assert.match(email.text, /Regular fee: ₹600\/month/); assert.match(email.text, /Late fees are not charged/);
  assert.match(email.text, /Pay now: https:\/\/rzp.io\/i\/synthetic/); assert.match(email.text, /Your payments: https:\/\/uat.letsaimit.com\/parent\//);
  assert.doesNotMatch(email.subject, /UAT|demo|preview/i); assert.doesNotMatch(email.html, /auto-debit|automatically charged/i);
});

test("reminders, paid receipts and refunds use separate saved monetary facts", () => {
  const reminder = buildBillingEmail({ ...options, kind: "send_reminder" });
  assert.equal(reminder.subject, "LetsAimIt: Payment reminder"); assert.match(reminder.text, /monthly fee is pending/);
  const received = buildBillingEmail({ ...options, kind: "send_receipt" });
  assert.match(received.text, /Paid: ₹1/); assert.match(received.text, /payment is confirmed/); assert.doesNotMatch(received.text, /Pay now:/);
  const refunded = buildBillingEmail({ ...options, invoice: { ...invoice, refunded_paise: 100 }, kind: "send_refund" });
  assert.match(refunded.text, /Refunded: ₹1/); assert.doesNotMatch(refunded.text, /Pay now:/); assert.match(refunded.text, /View invoice:/);
});

test("SQL timestamptz due dates display their actual India calendar date", () => {
  const email=buildBillingEmail({...options,invoice:{...invoice,due_date:'2026-12-04T20:00:00+00:00'},kind:'send_reminder'});
  assert.match(email.text,/Due by: 5 Dec 2026/);
  assert.throws(()=>buildBillingEmail({...options,invoice:{...invoice,due_date:'2026-02-30T20:00:00+00:00'},kind:'send_reminder'}));
});

test("normal billing communicates daily late fee, while team payments cannot imply that fee is charged", () => {
  const normal = buildBillingEmail({ ...options, invoice: { ...invoice, amount_paise: 60000, late_fees_enabled: true, late_fee_policy: 'daily', late_fee_rate_paise: 10000 }, teamTesting: false, kind: "send_invoice" });
  assert.match(normal.text, /Amount: ₹600/); assert.match(normal.text, /₹100 per overdue day after the due date/);
  const team = buildBillingEmail({ ...options, kind: "send_invoice" }); assert.doesNotMatch(team.text, /₹100 per overdue day/);
});

test("late-fee disclosures use the saved account policy and actual rate only when enabled",()=>{
  for(const late_fees_enabled of [false,undefined]) {
    const disabled=buildBillingEmail({...options,invoice:{...invoice,late_fees_enabled,late_fee_policy:'daily',late_fee_rate_paise:10000},teamTesting:false,kind:'send_invoice'});
    assert.doesNotMatch(disabled.text,/overdue day|Late fee:/);
  }
  const once=buildBillingEmail({...options,invoice:{...invoice,late_fees_enabled:true,late_fee_policy:'once',late_fee_rate_paise:15000},teamTesting:false,kind:'send_invoice'});
  assert.match(once.text,/Late fee: ₹150 once after the due date/);assert.doesNotMatch(once.text,/per overdue day|₹100/);
  const daily=buildBillingEmail({...options,invoice:{...invoice,late_fees_enabled:true,late_fee_policy:'daily',late_fee_rate_paise:12500},teamTesting:false,kind:'send_reminder'});
  assert.match(daily.text,/₹125 per overdue day after the due date/);assert.doesNotMatch(daily.text,/₹100/);
  const team=buildBillingEmail({...options,invoice:{...invoice,late_fees_enabled:true,late_fee_policy:'daily',late_fee_rate_paise:10000},kind:'send_invoice'});
  assert.doesNotMatch(team.text,/₹100 per overdue day/);assert.match(team.text,/Late fees are not charged/);
});

test("late-fee invoices are labelled as late fees and do not promise another monthly charge",()=>{
  const late={...invoice,kind:'late_fee',amount_paise:10000,late_fees_enabled:true,late_fee_policy:'daily',late_fee_rate_paise:10000};
  const email=buildBillingEmail({...options,invoice:late,teamTesting:false,kind:'send_invoice'});
  assert.equal(email.subject,'LetsAimIt: Late fee');assert.match(email.text,/Your late-fee invoice is ready/);assert.match(email.text,/Amount: ₹100/);
  assert.doesNotMatch(email.text,/Monthly fee|Your monthly invoice|per overdue day/);
  const reminder=buildBillingEmail({...options,invoice:late,teamTesting:false,kind:'send_reminder'});assert.match(reminder.text,/Your late fee is pending/);
});

test("untrusted names and references are HTML escaped without changing plain text meaning", () => {
  const email = buildBillingEmail({ ...options, invoice: { ...invoice, parent_name: '<img src=x onerror="alert(1)"> & Parent', receipt: "<reference> & one" }, kind: "send_invoice" });
  assert.match(email.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; Parent/); assert.doesNotMatch(email.html, /<img src=x/);
  assert.match(email.html, /&lt;reference&gt; &amp; one/); assert.match(email.text, /<reference> & one/);
});

test("email links, dates, amounts, kinds and header control characters are validated", () => {
  for (const changes of [{ payment_url: "https://rzp.io.attacker.test/x" }, { invoice_url: "https://attacker.test" }, { due_date: "2026-02-30" }, { due_date: "not-date" }, { period_start: "2026-13-01" }, { amount_paise: -1 }, { paid_paise: 1.25 }, { refunded_paise: Number.NaN }, { currency: "USD" }, { parent_name: "Hi\r\nBcc" }]) assert.throws(() => buildBillingEmail({ ...options, invoice: { ...invoice, ...changes }, kind: "send_invoice" }));
  assert.throws(() => buildBillingEmail({ ...options, kind: "arbitrary" }));
  assert.throws(() => buildBillingEmail({ ...options, kind: "send_invoice", dashboardOrigin: "https://attacker.test" }));
});
