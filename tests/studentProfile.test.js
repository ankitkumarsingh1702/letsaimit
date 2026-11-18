import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fetchStudentProfile } from '../src/features/tracker/studentProfileData.js';
import { adjustStudentPaymentInvoice, createStudentPaymentInvoice, parseInvoiceAmount } from '../src/features/tracker/studentBillingData.js';

const registrationId = 'c6fa700e-ce24-4b11-9d5c-7417d7724c01';
const requestId = 'c6fa700e-ce24-4b11-9d5c-7417d7724c04';
const actor = { id: 'fixture-admin', email: 'admin@example.test', isGoogle: true };
const invoices = [
  { id: 'c6fa700e-ce24-4b11-9d5c-7417d7724c02', periodStart: '2026-11-01', dueAt: '2026-11-05T04:30:00Z',
    paidAt: null, amountPaise: 70000, paidPaise: 0, refundedPaise: 0, status: 'overdue', canAdjust: true },
  { id: 'c6fa700e-ce24-4b11-9d5c-7417d7724c03', periodStart: '2026-10-01', dueAt: '2026-10-05T04:30:00Z',
    paidAt: '2026-10-02T19:00:00Z', amountPaise: 65000, paidPaise: 65000, refundedPaise: 0, status: 'paid',
    invoiceUrl: 'https://razorpay.com/receipt' },
];
const activity = [{ id: 'payment-420', type: 'payment_captured', invoiceId: invoices[1].id, amountPaise: 65000,
  status: 'applied', occurredAt: invoices[1].paidAt }];
const row = {
  registrationId, childName: 'Example child', age: '9', school: '', sport: 'Football', community: 'Nambiar Ellegenza',
  parentName: 'Example guardian', parentEmail: 'guardian+alias@example.test', parentPhone: '+919876543210',
  phoneCountry: 'IN', address: 'Example address', followUpStatus: 'confirmed', followUpNote: 'Private team note',
  submittedAt: '2026-09-01T05:30:00Z', acceptedAt: '2026-09-02T05:30:00Z', guardianConsent: true,
  termsAccepted: true, billingConsent: true, billingTermsVersion: 'saved-billing-version', feedback: [],
  billing: { accountStatus: 'active', currency: 'INR', monthlyAmountPaise: 70000, nextMonthAmountPaise: 75000,
    nextMonth: '2026-12-01', outstandingPaise: 70000, nextDueAt: invoices[0].dueAt, invoices, activity,
    accountId: 'c6fa700e-ce24-4b11-9d5c-7417d7724c05', accountRevision: 3, pricingModel: 'custom_quote', canManageInvoices: true },
};

function options(scope, overrides = {}) {
  return { scope, registrationId, userId: actor.id, verifyGoogleUser: async () => actor,
    client: { rpc: async (name, params) => {
      assert.equal(name, 'list_coaching_student_profile');
      assert.deepEqual(params, { p_registration_id: registrationId, p_scope: scope });
      return { data: row };
    } }, ...overrides };
}

test('student detail requests bind to one student and one staff scope', async () => {
  const admin = await fetchStudentProfile(options('admin'));
  assert.equal(admin.billing.outstandingPaise, 70000);
  assert.equal(admin.billing.invoices[1].paidAt, '2026-10-02T19:00:00Z');
  assert.equal(admin.followUpNote, 'Private team note');
  const coach = await fetchStudentProfile(options('coach'));
  assert.equal(coach.parentEmail, row.parentEmail);
  assert.equal(coach.billing, null);
  assert.equal(coach.billingConsent, null);
  assert.equal(coach.billingTermsVersion, '');
  assert.equal(coach.followUpNote, '');
  await assert.rejects(fetchStudentProfile(options('admin', {
    client: { rpc: async () => ({ data: { ...row, registrationId: invoices[0].id } }) },
  })), /could not be confirmed/);
  let verification = 0;
  await assert.rejects(fetchStudentProfile(options('admin', {
    verifyGoogleUser: async () => ++verification === 1 ? actor : { ...actor, id: 'different-user' },
  })), { code: 'identity_changed' });
});

test('student payments preserve recorded dates and separate expected fees from cleared invoices', async t => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
  t.after(() => vite.close());
  const { StudentOverview, StudentBilling } = await vite.ssrLoadModule('/src/features/tracker/StudentProfileDetails.jsx');
  const details = { profile: await fetchStudentProfile(options('admin')), error: '', loading: false };
  const overview = renderToStaticMarkup(React.createElement(StudentOverview, { details }));
  assert.match(overview, /<dt>School<\/dt><dd>Not recorded<\/dd>/);
  assert.match(overview, /mailto:guardian%2Balias@example\.test/);
  assert.match(overview, /tel:\+919876543210/);

  const html = renderToStaticMarkup(React.createElement(StudentBilling, { details, auth: { user: actor } }));
  assert.match(html, /From <time[^>]*>December 2026<\/time> · <strong>₹750/);
  assert.match(html, /October 2026[^]*?Paid[^]*?3 Oct 2026[^]*?5 Oct 2026/);
  assert.match(html, /November 2026[^]*?5 Nov 2026[^]*?Overdue/);
  assert.match(html, /Create invoice/);
  assert.match(html, /Change monthly fee/);
  assert.match(html, /Adjust outstanding/);
  assert.match(html, /Payment activity[^]*?Payment received[^]*?3 Oct 2026/);
  assert.match(html, /href="https:\/\/razorpay\.com\/receipt"/);
  assert.doesNotMatch(html, /<table/);
  assert.match(html, /href="\/admin\/\?view=billing"/);
  const stopped = await fetchStudentProfile(options('admin', {
    client: { rpc: async () => ({ data: { ...row, billing: { ...row.billing, accountStatus: 'cancelled', nextMonth: null, nextMonthAmountPaise: null } } }) },
  }));
  const stoppedHtml = renderToStaticMarkup(React.createElement(StudentBilling, { details: { ...details, profile: stopped } }));
  assert.match(stoppedHtml, /Monthly billing stopped/);
  assert.match(stoppedHtml, /October 2026[^]*?3 Oct 2026/);
});

test('payment edits use explicit rupees, a fresh admin check, and a stable retry receipt', async () => {
  assert.equal(parseInvoiceAmount('5000'), 500000);
  assert.equal(parseInvoiceAmount('2000.50'), 200050);
  assert.equal(parseInvoiceAmount('0.00', { allowZero: true }), 0);
  assert.throws(() => parseInvoiceAmount('0'), /Enter ₹1/);
  assert.throws(() => parseInvoiceAmount('2000.001'), /Enter ₹1/);
  const calls = [];
  const auth = { ...options('admin'), checkAccess: async () => true, client: { rpc: async (name, params) => {
    calls.push({ name, params });
    if (calls.length === 1) throw new Error('fixture lost response');
    return { data: { id: requestId, invoiceId: invoices[0].id, replacementInvoiceId: null, status: name.startsWith('create') ? 'applied' : 'pending' } };
  } } };
  const create = { ...auth, requestId, amountPaise: 500000, dueDate: '2026-12-24', description: ' Camp payment ' };
  await assert.rejects(createStudentPaymentInvoice(create), { code: 'request_uncertain' });
  await assert.rejects(createStudentPaymentInvoice({ ...create, checkAccess: async () => false }), { code: 'access_denied' });
  assert.equal((await createStudentPaymentInvoice(create)).status, 'applied');
  assert.deepEqual(calls, Array(2).fill({ name: 'create_student_payment_invoice', params: {
    p_registration_id: registrationId, p_amount_paise: 500000, p_due_date: '2026-12-24', p_description: 'Camp payment', p_request_id: requestId,
  } }));
  const adjust = { ...auth, requestId, invoiceId: invoices[0].id, expectedAmountPaise: 70000, amountPaise: 0, reason: ' Fee waiver ' };
  await assert.rejects(adjustStudentPaymentInvoice({ ...adjust, reason: '' }), { code: 'validation' });
  assert.equal((await adjustStudentPaymentInvoice(adjust)).status, 'pending');
  assert.deepEqual(calls[2], { name: 'adjust_student_payment_invoice', params: {
    p_registration_id: registrationId, p_invoice_id: invoices[0].id, p_expected_amount_paise: 70000,
    p_amount_paise: 0, p_reason: 'Fee waiver', p_request_id: requestId,
  } });
  const wrongInvoice = { ...adjust, client: { rpc: async () => ({ data: { id: requestId, invoiceId: invoices[1].id, status: 'applied' } }) } };
  await assert.rejects(adjustStudentPaymentInvoice(wrongInvoice), { code: 'request_uncertain' });
});
