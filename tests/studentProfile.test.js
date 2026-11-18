import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fetchStudentProfile } from '../src/features/tracker/studentProfileData.js';

const registrationId = 'c6fa700e-ce24-4b11-9d5c-7417d7724c01';
const actor = { id: 'fixture-admin', isGoogle: true };
const invoices = [
  { id: 'c6fa700e-ce24-4b11-9d5c-7417d7724c02', periodStart: '2026-11-01', dueAt: '2026-11-05T04:30:00Z',
    paidAt: null, amountPaise: 70000, paidPaise: 0, refundedPaise: 0, status: 'overdue' },
  { id: 'c6fa700e-ce24-4b11-9d5c-7417d7724c03', periodStart: '2026-10-01', dueAt: '2026-10-05T04:30:00Z',
    paidAt: '2026-10-02T19:00:00Z', amountPaise: 65000, paidPaise: 65000, refundedPaise: 0, status: 'paid' },
];
const row = {
  registrationId, childName: 'Example child', age: '9', school: '', sport: 'Football', community: 'Nambiar Ellegenza',
  parentName: 'Example guardian', parentEmail: 'guardian+alias@example.test', parentPhone: '+919876543210',
  phoneCountry: 'IN', address: 'Example address', followUpStatus: 'confirmed', followUpNote: 'Private team note',
  submittedAt: '2026-09-01T05:30:00Z', acceptedAt: '2026-09-02T05:30:00Z', guardianConsent: true,
  termsAccepted: true, billingConsent: true, billingTermsVersion: 'saved-billing-version', feedback: [],
  billing: { accountStatus: 'active', currency: 'INR', monthlyAmountPaise: 70000, nextMonthAmountPaise: 75000,
    nextMonth: '2026-12-01', outstandingPaise: 70000, nextDueAt: invoices[0].dueAt, invoices },
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

  const html = renderToStaticMarkup(React.createElement(StudentBilling, { details }));
  assert.match(html, /December 2026[^]*?₹750[^]*?Planned fee/);
  assert.match(html, /October 2026[^]*?Paid[^]*?5 Oct 2026[^]*?3 Oct 2026/);
  assert.match(html, /November 2026[^]*?Overdue[^]*?5 Nov 2026/);
  assert.match(html, /href="\/admin\/\?view=billing"/);
  const stopped = await fetchStudentProfile(options('admin', {
    client: { rpc: async () => ({ data: { ...row, billing: { ...row.billing, accountStatus: 'cancelled', nextMonth: null, nextMonthAmountPaise: null } } }) },
  }));
  const stoppedHtml = renderToStaticMarkup(React.createElement(StudentBilling, { details: { ...details, profile: stopped } }));
  assert.match(stoppedHtml, /Next month[^]*?Billing stopped/);
  assert.match(stoppedHtml, /October 2026[^]*?3 Oct 2026/);
});
