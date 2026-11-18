import { BILLING_STATUS_LABELS, safeRazorpayUrl } from '../billing/billingData.js';
import { parseMonthlyFeeInput, validMonthlyFeePaise } from '../billing/fee-model.js';
import { validTrackerDate, verifyActor } from './trackerData.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activityTypes = new Set(['invoice_created', 'outstanding_adjusted', 'monthly_fee_changed', 'payment_captured', 'refund_recorded']);
const activityStatuses = new Set(['applied', 'pending', 'payment_received', 'failed', 'account_closed']);
const adjustableStatuses = new Set(['creating', 'pending', 'overdue']);
const invoiceKinds = new Set(['monthly', 'one_off', 'late_fee']);
const providerActivity = new Set(['payment_captured', 'refund_recorded']);
const money = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const text = value => typeof value === 'string' ? value.trim() : '';
const optionalId = value => value == null || uuid.test(value);
const issue = (message, code) => Object.assign(new Error(message), { code });

export const MAX_INVOICE_DESCRIPTION = 80;
export const MAX_ADJUSTMENT_REASON = 300;

function invoiceDetails(invoice) {
  if (!uuid.test(invoice?.id || '') || !validTrackerDate(invoice.periodStart) || !timestamp(invoice.dueAt)
    || (invoice.paidAt != null && !timestamp(invoice.paidAt)) || (invoice.createdAt != null && !timestamp(invoice.createdAt))
    || !Object.hasOwn(BILLING_STATUS_LABELS, invoice.status) || (invoice.kind != null && !invoiceKinds.has(invoice.kind))
    || !optionalId(invoice.replacesInvoiceId)
    || ![invoice.amountPaise, invoice.paidPaise, invoice.refundedPaise].every(money)
    || invoice.paidPaise > invoice.amountPaise || invoice.refundedPaise > invoice.paidPaise) {
    throw new Error('A saved invoice could not be confirmed.');
  }
  const { id, periodStart, dueAt, paidAt, amountPaise, paidPaise, refundedPaise, status } = invoice;
  const adjustmentPending = invoice.adjustmentPending === true;
  const canLink = !adjustmentPending && invoice.kind !== 'late_fee';
  return { id, periodStart, dueAt, paidAt: paidAt ?? null, amountPaise, paidPaise, refundedPaise, status,
    kind: invoice.kind ?? 'monthly', description: text(invoice.description), createdAt: invoice.createdAt ?? null,
    replacesInvoiceId: invoice.replacesInvoiceId ?? null, adjustmentPending,
    invoiceUrl: canLink ? safeRazorpayUrl(invoice.invoiceUrl) : null, paymentUrl: canLink ? safeRazorpayUrl(invoice.paymentUrl) : null,
    canAdjust: canLink && invoice.canAdjust === true && invoice.paidPaise === 0 && adjustableStatuses.has(status) };
}

function activityDetails(event) {
  const validId = providerActivity.has(event?.type) ? /^payment-[1-9]\d*$/.test(event.id || '') : uuid.test(event?.id || '');
  if (!validId || !activityTypes.has(event.type) || !activityStatuses.has(event.status)
    || !timestamp(event.occurredAt) || ![event.amountPaise, event.previousAmountPaise].every(value => value == null || money(value))
    || (event.effectiveMonth != null && !validTrackerDate(event.effectiveMonth))
    || ![event.invoiceId, event.replacementInvoiceId].every(optionalId)) {
    throw new Error('A payment activity entry could not be confirmed.');
  }
  const { id, type, occurredAt, amountPaise, previousAmountPaise, invoiceId, replacementInvoiceId, status, effectiveMonth } = event;
  return { id, type, occurredAt, amountPaise, previousAmountPaise, invoiceId, replacementInvoiceId, status, effectiveMonth,
    actorEmail: text(event.actorEmail), reason: text(event.reason) };
}

export function studentBillingDetails(billing, registrationId) {
  if (billing == null) return null;
  const plannedFee = billing.accountStatus === 'active'
    ? money(billing.nextMonthAmountPaise) && validTrackerDate(billing.nextMonth)
    : billing.nextMonthAmountPaise == null && billing.nextMonth == null;
  if (billing.currency !== 'INR' || !['active', 'cancelled'].includes(billing.accountStatus)
    || ![billing.monthlyAmountPaise, billing.outstandingPaise].every(money) || !plannedFee
    || (billing.nextDueAt != null && !timestamp(billing.nextDueAt)) || !Array.isArray(billing.invoices)
    || (billing.activity != null && !Array.isArray(billing.activity))) throw new Error('Payment history could not be confirmed.');

  const invoices = billing.invoices.map(invoiceDetails);
  const activity = (billing.activity ?? []).map(activityDetails);
  if (new Set(invoices.map(invoice => invoice.id)).size !== invoices.length
    || new Set(activity.map(event => event.id)).size !== activity.length) throw new Error('Payment history could not be confirmed.');

  const { accountStatus, monthlyAmountPaise, nextMonthAmountPaise, nextMonth, outstandingPaise, nextDueAt } = billing;
  let account = null;
  if (billing.accountId != null) {
    if (!uuid.test(billing.accountId) || !Number.isSafeInteger(billing.accountRevision) || billing.accountRevision < 1
      || !['custom_quote', 'legacy'].includes(billing.pricingModel) || !validMonthlyFeePaise(monthlyAmountPaise)
      || (accountStatus === 'active' && !validMonthlyFeePaise(nextMonthAmountPaise))) throw new Error('The billing account could not be confirmed.');
    account = { id: billing.accountId, registrationId, status: accountStatus, revision: billing.accountRevision,
      pricingModel: billing.pricingModel, monthlyAmountPaise, nextMonthAmountPaise, nextEffectiveMonth: nextMonth };
  }
  return { accountStatus, monthlyAmountPaise, nextMonthAmountPaise, nextMonth, outstandingPaise,
    nextDueAt: nextDueAt ?? null, invoices, activity, account,
    canManageInvoices: billing.canManageInvoices === true && account?.status === 'active' && account.pricingModel === 'custom_quote' };
}

export function parseInvoiceAmount(value, { allowZero = false } = {}) {
  if (allowZero && typeof value === 'string' && /^0(?:\.0{1,2})?$/.test(value.trim())) return 0;
  return parseMonthlyFeeInput(value);
}

function invoiceError(error) {
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code)) return issue('Admin access is required for this change.', 'access_denied');
  if (['40001', 'PT409'].includes(error?.code)) return issue('Billing changed. Close this form and load the latest details.', 'conflict');
  if (['22023', 'PT400'].includes(error?.code)) return issue('Check the amount, due date, and description or reason.', 'validation');
  return issue('The request could not be confirmed. Retry to check the same request.', 'request_uncertain');
}

async function submitInvoiceChange(options, name, params, expectedInvoice) {
  const { client, checkAccess, registrationId, requestId } = options;
  if (!uuid.test(registrationId || '') || !uuid.test(requestId || '')) throw issue('Reload the student before saving.', 'validation');
  const verify = async () => {
    await verifyActor(options);
    if (!await checkAccess?.()) throw issue('Admin access is required for this change.', 'access_denied');
  };
  await verify();
  let result;
  try {
    result = await client.rpc(name, { p_registration_id: registrationId, ...params, p_request_id: requestId });
  } catch (error) { throw invoiceError(error); }
  if (result.error) throw invoiceError(result.error);
  await verify();
  const receipt = result.data;
  if (receipt?.id !== requestId || !uuid.test(receipt.invoiceId || '') || !optionalId(receipt.replacementInvoiceId)
    || (expectedInvoice ? receipt.invoiceId !== expectedInvoice || !activityStatuses.has(receipt.status) : receipt.status !== 'applied')) throw invoiceError();
  return { id: receipt.id, invoiceId: receipt.invoiceId, replacementInvoiceId: receipt.replacementInvoiceId ?? null, status: receipt.status };
}

export async function createStudentPaymentInvoice(options) {
  const { amountPaise, dueDate } = options;
  const description = text(options.description);
  if (!validMonthlyFeePaise(amountPaise) || !validTrackerDate(dueDate) || description.length > MAX_INVOICE_DESCRIPTION || /[\p{Cc}<>]/u.test(description)) {
    throw issue('Check the amount, due date, and description.', 'validation');
  }
  // The server validates the date window for new requests and can replay an earlier receipt after midnight IST.
  return submitInvoiceChange(options, 'create_student_payment_invoice', {
    p_amount_paise: amountPaise, p_due_date: dueDate, p_description: description,
  });
}

export async function adjustStudentPaymentInvoice(options) {
  const { invoiceId, expectedAmountPaise, amountPaise } = options;
  const reason = text(options.reason);
  if (!uuid.test(invoiceId || '') || !money(expectedAmountPaise) || expectedAmountPaise === 0 || amountPaise === expectedAmountPaise
    || (amountPaise !== 0 && !validMonthlyFeePaise(amountPaise)) || !reason || reason.length > MAX_ADJUSTMENT_REASON
    || /[\p{Cc}<>]/u.test(reason)) {
    throw issue('Enter a new outstanding amount and a reason on one line.', 'validation');
  }
  return submitInvoiceChange(options, 'adjust_student_payment_invoice', {
    p_invoice_id: invoiceId, p_expected_amount_paise: expectedAmountPaise, p_amount_paise: amountPaise, p_reason: reason,
  }, invoiceId);
}
