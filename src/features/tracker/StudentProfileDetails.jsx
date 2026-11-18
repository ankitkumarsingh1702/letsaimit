import React from 'react';
import { formatAge, STATUS_OPTIONS } from '../admin/admin-model.js';
import { BILLING_STATUS_LABELS, formatMoney } from '../billing/billingData.js';
import './student-profile-details.css';

const istDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });
const istMonth = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' });
const countryName = new Intl.DisplayNames(['en-IN'], { type: 'region' });
const consentLabel = value => value === true ? 'Given' : value === false ? 'Not given' : 'Not recorded';
const billingHref = '/admin/?view=billing';

function DateValue({ value, month = false }) {
  if (!value) return '—';
  return <time dateTime={value}>{(month ? istMonth : istDate).format(new Date(value))}</time>;
}

function DetailFact({ label, children, wide = false }) {
  return <div className={wide ? 'student-detail-wide' : undefined}>
    <dt>{label}</dt><dd>{children || 'Not recorded'}</dd>
  </div>;
}

function DetailsState({ details, title }) {
  return <section className="student-detail-card">
    <h2>{title}</h2>
    {details.error
      ? <div className="student-detail-state"><p role="alert">{details.error}</p><button className="students-button" type="button" onClick={details.refresh}>Try again</button></div>
      : <p className="student-detail-state" role="status">{details.loading ? 'Loading…' : 'Details are unavailable.'}</p>}
  </section>;
}

function Contact({ value, type }) {
  const email = /^([^\s@,;]+)@([a-z0-9.-]+)$/i.exec(value);
  const href = type === 'tel'
    ? /^\+[1-9]\d{7,14}$/.test(value) ? `tel:${value}` : null
    : email && `mailto:${encodeURIComponent(email[1])}@${email[2]}`;
  return href ? <a className="student-detail-contact" href={href}>{value}</a> : value || 'Not recorded';
}

export function StudentOverview({ details }) {
  const { profile } = details;
  if (!profile) return <DetailsState details={details} title="Student details" />;
  const followUp = STATUS_OPTIONS.find(status => status.value === profile.followUpStatus)?.label;

  return <div className="student-detail-grid">
    <section className="student-detail-card" aria-label="Student details">
      <h2>Student details</h2>
      <dl className="student-detail-facts">
        <DetailFact label="Age">{formatAge(profile.age)}</DetailFact>
        <DetailFact label="School">{profile.school}</DetailFact>
        <DetailFact label="Sport">{profile.sport}</DetailFact>
        <DetailFact label="Society">{profile.community}</DetailFact>
      </dl>
    </section>
    <section className="student-detail-card" aria-label="Parent or guardian">
      <h2>Parent or guardian</h2>
      <dl className="student-detail-facts">
        <DetailFact label="Name" wide>{profile.parentName}</DetailFact>
        <DetailFact label="Email" wide><Contact value={profile.parentEmail} type="mailto" /></DetailFact>
        <DetailFact label="Phone"><Contact value={profile.parentPhone} type="tel" /></DetailFact>
        {/^[A-Z]{2}$/.test(profile.phoneCountry) && <DetailFact label="Phone country">{countryName.of(profile.phoneCountry)}</DetailFact>}
        <DetailFact label="Address" wide>{profile.address}</DetailFact>
      </dl>
    </section>
    <section className="student-detail-card student-detail-wide" aria-label="Enrolment details">
      <h2>Enrolment</h2>
      <dl className="student-detail-facts student-enrolment-facts">
        <DetailFact label="Follow-up">{followUp}</DetailFact>
        <DetailFact label="Submitted"><DateValue value={profile.submittedAt} /></DetailFact>
        <DetailFact label="Accepted"><DateValue value={profile.acceptedAt} /></DetailFact>
      </dl>
      {(profile.parentNote || profile.followUpNote) && <dl className="student-detail-facts student-detail-notes">
        {profile.parentNote && <DetailFact label="Parent note" wide>{profile.parentNote}</DetailFact>}
        {profile.followUpNote && <DetailFact label="Team note" wide>{profile.followUpNote}</DetailFact>}
      </dl>}
      <details className="student-detail-consent">
        <summary>Consent</summary>
        <dl className="student-detail-facts student-enrolment-facts">
          <DetailFact label="Guardian">{consentLabel(profile.guardianConsent)}</DetailFact>
          <DetailFact label="Terms">{consentLabel(profile.termsAccepted)}</DetailFact>
          {profile.billingConsent !== null && <DetailFact label="Billing">{consentLabel(profile.billingConsent)}</DetailFact>}
          {profile.consentVersion && <DetailFact label="Consent version">{profile.consentVersion}</DetailFact>}
          {profile.termsVersion && <DetailFact label="Terms version">{profile.termsVersion}</DetailFact>}
          {profile.billingTermsVersion && <DetailFact label="Billing terms version">{profile.billingTermsVersion}</DetailFact>}
        </dl>
      </details>
    </section>
  </div>;
}

function MonthlyInvoices({ invoices }) {
  if (!invoices.length) return <p className="student-detail-state">No monthly invoices yet.</p>;
  return <table className="student-invoice-table" role="table" aria-label="Monthly invoices">
    <thead><tr>
      <th scope="col">Month</th><th scope="col">Status</th><th scope="col">Due date</th>
      <th scope="col">Paid on</th><th scope="col">Invoice</th><th scope="col">Paid</th>
    </tr></thead>
    <tbody>{invoices.map(invoice => <tr key={invoice.id}>
      <th scope="row"><DateValue value={invoice.periodStart} month /></th>
      <td><span className="student-invoice-status" data-status={invoice.status}>{BILLING_STATUS_LABELS[invoice.status]}</span></td>
      <td><span className="student-invoice-mobile" aria-hidden="true">Due</span><DateValue value={invoice.dueAt} /></td>
      <td><span className="student-invoice-mobile" aria-hidden="true">Paid on</span><DateValue value={invoice.paidAt} /></td>
      <td><span className="student-invoice-mobile" aria-hidden="true">Invoice</span>{formatMoney(invoice.amountPaise)}</td>
      <td><span className="student-invoice-mobile" aria-hidden="true">Paid</span>{formatMoney(invoice.paidPaise)}
        {invoice.refundedPaise > 0 && <small>{formatMoney(invoice.refundedPaise)} refunded</small>}
      </td>
    </tr>)}</tbody>
  </table>;
}

export function StudentBilling({ details, onOpenBilling }) {
  if (!details.profile) return <DetailsState details={details} title="Payments" />;
  const { billing } = details.profile;
  return <section className="student-detail-card student-payment-card" aria-label="Payments">
    <div className="student-payment-heading">
      <h2>Payments</h2>
      <a className="student-detail-contact" href={billingHref} onClick={event => {
        if (!onOpenBilling || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onOpenBilling();
      }}>Open Billing</a>
    </div>
    {billing ? <>
      <dl className="student-payment-metrics">
        <div>
          <dt>Outstanding</dt><dd>{formatMoney(billing.outstandingPaise)}</dd>
          {billing.nextDueAt && <dd className="student-payment-date">Earliest due <DateValue value={billing.nextDueAt} /></dd>}
        </div>
        <div><dt>Monthly fee</dt><dd>{formatMoney(billing.monthlyAmountPaise)}</dd></div>
        <div>
          <dt>{billing.nextMonth ? <DateValue value={billing.nextMonth} month /> : 'Next month'}</dt>
          <dd>{billing.accountStatus === 'active' ? formatMoney(billing.nextMonthAmountPaise) : 'Billing stopped'}</dd>
          {billing.accountStatus === 'active' && <dd className="student-payment-date">Planned fee</dd>}
        </div>
      </dl>
      <h3 className="student-payment-history">Monthly invoices</h3>
      <MonthlyInvoices invoices={billing.invoices} />
    </> : <p className="student-detail-state">No billing account yet.</p>}
  </section>;
}
