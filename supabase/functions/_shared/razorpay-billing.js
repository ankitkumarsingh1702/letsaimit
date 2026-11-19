const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^(inv|pay|order|rfnd)_[A-Za-z0-9]{6,40}$/;
const RECEIPT = /^[A-Za-z0-9_-]{1,40}$/;
const STATES = new Set(["draft", "issued", "partially_paid", "paid", "cancelled", "expired", "deleted"]);
const CLOSED_STATES = new Set(["cancelled", "expired", "deleted"]);
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

/** A signed invoice may identify its local intent before provider IDs are saved. */
function invoiceBillingId(entity) {
  const value = entity?.receipt;
  const match = typeof value === "string" ? /^LAI([0-9a-f]{32})$/.exec(value) : null;
  const fromReceipt = match ? match[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5") : null;
  const note = entity?.notes?.billing_id;
  if (note != null && (typeof note !== "string" || !UUID.test(note))) invalid();
  const fromNote = typeof note === "string" ? note.toLowerCase() : null;
  if (typeof value === "string" && /^LAI/i.test(value) && !fromReceipt) invalid();
  if (fromReceipt && fromNote && fromReceipt !== fromNote) invalid();
  if (fromNote && value != null && value !== "" && !fromReceipt) invalid();
  return fromReceipt ?? fromNote;
}

function explicitForeignReceipt(entity) {
  return typeof entity?.receipt === "string" && entity.receipt.length > 0
    && !/^LAI/i.test(entity.receipt) && entity?.notes?.billing_id == null;
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

export function isLateFeeInvoice(bill) {
  return bill?.kind === "late_fee" || bill?.late_fee_paise > 0;
}

export function oneOffInvoiceDescription(bill) {
  if (bill?.kind !== "one_off") return null;
  const value = bill.description ?? "One-off payment";
  if (typeof value !== "string" || !value.trim() || [...value].length > 80 || /[\p{Cc}<>]/u.test(value)) {
    throw new BillingProviderError("invalid_bill");
  }
  return value.trim();
}

export function isTerminalInvoiceSnapshot(snapshot) {
  return Boolean(snapshot && (CLOSED_STATES.has(snapshot.provider_status) || (snapshot.captured === true && snapshot.paid_paise > 0)));
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
  const reportedOrderId = id(entity.order_id, "order", true);
  const savedOrderId = id(bill.provider_order_id, "order", true);
  // Razorpay can omit the order when it closes an invoice. Keep a previously verified order for payment matching.
  const orderId = reportedOrderId ?? (CLOSED_STATES.has(entity.status) ? savedOrderId : null);
  if (savedOrderId && orderId !== savedOrderId) invalid();
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

  async function call(path, { method = "GET", body, signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fetcher(`https://api.razorpay.com/v1/${path}`, { method, headers: { Authorization: authorization, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
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
    if (payment.entity !== "payment" || id(payment.id, "pay") !== snapshot.provider_payment_id || payment.invoice_id !== snapshot.provider_invoice_id || !checked.orderId || payment.order_id !== checked.orderId || payment.currency !== "INR" || money(payment.amount) !== snapshot.amount_paise) invalid();
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
    if (isLateFeeInvoice(bill)) throw new BillingProviderError("invalid_bill");
    const { amount, stableReceipt } = validateBill(bill);
    const oneOffDescription = oneOffInvoiceDescription(bill);
    const parentName = plain(bill.parent_name, 80).slice(0, 50);
    const parentEmail = plain(bill.parent_email, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) throw new BillingProviderError("invalid_bill");
    const phone = bill.parent_phone ? plain(bill.parent_phone, 24) : "";
    if (phone && !/^\+?\d{7,15}$/.test(phone)) throw new BillingProviderError("invalid_bill");
    const body = { type: "invoice", receipt: stableReceipt, description: oneOffDescription ? `LetsAimIt: ${oneOffDescription}` : "LetsAimIt monthly fee", partial_payment: false,
      customer: { name: parentName, email: parentEmail, ...(phone ? { contact: phone } : {}) },
      line_items: [{ name: oneOffDescription ?? "Monthly coaching", amount, currency: "INR", quantity: 1 }],
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
    // A stale provider read is not authority to close an invoice with locally recorded money.
    if (Number.isSafeInteger(bill.paid_paise) && bill.paid_paise > before.paid_paise) invalid();
    if (isTerminalInvoiceSnapshot(before)) return before;
    if (!["draft", "issued"].includes(before.provider_status)) invalid();
    const path = `invoices/${encodeURIComponent(before.provider_invoice_id)}/cancel`;
    try {
      const cancelled = await canonical(await call(path, { method: "POST" }), bill);
      if (isTerminalInvoiceSnapshot(cancelled)) return cancelled;
    } catch {
      // A concurrent payment or a lost cancellation response must be resolved from the provider.
      // No refund endpoint is involved and a rejected/ambiguous POST is never treated as success.
    }
    const after = await reconcileInvoice(bill);
    if (isTerminalInvoiceSnapshot(after)) return after;
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

  /** At most two exact GETs, used only when signed webhook routing is unresolved. */
  async function resolveWebhookOwnership({ invoiceId, paymentId }, { signal } = {}) {
    let providerInvoiceId = id(invoiceId, "inv", true);
    if (!providerInvoiceId) {
      const providerPaymentId = id(paymentId, "pay");
      const payment = await call(`payments/${encodeURIComponent(providerPaymentId)}`, { signal });
      if (payment.entity !== "payment" || id(payment.id, "pay") !== providerPaymentId) invalid();
      // An absent invoice association is not positive evidence of another
      // target. Preserve retryability if the provider association is not ready.
      if (payment.invoice_id == null) throw new BillingProviderError("ownership_unresolved");
      providerInvoiceId = id(payment.invoice_id, "inv");
    }
    const invoice = await call(`invoices/${encodeURIComponent(providerInvoiceId)}`, { signal });
    if (invoice.entity !== "invoice" || id(invoice.id, "inv") !== providerInvoiceId) invalid();
    const billingId = invoiceBillingId(invoice);
    if (billingId) return { foreign: false, invoiceId: providerInvoiceId, billingId };
    if (explicitForeignReceipt(invoice)) return { foreign: true, invoiceId: providerInvoiceId, billingId: null };
    throw new BillingProviderError("ownership_unresolved");
  }
  return { createInvoice, reconcileInvoice, findByReceipt, cancelInvoice, resolveWebhookOwnership };
}

const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");

export async function verifyRazorpaySignature(raw, signature, secret, crypto = globalThis.crypto) {
  if (!(raw instanceof Uint8Array) || typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature) || typeof secret !== "string" || secret.length < 16) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const received = Uint8Array.from(signature.match(/../g), value => parseInt(value, 16));
  return crypto.subtle.verify("HMAC", key, received, raw);
}

const json = (status, error = null) => new Response(JSON.stringify(error ? { ok: false, error } : { ok: true }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function webhookStep(action, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new BillingProviderError("ownership_unresolved"));
    if (signal.aborted) return aborted();
    const finish = callback => value => {
      signal.removeEventListener("abort", aborted);
      callback(value);
    };
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve().then(action).then(finish(resolve), finish(reject));
  });
}

function intakeStatus(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)
    || !["accepted", "duplicate", "foreign", "unresolved"].includes(result.status)) {
    throw new BillingProviderError("intake_unavailable");
  }
  return result.status;
}

/**
 * Authenticate, establish local ownership, then durably retain local events.
 * Unknown payment/refund IDs may use two exact provider GETs within one deadline.
 * @param {{ secret?: string, rpc?: (name: string, body: Record<string, unknown>, options?: { signal: AbortSignal }) => Promise<unknown>, resolveOwnership?: (ids: { invoiceId: string | null, paymentId: string | null }, options: { signal: AbortSignal }) => Promise<{ foreign: boolean, invoiceId: string | null, billingId: string | null }>, crypto?: Crypto, maxBytes?: number, maxDurationMs?: number }} [config]
 */
export function createBillingWebhookHandler({ secret, rpc, resolveOwnership, crypto = globalThis.crypto, maxBytes = 256 * 1024, maxDurationMs = 4000 } = {}) {
  return async request => {
    if (request.method !== "POST") return json(405, "method_not_allowed");
    if (typeof secret !== "string" || secret.length < 16 || typeof rpc !== "function") return json(503, "not_configured");
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 256 * 1024) return json(503, "not_configured");
    if (!Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 4500) return json(503, "not_configured");
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) return json(413, "payload_too_large");
    const chunks = []; let size = 0;
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), maxDurationMs);
    const step = action => webhookStep(action, deadline.signal);
    let reader;
    try {
      reader = request.body?.getReader();
      if (!reader) return json(400, "invalid_payload");
      for (;;) {
        const { value, done } = await step(() => reader.read()); if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await step(() => reader.cancel()); return json(413, "payload_too_large"); }
        chunks.push(value);
      }
      const raw = new Uint8Array(size); let position = 0;
      for (const chunk of chunks) { raw.set(chunk, position); position += chunk.byteLength; }
      if (!await step(() => verifyRazorpaySignature(raw, request.headers.get("x-razorpay-signature"), secret, crypto))) return json(401, "invalid_signature");
      const eventId = request.headers.get("x-razorpay-event-id");
      if (!eventId || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) return json(400, "invalid_event_id");
      let event; try { event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); } catch { return json(400, "invalid_payload"); }
      if (!event || typeof event !== "object" || Array.isArray(event) || event.entity !== "event" || typeof event.event !== "string" || !/^(invoice|payment|refund)\.[a-z_]{1,40}$/.test(event.event)) return json(400, "invalid_payload");
      const invoice = event.payload?.invoice?.entity;
      const payment = event.payload?.payment?.entity;
      const refund = event.payload?.refund?.entity;
      let invoiceId, paymentId, billingId;
      try {
        invoiceId = id(invoice?.id || payment?.invoice_id, "inv", true);
        paymentId = id(payment?.id || refund?.payment_id || invoice?.payment_id, "pay", true);
        if (refund) id(refund.id, "rfnd");
        if (invoice && invoice.entity !== "invoice" || payment && payment.entity !== "payment" || refund && refund.entity !== "refund") invalid();
        if (invoice?.id && payment?.invoice_id && invoice.id !== payment.invoice_id || payment?.id && refund?.payment_id && payment.id !== refund.payment_id) invalid();
        if (!invoiceId && !paymentId) invalid();
        billingId = invoiceBillingId(invoice);
        const paymentNote = payment?.notes?.billing_id;
        if (paymentNote != null) {
          if (typeof paymentNote !== "string" || !UUID.test(paymentNote)
            || billingId && billingId !== paymentNote.toLowerCase()) invalid();
          billingId ??= paymentNote.toLowerCase();
        }
      } catch { return json(400, "invalid_payload"); }
      const hash = hex(await step(() => crypto.subtle.digest("SHA-256", raw)));
      const args = { p_event_id: eventId, p_invoice_id: invoiceId, p_payment_id: paymentId, p_event_type: event.event, p_payload_hash: hash, p_billing_id: billingId };
      const intake = body => step(() => rpc("ingest_owned_billing_webhook", body, { signal: deadline.signal }));
      try {
        const status = intakeStatus(await intake(args));
        if (status !== "unresolved") return json(200);
        if (explicitForeignReceipt(invoice)) return json(200);
        if (!/^(payment|refund)\./.test(event.event) || typeof resolveOwnership !== "function") return json(503, "ownership_unresolved");
        let ownership;
        try {
          ownership = await step(() => resolveOwnership({ invoiceId, paymentId }, { signal: deadline.signal }));
          if (!ownership || typeof ownership.foreign !== "boolean") invalid();
          const resolvedInvoiceId = id(ownership.invoiceId, "inv", true);
          if (invoiceId && resolvedInvoiceId !== invoiceId) invalid();
          if (ownership.foreign) {
            if (ownership.billingId !== null) invalid();
            return json(200);
          }
          if (!resolvedInvoiceId || typeof ownership.billingId !== "string" || !UUID.test(ownership.billingId)) invalid();
          const result = intakeStatus(await intake({ ...args, p_invoice_id: resolvedInvoiceId, p_billing_id: ownership.billingId.toLowerCase() }));
          return result === "unresolved" ? json(503, "ownership_unresolved") : json(200);
        } catch { return json(503, "ownership_unresolved"); }
      } catch { return json(503, "intake_unavailable"); }
    } catch { return deadline.signal.aborted ? json(503, "ownership_unresolved") : json(400, "invalid_payload"); }
    finally {
      clearTimeout(timer);
      deadline.abort();
      // Cleanup must not keep an incomplete request body alive after the reply.
      if (reader) reader.cancel().catch(() => {});
    }
  };
}
