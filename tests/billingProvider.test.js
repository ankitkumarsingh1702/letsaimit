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

test("one-off invoice creation preserves the saved description, amount and recipient", async () => {
  const { client, calls } = clientFixture([invoice({amount:500000,amount_due:500000})]);
  const saved = await client.createInvoice({ ...bill, kind: "one_off", description: "Spring clinic", amount_paise: 500000 });
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.description, "LetsAimIt: Spring clinic");
  assert.deepEqual(body.line_items, [{ name: "Spring clinic", amount: 500000, currency: "INR", quantity: 1 }]);
  assert.equal(body.customer.email, bill.parent_email);
  assert.equal(body.email_notify, false);
  assert.equal(body.expire_by, undefined);
  assert.equal(saved.captured, false);
  assert.equal(saved.paid_paise, 0);

  const invalid = clientFixture([]);
  for (const description of ["", "  ", "A".repeat(81), "a\nb", "<Invoice>"]) {
    await assert.rejects(invalid.client.createInvoice({ ...bill, kind: "one_off", description }), /invalid_bill/);
  }
  assert.equal(invalid.calls.length, 0);
});

test("invalid amounts, identity fields and receipt substitutions never reach the provider", async () => {
  for (const changes of [{ amount_paise: 99 }, { amount_paise: -1 }, { amount_paise: 100.5 }, { amount_paise: Number.MAX_SAFE_INTEGER }, { currency: "USD" }, { receipt: "different-receipt" }, { parent_name: "Injected\r\nBcc" }, { parent_email: "a@b.test\n" }, { parent_phone: "+91 9876" }]) {
    const { client, calls } = clientFixture([]);
    await assert.rejects(client.createInvoice({ ...bill, ...changes }), BillingProviderError);
    assert.equal(calls.length, 0);
  }
});

test("retired late fees never create a Razorpay invoice", async () => {
  const { client, calls } = clientFixture([]);
  for (const changes of [{ kind: "late_fee" }, { late_fee_paise: 100 }]) {
    await assert.rejects(client.createInvoice({ ...bill, ...changes }), error => error.code === "invalid_bill");
  }
  assert.equal(calls.length, 0);
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

test("a balance adjustment accepts a verified closed invoice with no order or payment link", async () => {
  const issued = invoice();
  const cancelled = invoice({ status: "cancelled", amount_due: null, amount_paid: null, order_id: null, short_url: null });
  const original = { ...bill, kind: "one_off", provider_invoice_id: issued.id, provider_order_id: issued.order_id, paid_paise: 0 };
  const { client, calls } = clientFixture([issued, cancelled]);
  const snapshot = await client.cancelInvoice(original);
  assert.equal(snapshot.provider_status, "cancelled");
  assert.equal(snapshot.payment_url, null);
  assert.equal(snapshot.paid_paise, 0);
  assert.equal(snapshot.amount_paise, original.amount_paise);
  assert.deepEqual(calls.map(({ options }) => options.method), ["GET", "POST"]);

  const conflicting = clientFixture([invoice({ ...cancelled, order_id: "order_99999999999999" })]);
  await assert.rejects(conflicting.client.cancelInvoice(original), /invalid_provider_snapshot/);
  const locallyPaid = clientFixture([cancelled]);
  await assert.rejects(locallyPaid.client.cancelInvoice({ ...original, paid_paise: original.amount_paise }), /invalid_provider_snapshot/);
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

test("an in-progress checkout prevents cancellation until Razorpay confirms its outcome", async () => {
  const inProgress = invoice({ payment_id: payment().id });
  const paid = invoice({ status: "paid", amount_paid: 100, amount_due: 0, payment_id: payment().id });
  const { client, calls } = clientFixture([
    invoice(),
    json({ error: { description: "Payment in progress" } }, 400),
    inProgress,
    payment({ status: "authorized", captured: false }),
    paid,
    payment(),
    { items: [] },
  ]);
  const original = { ...bill, kind: "one_off", provider_invoice_id: paid.id };
  await assert.rejects(client.cancelInvoice(original), /provider_unavailable/);
  const reconciled = await client.cancelInvoice(original);
  assert.equal(reconciled.captured, true);
  assert.equal(reconciled.paid_paise, 100);
  assert.equal(calls.filter(({ options }) => options.method === "POST").length, 1);
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
  const handler = createBillingWebhookHandler({ secret: webhookSecret, crypto: webcrypto, rpc: async () => ({ status: "accepted" }) });
  assert.equal((await handler(webhookRequest(event({ created_at: 1 })))).status, 200);
});

test("verified events durably persist only bounded routing identifiers and a payload hash", async () => {
  const calls = [], body = JSON.stringify(event());
  const handler = createBillingWebhookHandler({ secret: webhookSecret, crypto: webcrypto, rpc: async (name, args) => { calls.push({ name, args }); return { status: "accepted" }; } });
  const result = await handler(webhookRequest(null, { raw: body }));
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  assert.deepEqual(calls, [{ name: "ingest_owned_billing_webhook", args: { p_event_id: "event_synthetic_1", p_invoice_id: "inv_12345678901234", p_payment_id: "pay_12345678901234", p_event_type: "invoice.paid", p_payload_hash: createHash("sha256").update(body).digest("hex"), p_billing_id: BILL_ID } }]);
  assert.equal(JSON.stringify(calls).includes("parent@example.test"), false);
});

test("webhook duplicate receipts are acknowledged, database failures and unconfirmed persistence are not", async () => {
  for (const status of ["accepted", "duplicate", "foreign"]) {
    const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc: async () => ({ status }), crypto: webcrypto });
    assert.equal((await handler(webhookRequest())).status, 200);
  }
  for (const rpc of [async () => { throw new Error("private db secret"); }, async () => null, async () => true, async () => false]) {
    const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc, crypto: webcrypto });
    const response = await handler(webhookRequest()); assert.equal(response.status, 503); assert.equal((await response.text()).includes("private"), false);
  }
});

test("webhook method, signature, event IDs and malformed payloads never reach database intake", async () => {
  const calls = [];
  const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc: async (...args) => { calls.push(args); return { status: "accepted" }; }, crypto: webcrypto });
  const cases = [[webhookRequest(null, { method: "GET" }), 405], [webhookRequest(null, { signature: "00".repeat(32) }), 401], [webhookRequest(null, { eventId: null }), 400], [webhookRequest(null, { eventId: "a\"b" }), 400], [webhookRequest(null, { raw: "broken JSON" }), 400], [webhookRequest({}), 400], [webhookRequest(event({ payload: {} })), 400], [webhookRequest(event({ event: "arbitrary.operation" })), 400]];
  for (const [request, status] of cases) assert.equal((await handler(request)).status, status);
  assert.equal(calls.length, 0);
});

test("webhook ignores advertised length when streaming and enforces the real body bound", async () => {
  let queried = false;
  const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc: async () => { queried = true; return { status: "accepted" }; }, maxBytes: 100, crypto: webcrypto });
  assert.equal((await handler(webhookRequest(null, { raw: "x".repeat(101), headers: { "content-length": "1" } }))).status, 413);
  assert.equal((await handler(webhookRequest(null, { raw: "{}", headers: { "content-length": "101" } }))).status, 413);
  assert.equal(queried, false);
});

test("refund-only payloads route by payment ID; mismatched entity links are rejected", async () => {
  const calls = [];
  const handler = createBillingWebhookHandler({ secret: webhookSecret, rpc: async (name, args) => { calls.push(args); return { status: "accepted" }; }, crypto: webcrypto });
  const refund = event({ event: "refund.processed", payload: { refund: { entity: { entity: "refund", id: "rfnd_12345678901234", payment_id: "pay_12345678901234" } } } });
  assert.equal((await handler(webhookRequest(refund))).status, 200); assert.equal(calls[0].p_invoice_id, null); assert.equal(calls[0].p_payment_id, "pay_12345678901234");
  const mismatch = event({ payload: { invoice: { entity: invoice() }, payment: { entity: payment({ invoice_id: "inv_99999999999999" }) } } });
  assert.equal((await handler(webhookRequest(mismatch))).status, 400); assert.equal(calls.length, 1);
});

const paymentEvent = overrides => event({ event: "payment.captured", payload: { payment: { entity: payment({ notes: [], ...overrides }) } } });
const refundEvent = () => event({ event: "refund.processed", payload: { refund: { entity: { entity: "refund", id: "rfnd_12345678901234", payment_id: payment().id, notes: [] } } } });

function ownershipFixture(replies, statuses) {
  const provider = clientFixture(replies);
  const intake = [];
  const handler = createBillingWebhookHandler({ secret: webhookSecret, crypto: webcrypto,
    resolveOwnership: (ids, options) => provider.client.resolveWebhookOwnership(ids, options),
    rpc: async (name, args) => {
      intake.push({ name, args });
      assert.equal(name, "ingest_owned_billing_webhook");
      const status = statuses.shift();
      assert.ok(status, "Unexpected intake call");
      return { status };
    },
  });
  return { handler, intake, providerCalls: provider.calls };
}

test("signed local invoice intent and notes route early events without any provider lookup", async () => {
  for (const entity of [invoice(), invoice({ notes: [] }), invoice({ receipt: null })]) {
    const fixture = ownershipFixture([], ["accepted"]);
    assert.equal((await fixture.handler(webhookRequest(event({ payload: { invoice: { entity } } })))).status, 200);
    assert.equal(fixture.intake[0].args.p_billing_id, BILL_ID);
    assert.equal(fixture.providerCalls.length, 0);
  }
  const mappedPayment = ownershipFixture([], ["accepted"]);
  assert.equal((await mappedPayment.handler(webhookRequest(paymentEvent()))).status, 200);
  assert.equal(mappedPayment.intake[0].args.p_billing_id, null);
  assert.equal(mappedPayment.providerCalls.length, 0, "Known provider IDs need no extra read");
});

test("signed ownership conflicts are rejected before intake or provider requests", async () => {
  for (const entity of [
    invoice({ notes: { billing_id: "11111111-1111-1111-1111-111111111111" } }),
    invoice({ receipt: "LAIbroken", notes: [] }),
    invoice({ notes: { billing_id: "invalid" } }),
  ]) {
    const fixture = ownershipFixture([], []);
    assert.equal((await fixture.handler(webhookRequest(event({ payload: { invoice: { entity } } })))).status, 400);
    assert.equal(fixture.intake.length, 0);
    assert.equal(fixture.providerCalls.length, 0);
  }
});

test("unmapped payment uses one exact invoice GET and retains only its verified local identity", async () => {
  const fixture = ownershipFixture([invoice({ customer_details: { email: "private-foreign-field@example.test" } })], ["unresolved", "accepted"]);
  assert.equal((await fixture.handler(webhookRequest(paymentEvent()))).status, 200);
  assert.deepEqual(fixture.providerCalls.map(({ url, options }) => [options.method, url]), [["GET", `https://api.razorpay.com/v1/invoices/${invoice().id}`]]);
  assert.equal(fixture.intake.length, 2);
  assert.equal(fixture.intake[0].args.p_billing_id, null);
  assert.equal(fixture.intake[1].args.p_billing_id, BILL_ID);
  assert.equal(fixture.intake[1].args.p_invoice_id, invoice().id);
  assert.doesNotMatch(JSON.stringify(fixture.intake), /private-foreign-field|customer_details|order_id|amount|paid_paise/);
});

test("unmapped refund without invoice notes uses at most payment then invoice GET", async () => {
  const fixture = ownershipFixture([payment(), invoice()], ["unresolved", "accepted"]);
  assert.equal((await fixture.handler(webhookRequest(refundEvent()))).status, 200);
  assert.deepEqual(fixture.providerCalls.map(({ url, options }) => [options.method, url]), [
    ["GET", `https://api.razorpay.com/v1/payments/${payment().id}`],
    ["GET", `https://api.razorpay.com/v1/invoices/${invoice().id}`],
  ]);
  assert.equal(fixture.intake[0].args.p_invoice_id, null);
  assert.equal(fixture.intake[1].args.p_invoice_id, invoice().id);
  assert.equal(fixture.intake[1].args.p_billing_id, BILL_ID);
});

test("foreign invoice UUIDs stop at the ownership gate without a persistence request or invoice scan", async () => {
  const otherId = "11111111-1111-1111-1111-111111111111";
  const foreignInvoice = invoice({ receipt: billingReceipt(otherId), notes: { billing_id: otherId } });
  const signed = ownershipFixture([], ["foreign"]);
  assert.equal((await signed.handler(webhookRequest(event({ payload: { invoice: { entity: foreignInvoice } } })))).status, 200);
  assert.equal(signed.intake.length, 1);
  assert.equal(signed.providerCalls.length, 0);

  const fetched = ownershipFixture([foreignInvoice], ["unresolved", "foreign"]);
  assert.equal((await fetched.handler(webhookRequest(paymentEvent()))).status, 200);
  assert.equal(fetched.intake.length, 2);
  assert.equal(fetched.intake[1].args.p_billing_id, otherId);
  assert.equal(fetched.providerCalls.length, 1);
  assert.ok(fetched.providerCalls.every(({ url, options }) => options.method === "GET" && !url.includes("?")));
});

test("explicit other-integration receipts are acknowledged without local persistence", async () => {
  const direct = ownershipFixture([], ["unresolved"]);
  assert.equal((await direct.handler(webhookRequest(event({ payload: { invoice: { entity: invoice({ receipt: "another-app", notes: [] }) } } })))).status, 200);
  assert.equal(direct.intake.length, 1);
  assert.equal(direct.providerCalls.length, 0);

  const fetched = ownershipFixture([invoice({ receipt: "another-app", notes: [] })], ["unresolved"]);
  assert.equal((await fetched.handler(webhookRequest(paymentEvent()))).status, 200);
  assert.equal(fetched.intake.length, 1, "No candidate UUID is sent to persist a foreign integration event");
  assert.equal(fetched.providerCalls.length, 1);

});

test("an absent provider invoice association remains retryable instead of declaring an early payment foreign", async () => {
  for (const invoice_id of [null, undefined, ""]) {
    const unresolved = ownershipFixture([payment({ invoice_id })], ["unresolved"]);
    const response = await unresolved.handler(webhookRequest(refundEvent()));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "ownership_unresolved" });
    assert.equal(unresolved.intake.length, 1, "Ambiguous ownership must not reach a persistence request");
    assert.equal(unresolved.providerCalls.length, 1, "Do not guess an invoice ID or scan the merchant account");
  }
});

test("provider failures and missing or conflicting ownership are retriable without accepting an early event", async () => {
  for (const reply of [
    json({ error: "private error" }, 404), json({}, 429), json({}, 500), new Error("private connection failure"),
    invoice({ receipt: null, notes: [] }), invoice({ id: "inv_99999999999999" }),
    invoice({ notes: { billing_id: "11111111-1111-1111-1111-111111111111" } }),
  ]) {
    const fixture = ownershipFixture([reply], ["unresolved"]);
    const response = await fixture.handler(webhookRequest(paymentEvent()));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "ownership_unresolved" });
    assert.equal(fixture.intake.length, 1, "No second intake until ownership is verified");
    assert.equal(fixture.providerCalls.length, 1);
  }
  const invoiceWithoutIdentity = ownershipFixture([], ["unresolved"]);
  assert.equal((await invoiceWithoutIdentity.handler(webhookRequest(event({ payload: { invoice: { entity: invoice({ receipt: null, notes: [] }) } } })))).status, 503);
  assert.equal(invoiceWithoutIdentity.providerCalls.length, 0, "Only unresolved payment/refund events use the extra lookup");
});

test("a retry after durable ownership intake is deduplicated before another provider lookup", async () => {
  const fixture = ownershipFixture([invoice()], ["unresolved", "accepted", "duplicate"]);
  assert.equal((await fixture.handler(webhookRequest(paymentEvent()))).status, 200);
  assert.equal((await fixture.handler(webhookRequest(paymentEvent()))).status, 200);
  assert.equal(fixture.providerCalls.length, 1);
  assert.equal(fixture.intake.length, 3);
  assert.equal(fixture.intake[0].args.p_payload_hash, fixture.intake[2].args.p_payload_hash);
});

test("webhook's shared deadline aborts unresolved provider reads and stalled intake", { timeout: 1500 }, async () => {
  let providerSignal;
  const client = createRazorpayClient({ keyId: "rzp_live_synthetic", keySecret: "synthetic-provider-secret",
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      providerSignal = options.signal;
      options.signal.addEventListener("abort", () => reject(new Error("private timeout")), { once: true });
    }),
  });
  const handler = createBillingWebhookHandler({ secret: webhookSecret, crypto: webcrypto, maxDurationMs: 25,
    rpc: async () => ({ status: "unresolved" }), resolveOwnership: (ids, options) => client.resolveWebhookOwnership(ids, options) });
  assert.equal((await handler(webhookRequest(paymentEvent()))).status, 503);
  assert.equal(providerSignal.aborted, true);

  const stalled = createBillingWebhookHandler({ secret: webhookSecret, crypto: webcrypto, maxDurationMs: 25,
    rpc: async () => new Promise(() => {}) });
  assert.equal((await stalled(webhookRequest())).status, 503);
});

test("a stalled streamed-body cancellation cannot outlive the shared webhook deadline", { timeout: 1500 }, async () => {
  let cancellations = 0;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(11)); },
    cancel() { cancellations += 1; return new Promise(() => {}); },
  });
  const request = new Request("https://synthetic.supabase.co/functions/v1/razorpay-webhook", { method: "POST", body, duplex: "half" });
  const handler = createBillingWebhookHandler({ secret: webhookSecret, maxBytes: 10, maxDurationMs: 25,
    rpc: async () => { assert.fail("Oversized input must never reach intake"); } });
  assert.equal((await handler(request)).status, 503);
  assert.equal(cancellations, 1);
});
