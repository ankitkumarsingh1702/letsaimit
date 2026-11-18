import React from 'react';
import { formatAge, STATUS_OPTIONS } from '../admin/admin-model.js';
import './student-profile-details.css';

const istDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });
const countryName = new Intl.DisplayNames(['en-IN'], { type: 'region' });
const consentLabel = value => value === true ? 'Given' : value === false ? 'Not given' : 'Not recorded';

function DateValue({ value }) {
  if (!value) return '—';
  return <time dateTime={value}>{istDate.format(new Date(value))}</time>;
}

function DetailFact({ label, children }) {
  return <div>
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

  return <div className="student-overview">
    <section className="student-overview-section">
      <h2>Student details</h2>
      <dl className="student-detail-facts">
        <DetailFact label="Age">{formatAge(profile.age)}</DetailFact>
        <DetailFact label="School">{profile.school}</DetailFact>
      </dl>
    </section>
    <section className="student-overview-section">
      <h2>Parent or guardian</h2>
      <dl className="student-detail-facts">
        <DetailFact label="Name">{profile.parentName}</DetailFact>
        <DetailFact label="Email"><Contact value={profile.parentEmail} type="mailto" /></DetailFact>
        <DetailFact label="Phone"><Contact value={profile.parentPhone} type="tel" /></DetailFact>
        <DetailFact label="Address">{profile.address}</DetailFact>
      </dl>
    </section>
    <details className="student-overview-section student-overview-disclosure">
      <summary>Enrolment details</summary>
      <dl className="student-detail-facts">
        <DetailFact label="Follow-up">{followUp}</DetailFact>
        <DetailFact label="Submitted"><DateValue value={profile.submittedAt} /></DetailFact>
        <DetailFact label="Accepted"><DateValue value={profile.acceptedAt} /></DetailFact>
        {/^[A-Z]{2}$/.test(profile.phoneCountry) && <DetailFact label="Phone country">{countryName.of(profile.phoneCountry)}</DetailFact>}
        {profile.parentNote && <DetailFact label="Parent note">{profile.parentNote}</DetailFact>}
        {profile.followUpNote && <DetailFact label="Team note">{profile.followUpNote}</DetailFact>}
      </dl>
      <details className="student-overview-consent">
        <summary>Consent</summary>
        <dl className="student-detail-facts">
          <DetailFact label="Guardian">{consentLabel(profile.guardianConsent)}</DetailFact>
          <DetailFact label="Terms">{consentLabel(profile.termsAccepted)}</DetailFact>
          {profile.billingConsent !== null && <DetailFact label="Billing">{consentLabel(profile.billingConsent)}</DetailFact>}
          {profile.consentVersion && <DetailFact label="Consent version">{profile.consentVersion}</DetailFact>}
          {profile.termsVersion && <DetailFact label="Terms version">{profile.termsVersion}</DetailFact>}
          {profile.billingTermsVersion && <DetailFact label="Billing terms version">{profile.billingTermsVersion}</DetailFact>}
        </dl>
      </details>
    </details>
  </div>;
}

export { StudentBilling } from './StudentBilling.jsx';
