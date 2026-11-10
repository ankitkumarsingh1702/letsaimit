import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash, webcrypto } from "node:crypto";
import { BillingProviderError, billingReceipt, safeRazorpayUrl, createRazorpayClient, verifyRazorpaySignature, createBillingWebhookHandler } from "../supabase/functions/_shared/razorpay-billing.js";

const BILL_ID = "f84940a4-e4cb-4ebf-88cb-e63537834565";
const bill = { id: BILL_ID, receipt: billingReceipt(BILL_ID), currency: "INR", amount_paise: 100, parent_name: "Synthetic Parent", parent_email: "parent@example.test", parent_phone: "+919876543210", period_start: "2026-12-01", due_date: "2026-12-05" };
const invoice = overrides => ({ entity: "invoice", id: "inv_12345678901234", receipt: bill.receipt, currency: "INR", amount: 100, amount_paid: 0, amount_due: 100, status: "issued", order_id: "order_12345678901234", payment_id: null, short_url: "https://rzp.io/i/synthetic", notes: { billing_id: BILL_ID }, ...overrides });
const payment = overrides => ({ entity: "payment", id: "pay_12345678901234", invoice_id: "inv_12345678901234", order_id: "order_12345678901234", currency: "INR", amount: 100, captured: true, status: "captured", created_at: 1794240000, ...overrides });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function clientFixture(replies, extra = {}) {
  const calls = [];
  const client = createRazorpayClient({ keyId: "rzp_live_synthetic", keySecret: "synthetic-provider-secret", fetch: async (url, options) => {
    calls.push({ url, options }); const value = replies.shift();
    if (value instanceof Error) throw value;
    if (typeof value === "function") return value(url, options);
    assert.notEqual(value, undefined, `Unexpected provider request: ${url}`);
    return value instanceof Response ? value : json(value);
  }, ...extra });
  return { client, calls };
}

test("stable invoice receipts encode one UUID in 35 characters", () => {
  assert.equal(bill.receipt, "LAIf84940a4e4cb4ebf88cbe63537834565");
  assert.equal(bill.receipt.length, 35);
  assert.equal(billingReceipt(BILL_ID.toUpperCase()), bill.receipt);
  for (const value of [null, "not-uuid", `${BILL_ID}\n`]) assert.throws(() => billingReceipt(value), /invalid_bill/);
});

test("provider URL validation accepts only exact HTTPS Razorpay hosts", () => {
  assert.equal(safeRazorpayUrl("https://rzp.io/i/synthetic"), "https://rzp.io/i/synthetic");
  for (const url of ["http://rzp.io/i/synthetic", "https://rzp.io.attacker.test/x", "https://attacker.test/razorpay.com", "https://rzp.io@attacker.test/x", "https://user:password@rzp.io/x", "https://rzp.io:444/x", "javascript:alert(1)", "https://rzp.io/x#redirect", "https://rzp.io/\\evil", " https://rzp.io/x", "https://rzp.io/x\n"]) assert.throws(() => safeRazorpayUrl(url), /invalid_provider_snapshot/);
});

test("creating a bill sends the server amount and stable receipt without provider emails or SMS", async () => {
  const { client, calls } = clientFixture([invoice()]);
  const saved = await client.createInvoice(bill);
  assert.equal(saved.amount_paise, 100); assert.equal(saved.paid_paise, 0); assert.equal(saved.captured, false);
  assert.equal(saved.provider_invoice_id, "inv_12345678901234"); assert.equal(saved.payment_url, "https://rzp.io/i/synthetic");
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "https://api.razorpay.com/v1/invoices");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.sms_notify, false); assert.equal(body.email_notify, false); assert.equal(body.partial_payment, false);
  assert.equal(body.receipt, bill.receipt); assert.deepEqual(body.notes, { billing_id: BILL_ID });
  assert.deepEqual(body.line_items, [{ name: "Monthly coaching", amount: 100, currency: "INR", quantity: 1 }]);
  assert.equal(body.customer.email, bill.parent_email); assert.equal(body.customer.contact, bill.parent_phone);
  assert.equal(JSON.stringify(saved).includes("synthetic-provider-secret"), false);
});

test("invalid amounts, identity fields and receipt substitutions never reach the provider", async () => {
  for (const changes of [{ amount_paise: 99 }, { amount_paise: -1 }, { amount_paise: 100.5 }, { amount_paise: Number.MAX_SAFE_INTEGER }, { currency: "USD" }, { receipt: "different-receipt" }, { parent_name: "Injected\r\nBcc" }, { parent_email: "a@b.test\n" }, { parent_phone: "+91 9876" }]) {
    const { client, calls } = clientFixture([]);
    await assert.rejects(client.createInvoice({ ...bill, ...changes }), BillingProviderError);
    assert.equal(calls.length, 0);
  }
});

test("a separate late-fee invoice identifies the charge instead of calling it coaching", async () => {
  const { client,calls }=clientFixture([invoice()]);
  await client.createInvoice({...bill,kind:'late_fee',late_fee_paise:100,base_amount_paise:0});
  const body=JSON.parse(calls[0].options.body);assert.equal(body.description,'LetsAimIt late fee');assert.equal(body.line_items[0].name,'Late fee');
  assert.equal(body.line_items[0].amount,100);assert.equal(Object.hasOwn(body,'expire_by'),false);
});

test("invoice creation transport failures, 5xx and malformed success are ambiguous", async () => {
  for (const failure of [new Error("private-provider-error-and-secret"), json({ error: { description: "private" } }, 500), json({}, 408), new Response("broken", { status: 200 }), invoice({ receipt: "wrong" })]) {
    const { client } = clientFixture([failure]);
    await assert.rejects(client.createInvoice(bill), error => {
      assert.equal(error.code, "provider_ambiguous"); assert.equal(error.ambiguous, true);
      assert.equal(error.message.includes("private"), false); return true;
    });
  }
});

test("definitive provider rejection and rate limit stay separate from ambiguous creation", async () => {
  for (const [status, code] of [[400, "provider_rejected"], [401, "provider_rejected"], [429, "provider_retry"]]) {
    const { client } = clientFixture([json({ error: { description: "private secret customer email" } }, status)]);
    await assert.rejects(client.createInvoice(bill), error => error.code === code && error.status === status && error.ambiguous === false && !error.message.includes("private"));
  }
});

test("invoice creation timeout remains ambiguous and cancels the network call", async () => {
  let aborted = false;
  const { client } = clientFixture([(url, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted-private")); }))], { timeoutMs: 5 });
  await assert.rejects(client.createInvoice(bill), error => error.code === "provider_ambiguous" && error.ambiguous);
  assert.equal(aborted, true);
});

test("reconciliation requires exact amount, currency, receipt and provider invoice ownership", async () => {
  for (const changes of [{ amount: 60000 }, { currency: "USD" }, { receipt: "wrong" }, { id: "inv_99999999999999" }, { notes: { billing_id: "other-registration" } }, { order_id: "https://attacker.test" }, { short_url: "https://attacker.test" }, { amount_paid: 101, amount_due: 0 }, { amount_due: 99 }]) {
    const { client } = clientFixture([invoice(changes)]);
    await assert.rejects(client.reconcileInvoice({ ...bill, provider_invoice_id: "inv_12345678901234" }), /invalid_provider_snapshot/);
  }
});

test("authorized payments cannot mark an invoice paid or count as revenue", async () => {
  const { client, calls } = clientFixture([invoice({ payment_id: "pay_12345678901234" }), payment({ status: "authorized", captured: false })]);
  const result = await client.reconcileInvoice({ ...bill, provider_invoice_id: "inv_12345678901234" });
  assert.equal(result.captured, false); assert.equal(result.paid_paise, 0); assert.equal(result.provider_payment_id, null); assert.equal(calls.length, 2);
  const bad = clientFixture([invoice({ status: "paid", amount_paid: 100, amount_due: 0, payment_id: "pay_12345678901234" }), payment({ status: "authorized", captured: false })]);
  await assert.rejects(bad.client.reconcileInvoice({ ...bill, provider_invoice_id: "inv_12345678901234" }), /invalid_provider_snapshot/);
});

test("captured money requires matching invoice/order/payment amount and no split-payment invention", async () => {
  for (const changes of [{ invoice_id: "inv_99999999999999" }, { order_id: "order_99999999999999" }, { currency: "USD" }, { amount: 60000 }, { id: "pay_99999999999999" }]) {
    const { client } = clientFixture([invoice({ payment_id: "pay_12345678901234", status: "paid", amount_paid: 100, amount_due: 0 }), payment(changes)]);
    await assert.rejects(client.reconcileInvoice({ ...bill, provider_invoice_id: "inv_12345678901234" }), /invalid_provider_snapshot/);
  }
  const split = clientFixture([invoice({ payment_id: "pay_12345678901234", amount_paid: 50, amount_due: 50, status: "partially_paid" }), payment()]);
  await assert.rejects(split.client.reconcileInvoice({ ...bill, provider_invoice_id: "inv_12345678901234" }), /invalid_provider_snapshot/);
});

test("captured receipt keeps gross paid history and only processed refunds reduce net revenue", async () => {
  const { client, calls } = clientFixture([invoice({ payment_id: "pay_12345678901234", status: "paid", amount_paid: 100, amount_due: 0, paid_at: 1794240100 }), payment(), { items: [
    { id: "rfnd_11111111111111", payment_id: "pay_12345678901234", currency: "INR", amount: 30, status: "processed" },
    { id: "rfnd_22222222222222", payment_id: "pay_12345678901234", currency: "INR", amount: 20, status: "pending" },
    { id: "rfnd_33333333333333", payment_id: "pay_12345678901234", currency: "INR", amount: 10, status: "failed" },
  ] }]);
  const result = await client.reconcileInvoice({ ...bill, provider_invoice_id: "inv_12345678901234" });
  assert.equal(result.captured, true); assert.equal(result.paid_paise, 100); assert.equal(result.refunded_paise, 30); assert.equal(result.provider_status, "paid");
  assert.equal(result.paid_at, new Date(1794240100 * 1000).toISOString()); assert.equal(calls.length, 3);
});

test("captured payment can reconcile while the invoice snapshot is still issued", async () => {
  const { client } = clientFixture([invoice({ payment_id: "pay_12345678901234" }), payment(), { items: [] }]);
  const result = await client.reconcileInvoice({ ...bill, provider_invoice_id: "inv_12345678901234" });
  assert.equal(result.paid_paise, 100); assert.equal(result.captured, true); assert.equal(result.provider_status, "issued");
});

test("invalid, duplicate, cross-payment and excessive refunds cannot fabricate a balance", async () => {
  const one = { id: "rfnd_11111111111111", payment_id: "pay_12345678901234", currency: "INR", amount: 100, status: "processed" };
  for (const items of [[one, one], [{ ...one, amount: 101 }], [{ ...one, currency: "USD" }], [{ ...one, payment_id: "pay_99999999999999" }], [{ ...one, status: "invented" }]]) {
    const { client } = clientFixture([invoice({ payment_id: "pay_12345678901234", status: "paid", amount_paid: 100, amount_due: 0 }), payment(), { items }]);
    await assert.rejects(client.reconcileInvoice({ ...bill, provider_invoice_id: "inv_12345678901234" }), /invalid_provider_snapshot/);
  }
});

test("receipt recovery uses bounded native pagination and checks exact local receipt", async () => {
  const first = Array.from({ length: 100 }, (_, index) => invoice({ id: `inv_${String(index).padStart(14, "0")}`, receipt: `unrelated_${index}` }));
  const { client, calls } = clientFixture([{ items: first }, { items: [invoice()] }]);
  const result = await client.findByReceipt({ ...bill, created: "2026-11-09T20:00:00Z" });
  assert.equal(result.provider_invoice_id, "inv_12345678901234");
  assert.match(calls[0].url, /count=100&skip=0&from=1794254400$/); assert.match(calls[1].url, /skip=100/);
  assert.equal(calls.some(({ url }) => url.includes("receipt=")), false);
});

test("an exhausted scan is not a not-found result and duplicate receipts are never silently selected", async () => {
  const hundred = Array.from({ length: 100 }, (_, index) => invoice({ receipt: `other_${index}` }));
  const incomplete = clientFixture([{ items: hundred }], { maxPages: 1 });
  await assert.rejects(incomplete.client.findByReceipt(bill), /provider_scan_incomplete/);
  const duplicate = clientFixture([{ items: [invoice(), invoice({ id: "inv_99999999999999" })] }]);
  await assert.rejects(duplicate.client.findByReceipt(bill), /provider_duplicate_invoice/);
  const absent = clientFixture([{ items: [] }]); assert.equal(await absent.client.findByReceipt(bill), null);
});

test("account deletion cancellation verifies the immutable invoice before closing its hosted link", async () => {
  const cancelled=invoice({status:"cancelled",amount_due:0,amount_paid:0,order_id:null,short_url:null});
  const {client,calls}=clientFixture([invoice(),cancelled]);
  const saved=await client.cancelInvoice({...bill,provider_invoice_id:cancelled.id,paid_paise:0});
  assert.equal(saved.provider_status,"cancelled");assert.equal(saved.amount_paise,100);assert.equal(saved.paid_paise,0);
  assert.deepEqual(calls.map(({url,options})=>[options.method,url]),[
    ["GET",`https://api.razorpay.com/v1/invoices/${cancelled.id}`],
    ["POST",`https://api.razorpay.com/v1/invoices/${cancelled.id}/cancel`],
  ]);
  assert.equal(calls[1].options.body,undefined,"cancellation never supplies another price or a refund request");
});

test("paid or terminal invoices are reconciled without a cancellation or refund POST", async () => {
  const paid=invoice({status:"paid",amount_paid:100,amount_due:0,payment_id:payment().id,paid_at:1794240100});
  const capture=clientFixture([paid,payment(),{items:[]}]);
  const saved=await capture.client.cancelInvoice({...bill,provider_invoice_id:paid.id});
  assert.equal(saved.captured,true);assert.equal(saved.paid_paise,100);assert.equal(saved.refunded_paise,0);
  assert.ok(capture.calls.every(({options})=>options.method==="GET"));
  for(const status of ["cancelled","expired","deleted"]) {
    const terminal=clientFixture([invoice({status,amount_due:0,order_id:null,short_url:null})]);
    assert.equal((await terminal.client.cancelInvoice({...bill,provider_invoice_id:paid.id})).provider_status,status);
    assert.equal(terminal.calls.length,1);assert.equal(terminal.calls[0].options.method,"GET");
  }
});

test("a payment racing cancellation is preserved as captured money without initiating a refund", async () => {
  const paid=invoice({status:"paid",amount_paid:100,amount_due:0,payment_id:payment().id,paid_at:1794240100});
  const {client,calls}=clientFixture([invoice(),json({error:{description:"already paid private detail"}},400),paid,payment(),{items:[]}]);
  const saved=await client.cancelInvoice({...bill,provider_invoice_id:paid.id});
  assert.equal(saved.paid_paise,100);assert.equal(saved.captured,true);assert.equal(saved.provider_status,"paid");
  assert.equal(calls.filter(({options})=>options.method==="POST").length,1);
  assert.ok(calls.filter(({url})=>url.includes("/refunds")).every(({options})=>options.method==="GET"));
});

test("lost cancellation acknowledgements recover by GET and retries do not repeat a completed cancellation", async () => {
  const cancelled=invoice({status:"cancelled",amount_paid:null,amount_due:null,short_url:null,order_id:null});
  const recovered=clientFixture([invoice(),new Error("private cancellation timeout"),cancelled]);
  assert.equal((await recovered.client.cancelInvoice({...bill,provider_invoice_id:cancelled.id})).provider_status,"cancelled");
  assert.equal(recovered.calls.filter(({options})=>options.method==="POST").length,1);
  const pending=clientFixture([invoice(),json({error:{}},500),invoice(),cancelled]);
  await assert.rejects(pending.client.cancelInvoice({...bill,provider_invoice_id:cancelled.id}),error=>error.code==="provider_unavailable"&&!error.message.includes("private"));
  assert.equal((await pending.client.cancelInvoice({...bill,provider_invoice_id:cancelled.id})).provider_status,"cancelled");
  assert.equal(pending.calls.filter(({options})=>options.method==="POST").length,1);
});

test("mismatched or stale preflight snapshots never authorize provider cancellation", async () => {
  for(const [entity,changes]of [[invoice({receipt:"another-receipt"}),{}],[invoice(),{paid_paise:100}],[invoice({amount:200}),{}]]) {
    const {client,calls}=clientFixture([entity]);
    await assert.rejects(client.cancelInvoice({...bill,provider_invoice_id:invoice().id,...changes}),/invalid_provider_snapshot/);
    assert.equal(calls.length,1);assert.equal(calls[0].options.method,"GET");
  }
});

const webhookSecret = "synthetic-webhook-secret-long-enough";
const event = overrides => ({ entity: "event", event: "invoice.paid", created_at: 1, payload: { invoice: { entity: invoice({ status: "paid", amount_paid: 100, amount_due: 0, payment_id: "pay_12345678901234" }) }, payment: { entity: payment() } }, ...overrides });
function webhookRequest(value = event(), { signature, eventId = "event_synthetic_1", method = "POST", raw = JSON.stringify(value), headers = {} } = {}) {
  return new Request("https://synthetic.supabase.co/functions/v1/billing-webhook", { method, headers: { "x-razorpay-signature": signature ?? createHmac("sha256", webhookSecret).update(raw).digest("hex"), ...(eventId ? { "x-razorpay-event-id": eventId } : {}), ...headers }, ...(method === "POST" ? { body: raw } : {}) });
}

test("webhook verification uses exact raw bytes, not a reserialized object or invented timestamp tolerance", async () => {
  const raw = new TextEncoder().encode('{ "old": true, "order": 1 }');
  const signature = createHmac("sha256", webhookSecret).update(raw).digest("hex");
  assert.equal(await verifyRazorpaySignature(raw, signature, webhookSecret, webcrypto), true);
  assert.equal(await verifyRazorpaySignature(new TextEncoder().encode('{"old":true,"order":1}'), signature, webhookSecret, webcrypto), false);
  assert.equal(await verifyRazorpaySignature(raw, "00".repeat(32), webhookSecret, webcrypto), false);
  assert.equal(await verifyRazorpaySignature(raw, "nothex", webhookSecret, webcrypto), false);
  const handler = createBillingWebhookHandler({ secret: webhookSecret, crypto: webcrypto, rpc: async () => true });
  assert.equal((await handler(webhookRequest(event({ created_at: 1 })))).status, 200);
});

test("verified events durably persist only bounded routing identifiers and a payload hash", async () => {
  const calls = [], body = JSON.stringify(event());
  const handler = createBillingWebhookHandler({ secret: webhookSecret, crypto: webcrypto, rpc: async (name, args) => { calls.push({ name, args }); return true; } });
  const result = await handler(webhookRequest(null, { raw: body }));
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  assert.deepEqual(calls, [{ name: "ingest_billing_webhook", args: { p_event_id: "event_synthetic_1", p_invoice_id: "inv_12345678901234", p_payment_id: "pay_12345678901234", p_event_type: "invoice.paid", p_payload_hash: createHash("sha256").update(body).digest("hex") } }]);
  assert.equal(JSON.stringify(calls).includes("parent@example.test"), false);
});

test("webhook duplicate receipts are acknowledged, database failures and unconfirmed persistence are not", async () => {
  for (const outcome of [true, false]) {
    const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc: async () => outcome, crypto: webcrypto });
    assert.equal((await handler(webhookRequest())).status, 200);
  }
  for (const rpc of [async () => { throw new Error("private db secret"); }, async () => null]) {
    const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc, crypto: webcrypto });
    const response = await handler(webhookRequest()); assert.equal(response.status, 503); assert.equal((await response.text()).includes("private"), false);
  }
});

test("webhook method, signature, event IDs and malformed payloads never reach database intake", async () => {
  const calls = [];
  const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc: async (...args) => { calls.push(args); return true; }, crypto: webcrypto });
  const cases = [[webhookRequest(null, { method: "GET" }), 405], [webhookRequest(null, { signature: "00".repeat(32) }), 401], [webhookRequest(null, { eventId: null }), 400], [webhookRequest(null, { eventId: "a\"b" }), 400], [webhookRequest(null, { raw: "broken JSON" }), 400], [webhookRequest({}), 400], [webhookRequest(event({ payload: {} })), 400], [webhookRequest(event({ event: "arbitrary.operation" })), 400]];
  for (const [request, status] of cases) assert.equal((await handler(request)).status, status);
  assert.equal(calls.length, 0);
});

test("webhook ignores advertised length when streaming and enforces the real body bound", async () => {
  let queried = false;
  const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc: async () => { queried = true; return true; }, maxBytes: 100, crypto: webcrypto });
  assert.equal((await handler(webhookRequest(null, { raw: "x".repeat(101), headers: { "content-length": "1" } }))).status, 413);
  assert.equal((await handler(webhookRequest(null, { raw: "{}", headers: { "content-length": "101" } }))).status, 413);
  assert.equal(queried, false);
});

test("refund-only payloads route by payment ID; mismatched entity links are rejected", async () => {
  const calls = [];
  const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc: async (name, args) => { calls.push(args); return true; }, crypto: webcrypto });
  const refund = event({ event: "refund.processed", payload: { refund: { entity: { entity: "refund", id: "rfnd_12345678901234", payment_id: "pay_12345678901234" } } } });
  assert.equal((await handler(webhookRequest(refund))).status, 200); assert.equal(calls[0].p_invoice_id, null); assert.equal(calls[0].p_payment_id, "pay_12345678901234");
  const mismatch = event({ payload: { invoice: { entity: invoice() }, payment: { entity: payment({ invoice_id: "inv_99999999999999" }) } } });
  assert.equal((await handler(webhookRequest(mismatch))).status, 400); assert.equal(calls.length, 1);
});
