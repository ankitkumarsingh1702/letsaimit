const statuses = new Set(["creating", "processing", "pending", "paid", "overdue", "cancelled", "expired", "refunded", "partially_refunded", "failed"]);
const text = value => typeof value === "string" ? value : "";
const optionalDate = value => value && Number.isFinite(Date.parse(value)) ? value : null;
const money = value => Number.isSafeInteger(value) && value >= 0;

export function publicBillingTerms(value) {
  if (!value || typeof value.enabled !== "boolean" || typeof value.team_testing !== "boolean"
    || !money(value.charge_amount_paise) || !money(value.regular_amount_paise) || !money(value.late_fee_paise)
    || value.due_day !== 5 || value.late_fee_policy !== "daily" || typeof value.late_fees_enabled !== "boolean"
    || !/^billing-\d{4}-\d{2}-\d{2}-[a-f0-9]{64}$/.test(value.version || "")) throw new Error("Payment details could not load. Please retry.");
  return { enabled: value.enabled, teamTesting: value.team_testing, chargeAmountPaise: value.charge_amount_paise,
    regularAmountPaise: value.regular_amount_paise, lateFeePaise: value.late_fee_paise,
    lateFeesEnabled: value.late_fees_enabled, dueDay: value.due_day, version: value.version };
}

/** Public pricing only. This RPC never returns registrations, identities or credentials. */
export async function fetchBillingTerms(client) {
  if (!client) throw new Error("Payment details could not load. Please retry.");
  const { data, error } = await client.rpc("get_billing_terms");
  if (error) throw new Error("Payment details could not load. Please retry.");
  return publicBillingTerms(data);
}

export function safeRazorpayUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!["razorpay.com", "rzp.io"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    return url.href;
  } catch { return null; }
}

export function billingInvoice(record) {
  if (!record || !text(record.id) || !text(record.registration_id) || record.currency !== "INR" || !statuses.has(record.status)
    || !money(record.amount_paise) || !money(record.paid_paise) || !money(record.refunded_paise)
    || !money(record.base_amount_paise) || !money(record.late_fee_paise)
    || !optionalDate(record.created_at) || !optionalDate(record.period_start) || !optionalDate(record.due_date)) {
    throw new Error("The saved invoice could not be confirmed.");
  }
  if (record.amount_paise !== record.base_amount_paise + record.late_fee_paise || record.refunded_paise > record.paid_paise) {
    throw new Error("The saved invoice totals could not be confirmed.");
  }
  return { id: record.id, registrationId: record.registration_id, number: text(record.invoice_number) || record.id,
    childName: text(record.child_name), parentName: text(record.parent_name), parentEmail: text(record.parent_email),
    community: text(record.community), sport: text(record.sport), periodStart: record.period_start, dueDate: record.due_date,
    currency: "INR", amountPaise: record.amount_paise, baseAmountPaise: record.base_amount_paise,
    lateFeePaise: record.late_fee_paise, paidPaise: record.paid_paise, refundedPaise: record.refunded_paise,
    kind: record.kind === "late_fee" ? "late_fee" : "monthly", baseInvoiceId: text(record.base_invoice_id),
    teamTesting: record.team_testing === true, lateFeePreviewPaise: money(record.late_fee_preview_paise) ? record.late_fee_preview_paise : 0,
    status: record.status, paymentUrl: safeRazorpayUrl(record.payment_url), invoiceUrl: safeRazorpayUrl(record.invoice_url),
    createdAt: record.created_at, updatedAt: optionalDate(record.updated_at), paidAt: optionalDate(record.paid_at) };
}

export function billingSnapshot(value, { admin = false } = {}) {
  if (!value || !Array.isArray(value.invoices) || !value.settings || !money(value.settings.regular_amount_paise)
    || !money(value.settings.charge_amount_paise) || typeof value.settings.team_testing !== "boolean") throw new Error("Billing could not load. Please retry.");
  const settings = value.settings;
  const summary = value.summary;
  if (admin && (!summary || !["captured_paise", "refunded_paise", "outstanding_paise", "paid_count", "pending_count", "overdue_count"].every(key => money(summary[key])))) {
    throw new Error("Billing totals could not be confirmed.");
  }
  return {
    invoices: value.invoices.map(billingInvoice),
    hasMore: value.has_more === true,
    accounts: (value.accounts || []).map(account => {
      if (!text(account.id) || !text(account.registration_id) || !["active", "cancelled"].includes(account.status) || !Number.isSafeInteger(account.revision) || account.revision < 1) throw new Error("Monthly billing could not be confirmed.");
      return { id: account.id, registrationId: account.registration_id, status: account.status, revision: account.revision,
        parentName: text(account.parent_name), childName: text(account.child_name), createdAt: optionalDate(account.created_at), cancelledAt: optionalDate(account.cancelled_at) };
    }),
    settings: { regularAmountPaise: settings.regular_amount_paise, chargeAmountPaise: settings.charge_amount_paise,
      enabled: settings.enabled === true, teamTesting: settings.team_testing, dueDay: settings.due_day === 5 ? 5 : null,
      lateFeesEnabled: settings.late_fees_enabled === true,
      lateFeePaise: money(settings.late_fee_paise) ? settings.late_fee_paise : null,
      lateFeePolicy: ["disabled", "pending", "once", "daily"].includes(settings.late_fee_policy) ? settings.late_fee_policy : "disabled" },
    summary: admin ? { capturedPaise: summary.captured_paise, refundedPaise: summary.refunded_paise,
      outstandingPaise: summary.outstanding_paise, paidCount: summary.paid_count,
      pendingCount: summary.pending_count, overdueCount: summary.overdue_count } : null,
  };
}

export async function fetchBilling({ client, verifyGoogleUser, checkAccess, userId, admin = false }) {
  async function verify() {
    const user = await verifyGoogleUser();
    if (!user?.isGoogle || user.id !== userId) throw Object.assign(new Error("Sign in with the same Google account to open billing."), { code: "identity_changed" });
    if (admin && !await checkAccess()) throw Object.assign(new Error("Admin access is required."), { code: "access_denied" });
  }
  await verify();
  const { data, error } = await client.rpc(admin ? "list_admin_billing" : "list_my_billing");
  if (error) throw Object.assign(new Error("Billing could not load. Please retry."), { code: ["42501", "PGRST301", "PGRST302"].includes(error.code) ? "access_denied" : "request_failed" });
  await verify();
  return billingSnapshot(data, { admin });
}

export async function stopMonthlyBilling({ client, verifyGoogleUser, checkAccess, userId, account }) {
  if (!account?.registrationId || !Number.isSafeInteger(account.revision) || account.revision < 1 || account.status !== "active") throw new Error("Refresh monthly billing before trying again.");
  const verify = async () => {
    const user = await verifyGoogleUser();
    if (!user?.isGoogle || user.id !== userId || !await checkAccess()) throw new Error("Admin access is required.");
  };
  await verify();
  const { data, error } = await client.rpc("cancel_billing_account", { p_registration_id: account.registrationId, p_expected_revision: account.revision });
  if (error) throw new Error(error.code === "PT409" ? "Billing changed. Refresh before trying again." : "The change could not be confirmed. Please retry.");
  await verify();
  const saved = Array.isArray(data) ? data[0] : data;
  if (saved?.registration_id !== account.registrationId || saved.status !== "cancelled" || !Number.isSafeInteger(saved.revision) || saved.revision <= account.revision) throw new Error("The change could not be confirmed. Refresh before trying again.");
  return saved;
}

export const BILLING_STATUS_LABELS = { creating: "Preparing", processing: "Processing", pending: "Unpaid", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled", expired: "Expired", refunded: "Refunded", partially_refunded: "Part refunded", failed: "Needs attention" };
export function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(value / 100);
}
export function filterBillingInvoices(rows, { query = "", status = "" } = {}) {
  const term = query.trim().toLocaleLowerCase("en-IN");
  return rows.filter(row => (!status || row.status === status) && (!term || [row.number, row.parentName, row.parentEmail, row.childName, row.community, row.sport].some(value => value.toLocaleLowerCase("en-IN").includes(term))));
}

export function billingCsv(rows) {
  const columns = [["invoice", "number"], ["parent", "parentName"], ["email", "parentEmail"], ["child", "childName"], ["community", "community"], ["sport", "sport"], ["period_start", "periodStart"], ["due_date", "dueDate"], ["status", "status"], ["currency", "currency"], ["base_paise", "baseAmountPaise"], ["late_fee_paise", "lateFeePaise"], ["total_paise", "amountPaise"], ["paid_paise", "paidPaise"], ["refunded_paise", "refundedPaise"], ["paid_at_utc", "paidAt"], ["invoice_url", "invoiceUrl"]];
  const escape = value => {
    let cell = value == null ? "" : String(value);
    if (/^[\s\u200B-\u200F\u2060\uFEFF]*[=+@-]/u.test(cell) || /^[\s\u200B-\u200F\u2060\uFEFF]*[\t\r\n]/u.test(cell)) cell = `'${cell}`;
    return `"${cell.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [columns.map(([name]) => escape(name)).join(","), ...rows.map(row => columns.map(([, key]) => escape(row[key])).join(","))].join("\r\n");
}
