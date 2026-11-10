const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^(inv|pay|order|rfnd)_[A-Za-z0-9]{6,40}$/;
const RECEIPT = /^[A-Za-z0-9_-]{1,40}$/;
const STATES = new Set(["draft", "issued", "partially_paid", "paid", "cancelled", "expired", "deleted"]);
const encoder = new TextEncoder();

/** Deliberately excludes provider response text, customer details and credentials. */
export class BillingProviderError extends Error {
  constructor(code, { status = 0, ambiguous = false } = {}) {
    super(code); this.name = "BillingProviderError"; this.code = code; this.status = status; this.ambiguous = ambiguous;
  }
}

function invalid() { throw new BillingProviderError("invalid_provider_snapshot"); }
function money(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 4294967295) invalid(); return value; }
function id(value, prefix, optional = false) {
  if (optional && (value == null || value === "")) return null;
  if (typeof value !== "string" || !PROVIDER_ID.test(value) || !value.startsWith(`${prefix}_`)) invalid();
  return value;
}
function receipt(value) { if (typeof value !== "string" || !RECEIPT.test(value)) throw new BillingProviderError("invalid_bill"); return value; }
function plain(value, max) { if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new BillingProviderError("invalid_bill"); return value.trim(); }

export function billingReceipt(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw new BillingProviderError("invalid_bill");
  return `LAI${value.replaceAll("-", "").toLowerCase()}`;
}

/** Only URLs returned by the configured provider are suitable for billing emails. */
export function safeRazorpayUrl(value) {
  if (typeof value !== "string" || value !== value.trim() || /[\u0000-\u0020\u007f\\]/u.test(value)) invalid();
  let url; try { url = new URL(value); } catch { invalid(); }
  if (url.protocol !== "https:" || !["rzp.io", "razorpay.com"].includes(url.hostname) || url.username || url.password || url.port || url.hash) invalid();
  return url.href;
}

function validateBill(bill) {
  if (!bill || typeof bill !== "object" || Array.isArray(bill) || !UUID.test(bill.id || "") || bill.currency !== "INR") throw new BillingProviderError("invalid_bill");
  const amount = money(bill.amount_paise);
  if (amount < 100) throw new BillingProviderError("invalid_bill");
  const stableReceipt = receipt(bill.receipt);
  if (stableReceipt !== billingReceipt(bill.id)) throw new BillingProviderError("invalid_bill");
  return { amount, stableReceipt };
}

function boundedTimestamp(value) {
  if (value == null || value === "") return null;
  if (!Number.isSafeInteger(value) || value <= 0 || value > 253402300799) invalid();
  return new Date(value * 1000).toISOString();
}

function baseSnapshot(entity, bill) {
  const { amount, stableReceipt } = validateBill(bill);
  if (!entity || typeof entity !== "object" || entity.entity !== "invoice") invalid();
  const providerInvoiceId = id(entity.id, "inv");
  if (bill.provider_invoice_id && providerInvoiceId !== bill.provider_invoice_id) invalid();
  if (entity.receipt !== stableReceipt || entity.currency !== "INR" || money(entity.amount) !== amount || !STATES.has(entity.status)) invalid();
  if (entity.notes?.billing_id && entity.notes.billing_id !== bill.id) invalid();
  const orderId = id(entity.order_id, "order", true);
  if (bill.provider_order_id && orderId !== bill.provider_order_id) invalid();
  const paid = money(entity.amount_paid ?? 0), due = money(entity.amount_due ?? (amount - paid));
  // A cancelled/expired invoice may have no collectible balance. Its original amount remains immutable.
  if (paid > amount || due > amount || (["issued", "partially_paid", "paid"].includes(entity.status) && paid + due !== amount)) invalid();
  const paymentId = id(entity.payment_id, "pay", true);
  const url = entity.short_url ? safeRazorpayUrl(entity.short_url) : null;
  if (["issued", "partially_paid", "paid"].includes(entity.status) && (!orderId || !url)) invalid();
  return { snapshot: {
    provider_invoice_id: providerInvoiceId, receipt: stableReceipt, currency: "INR", amount_paise: amount,
    paid_paise: 0, refunded_paise: 0, provider_status: entity.status, provider_payment_id: paymentId,
    payment_url: url, invoice_url: url, paid_at: null, captured: false,
  }, orderId, reportedPaid: paid, entity };
}

/**
 * Server-only, single Razorpay account. No browser-selected amounts or URLs.
 * @param {{ keyId?: string, keySecret?: string, fetch?: typeof globalThis.fetch, timeoutMs?: number, maxPages?: number }} [config]
 */
export function createRazorpayClient({ keyId, keySecret, fetch: fetcher = globalThis.fetch, timeoutMs = 12000, maxPages = 5 } = {}) {
  if (typeof keyId !== "string" || !/^rzp_(live|test)_[A-Za-z0-9]+$/.test(keyId) || typeof keySecret !== "string" || !keySecret || /[\r\n:]/.test(keySecret)) throw new BillingProviderError("provider_not_configured");
  if (typeof fetcher !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10) throw new BillingProviderError("provider_not_configured");
  const authorization = `Basic ${btoa(`${keyId}:${keySecret}`)}`;

  async function call(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fetcher(`https://api.razorpay.com/v1/${path}`, { method, headers: { Authorization: authorization, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!result.ok) {
        const ambiguous = method === "POST" && (result.status >= 500 || result.status === 408);
        throw new BillingProviderError(ambiguous ? "provider_ambiguous" : result.status === 429 ? "provider_retry" : "provider_rejected", { status: result.status, ambiguous });
      }
      const raw = await result.text();
      if (raw.length > 1024 * 1024) throw new Error("oversize");
      let value; try { value = JSON.parse(raw); } catch { throw new Error("invalid_json"); }
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_json");
      return value;
    } catch (error) {
      if (error instanceof BillingProviderError) throw error;
      throw new BillingProviderError(method === "POST" ? "provider_ambiguous" : "provider_unavailable", { ambiguous: method === "POST" });
    } finally { clearTimeout(timer); }
  }

  async function refundsFor(paymentId, expectedAmount) {
    let refunded = 0; const seen = new Set();
    for (let page = 0; page < maxPages; page += 1) {
      const result = await call(`payments/${encodeURIComponent(paymentId)}/refunds?count=100&skip=${page * 100}`);
      if (!Array.isArray(result.items) || result.items.length > 100) invalid();
      for (const refund of result.items) {
        const refundId = id(refund?.id, "rfnd");
        if (seen.has(refundId) || refund.payment_id !== paymentId || refund.currency !== "INR" || !["pending", "processed", "failed"].includes(refund.status)) invalid();
        seen.add(refundId);
        const amount = money(refund.amount);
        if (refund.status === "processed") refunded += amount;
        if (!Number.isSafeInteger(refunded) || refunded > expectedAmount) invalid();
      }
      if (result.items.length < 100) return refunded;
    }
    throw new BillingProviderError("provider_scan_incomplete");
  }

  async function canonical(entity, bill) {
    const checked = baseSnapshot(entity, bill), snapshot = checked.snapshot;
    if (!snapshot.provider_payment_id) {
      if (checked.reportedPaid > 0 || entity.status === "paid") invalid();
      return snapshot;
    }
    const payment = await call(`payments/${encodeURIComponent(snapshot.provider_payment_id)}`);
    if (payment.entity !== "payment" || id(payment.id, "pay") !== snapshot.provider_payment_id || payment.invoice_id !== snapshot.provider_invoice_id || payment.order_id !== checked.orderId || payment.currency !== "INR" || money(payment.amount) !== snapshot.amount_paise) invalid();
    if (payment.captured !== true || !["captured", "refunded"].includes(payment.status)) {
      if (checked.reportedPaid > 0 || entity.status === "paid") invalid();
      return { ...snapshot, provider_payment_id: null };
    }
    // Partial payment is disabled on our invoices. Unexpected split collections need reconciliation, not invented totals.
    if (checked.reportedPaid !== 0 && checked.reportedPaid !== payment.amount) invalid();
    const refunded = await refundsFor(payment.id, payment.amount);
    return { ...snapshot, paid_paise: payment.amount, refunded_paise: refunded, captured: true, paid_at: boundedTimestamp(entity.paid_at || payment.created_at) };
  }

  async function createInvoice(bill) {
    const { amount, stableReceipt } = validateBill(bill);
    const parentName = plain(bill.parent_name, 80).slice(0, 50);
    const parentEmail = plain(bill.parent_email, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) throw new BillingProviderError("invalid_bill");
    const phone = bill.parent_phone ? plain(bill.parent_phone, 24) : "";
    if (phone && !/^\+?\d{7,15}$/.test(phone)) throw new BillingProviderError("invalid_bill");
    const lateFee = bill.kind === "late_fee" || bill.late_fee_paise > 0;
    const body = { type: "invoice", receipt: stableReceipt, description: lateFee ? "LetsAimIt late fee" : "LetsAimIt monthly fee", partial_payment: false,
      customer: { name: parentName, email: parentEmail, ...(phone ? { contact: phone } : {}) },
      line_items: [{ name: lateFee ? "Late fee" : "Monthly coaching", amount, currency: "INR", quantity: 1 }],
      sms_notify: false, email_notify: false, currency: "INR", notes: { billing_id: bill.id },
    };
    const entity = await call("invoices", { method: "POST", body });
    try { return await canonical(entity, bill); } catch (error) {
      // An invoice may already exist even if its response cannot safely be saved.
      throw new BillingProviderError("provider_ambiguous", { status: error?.status || 0, ambiguous: true });
    }
  }

  async function reconcileInvoice(bill) {
    validateBill(bill);
    const invoiceId = id(bill.provider_invoice_id, "inv");
    return canonical(await call(`invoices/${encodeURIComponent(invoiceId)}`), bill);
  }

  /** Close a known unpaid invoice, never its payment or refund history. Every retry starts with GET. */
  async function cancelInvoice(bill) {
    const before = await reconcileInvoice(bill);
    const terminal = snapshot => snapshot.paid_paise > 0 || ["cancelled", "expired", "deleted"].includes(snapshot.provider_status);
    if (terminal(before)) return before;
    // A stale provider read is not authority to cancel money already recorded locally.
    if ((Number.isSafeInteger(bill.paid_paise) && bill.paid_paise > before.paid_paise)
      || !["draft", "issued"].includes(before.provider_status)) invalid();
    const path = `invoices/${encodeURIComponent(before.provider_invoice_id)}/cancel`;
    try {
      const cancelled = await canonical(await call(path, { method: "POST" }), bill);
      if (terminal(cancelled)) return cancelled;
    } catch {
      // A concurrent payment or a lost cancellation response must be resolved from the provider.
      // No refund endpoint is involved and a rejected/ambiguous POST is never treated as success.
    }
    const after = await reconcileInvoice(bill);
    if (terminal(after)) return after;
    throw new BillingProviderError("provider_unavailable");
  }

  async function findByReceipt(bill) {
    validateBill(bill);
    const created = bill.from ?? bill.created ?? bill.created_at;
    let from = 0;
    if (created != null) {
      from = typeof created === "number" ? created : Math.floor(Date.parse(created) / 1000);
      if (!Number.isSafeInteger(from) || from < 0) throw new BillingProviderError("invalid_bill");
    }
    let matched = null;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await call(`invoices?count=100&skip=${page * 100}&from=${from}`);
      if (!Array.isArray(result.items) || result.items.length > 100) invalid();
      for (const candidate of result.items) {
        if (candidate?.receipt !== bill.receipt) continue;
        if (matched) throw new BillingProviderError("provider_duplicate_invoice");
        matched = candidate;
      }
      // Finish the bounded scan before returning a match so duplicated provider records cannot be hidden.
      if (result.items.length < 100) return matched ? canonical(matched, bill) : null;
    }
    throw new BillingProviderError("provider_scan_incomplete");
  }
  return { createInvoice, reconcileInvoice, findByReceipt, cancelInvoice };
}

const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");

export async function verifyRazorpaySignature(raw, signature, secret, crypto = globalThis.crypto) {
  if (!(raw instanceof Uint8Array) || typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature) || typeof secret !== "string" || secret.length < 16) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const received = Uint8Array.from(signature.match(/../g), value => parseInt(value, 16));
  return crypto.subtle.verify("HMAC", key, received, raw);
}

const json = (status, error = null) => new Response(JSON.stringify(error ? { ok: false, error } : { ok: true }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/**
 * Signature first, then minimal routing metadata; never acknowledge an unpersisted event.
 * @param {{ secret?: string, rpc?: (name: string, body: Record<string, unknown>) => Promise<unknown>, crypto?: Crypto, maxBytes?: number }} [config]
 */
export function createBillingWebhookHandler({ secret, rpc, crypto = globalThis.crypto, maxBytes = 256 * 1024 } = {}) {
  return async request => {
    if (request.method !== "POST") return json(405, "method_not_allowed");
    if (typeof secret !== "string" || secret.length < 16 || typeof rpc !== "function") return json(503, "not_configured");
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 256 * 1024) return json(503, "not_configured");
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) return json(413, "payload_too_large");
    const chunks = []; let size = 0;
    try {
      const reader = request.body?.getReader();
      if (!reader) return json(400, "invalid_payload");
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); return json(413, "payload_too_large"); }
        chunks.push(value);
      }
      const raw = new Uint8Array(size); let position = 0;
      for (const chunk of chunks) { raw.set(chunk, position); position += chunk.byteLength; }
      if (!await verifyRazorpaySignature(raw, request.headers.get("x-razorpay-signature"), secret, crypto)) return json(401, "invalid_signature");
      const eventId = request.headers.get("x-razorpay-event-id");
      if (!eventId || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) return json(400, "invalid_event_id");
      let event; try { event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); } catch { return json(400, "invalid_payload"); }
      if (!event || typeof event !== "object" || Array.isArray(event) || event.entity !== "event" || typeof event.event !== "string" || !/^(invoice|payment|refund)\.[a-z_]{1,40}$/.test(event.event)) return json(400, "invalid_payload");
      const invoice = event.payload?.invoice?.entity;
      const payment = event.payload?.payment?.entity;
      const refund = event.payload?.refund?.entity;
      let invoiceId, paymentId;
      try {
        invoiceId = id(invoice?.id || payment?.invoice_id, "inv", true);
        paymentId = id(payment?.id || refund?.payment_id || invoice?.payment_id, "pay", true);
        if (refund) id(refund.id, "rfnd");
        if (invoice && invoice.entity !== "invoice" || payment && payment.entity !== "payment" || refund && refund.entity !== "refund") invalid();
        if (invoice?.id && payment?.invoice_id && invoice.id !== payment.invoice_id || payment?.id && refund?.payment_id && payment.id !== refund.payment_id) invalid();
        if (!invoiceId && !paymentId) invalid();
      } catch { return json(400, "invalid_payload"); }
      const hash = hex(await crypto.subtle.digest("SHA-256", raw));
      try {
        const result = await rpc("ingest_billing_webhook", { p_event_id: eventId, p_invoice_id: invoiceId, p_payment_id: paymentId, p_event_type: event.event, p_payload_hash: hash });
        if (result !== true && result !== false) return json(503, "intake_unavailable");
        return json(200);
      } catch { return json(503, "intake_unavailable"); }
    } catch { return json(400, "invalid_payload"); }
  };
}
