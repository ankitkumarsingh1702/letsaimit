import * as React from "react";
import { FORM_LABELS, STATUS_OPTIONS, formatIST } from "./admin-model.js";
import "./admin-overview.css";

function Metric({ label, value, note, actionLabel, onClick, Icon }) {
  return <article className="adm-dash-metric">
    <div className="adm-dash-metric-heading">
      <h2>{label}</h2>
      <button className="adm-dash-icon-button" type="button" onClick={onClick} aria-label={actionLabel}><Icon name="arrow" /></button>
    </div>
    <div className="adm-dash-metric-reading"><strong>{value}</strong><span>{note}</span></div>
  </article>;
}

function RequestStatus({ summary, onViewRegister }) {
  return <section className="adm-dash-section" aria-labelledby="adm-dash-status-title">
    <div className="adm-dash-section-heading"><h2 id="adm-dash-status-title">Follow-up status</h2></div>
    <table className="adm-dash-table adm-dash-summary-table">
      <caption className="adm-sr-only">Saved requests by current follow-up status.</caption>
      <thead><tr><th scope="col">Status</th><th scope="col" className="adm-dash-number">Requests</th></tr></thead>
      <tbody>{STATUS_OPTIONS.map(item => {
        const value = summary.byStatus[item.value] || 0;
        return <tr key={item.value}>
          <th scope="row"><button type="button" className="adm-dash-link" onClick={() => onViewRegister({ status: item.value })} aria-label={`${item.label}: ${value} ${value === 1 ? "request" : "requests"}`}>{item.label}</button></th>
          <td className="adm-dash-number">{value}</td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}

function NextFollowUp({ row, onOpen, Icon }) {
  return <section className="adm-dash-section adm-dash-next" aria-labelledby="adm-dash-next-title">
    <div className="adm-dash-section-heading"><h2 id="adm-dash-next-title">Next follow-up</h2></div>
    {row ? <div className="adm-dash-table-scroll" tabIndex={0} role="region" aria-label="Next follow-up details">
      <table className="adm-dash-table adm-dash-next-table">
        <caption className="adm-sr-only">The oldest saved request with New status.</caption>
        <thead><tr><th scope="col">Parent</th><th scope="col">Type</th><th scope="col">Sport</th><th scope="col">Received · IST</th><th scope="col"><span className="adm-sr-only">Action</span></th></tr></thead>
        <tbody><tr>
          <td><button type="button" className="adm-dash-link" onClick={() => onOpen(row.id)} aria-label={`Open ${row.parentName}`}>{row.parentName}</button></td>
          <td>{FORM_LABELS[row.formType]}</td>
          <td>{row.sport}</td>
          <td>{formatIST(row.submittedAt)}</td>
          <td className="adm-dash-action-cell"><button type="button" className="adm-dash-link adm-dash-link-with-icon" onClick={() => onOpen(row.id)}>View request <Icon name="arrow" /></button></td>
        </tr></tbody>
      </table>
    </div> : <p className="adm-dash-empty">No new requests</p>}
  </section>;
}

function RequestMix({ summary }) {
  const total = summary.savedRequests.value;
  return <section className="adm-dash-section" aria-labelledby="adm-dash-mix-title">
    <div className="adm-dash-section-heading"><h2 id="adm-dash-mix-title">Request mix</h2></div>
    <table className="adm-dash-table adm-dash-summary-table">
      <caption className="adm-sr-only">Trial and enrolment requests from {total} saved requests.</caption>
      <thead><tr><th scope="col">Type</th><th scope="col" className="adm-dash-number">Requests</th></tr></thead>
      <tbody>
        <tr><th scope="row">Trial</th><td className="adm-dash-number">{summary.trialRequests.value}</td></tr>
        <tr><th scope="row">Enrolment</th><td className="adm-dash-number">{summary.enrolmentRequests.value}</td></tr>
      </tbody>
      <tfoot><tr><th scope="row">Total</th><td className="adm-dash-number">{total}</td></tr></tfoot>
    </table>
  </section>;
}

function TeamSummary({ members, auth, onTeam, Avatar }) {
  return <section className="adm-dash-section adm-dash-team" aria-labelledby="adm-dash-team-title">
    <div className="adm-dash-section-heading"><h2 id="adm-dash-team-title">Team <span className="adm-dash-heading-count">{members.length}</span></h2><button type="button" className="adm-dash-link" onClick={onTeam}>View team</button></div>
    <div className="adm-dash-table-scroll adm-dash-team-scroll" tabIndex={0} role="region" aria-label="Approved team accounts">
      <table className="adm-dash-table adm-dash-team-table">
        <caption className="adm-sr-only">Approved admin email addresses and roles.</caption>
        <thead><tr><th scope="col">Email</th><th scope="col">Role</th></tr></thead>
        <tbody>{members.map(member => {
          const isCurrentUser = member.email === auth.user.email;
          return <tr key={member.email}>
            <td><span className="adm-dash-team-email"><Avatar name={isCurrentUser ? auth.user.displayName || member.email : member.email} src={isCurrentUser ? auth.user.avatarUrl : null} small /><span>{member.email}</span>{isCurrentUser && <span className="adm-dash-you">You</span>}</span></td>
            <td>{member.role === "owner" ? "Owner" : "Admin"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {members.length === 0 && <p className="adm-dash-empty">No team accounts loaded.</p>}
  </section>;
}

function LatestRequests({ rows, onOpen, onViewRegister, StatusBadge }) {
  const latest = [...rows].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 3);
  return <section className="adm-dash-section" aria-labelledby="adm-dash-latest-title">
    <div className="adm-dash-section-heading"><h2 id="adm-dash-latest-title">Latest requests</h2><button type="button" className="adm-dash-link" onClick={() => onViewRegister({})}>View all requests</button></div>
    {latest.length ? <div className="adm-dash-table-scroll" tabIndex={0} role="region" aria-label="Latest saved requests">
      <table className="adm-dash-table adm-dash-latest-table">
        <caption className="adm-sr-only">The three most recently received saved requests. Select a parent to open their details.</caption>
        <thead><tr><th scope="col">Parent</th><th scope="col">Type</th><th scope="col">Sport</th><th scope="col">Community</th><th scope="col">Follow-up status</th><th scope="col">Received · IST</th></tr></thead>
        <tbody>{latest.map(row => <tr key={row.id}>
          <td><button type="button" className="adm-dash-link" onClick={() => onOpen(row.id)} aria-label={`Open ${row.parentName}`}>{row.parentName}</button></td>
          <td>{FORM_LABELS[row.formType]}</td>
          <td>{row.sport}</td>
          <td>{row.community}</td>
          <td><StatusBadge status={row.status} /></td>
          <td>{formatIST(row.submittedAt)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="adm-dash-empty">No requests yet</p>}
  </section>;
}

function SiteActivity({ Icon }) {
  return <section className="adm-dash-activity" aria-labelledby="adm-dash-activity-title">
    <h2 id="adm-dash-activity-title"><Icon name="clock" />Site activity</h2>
    <p>Not tracked</p>
  </section>;
}

/** Saved request counts and actions keep the existing IST period and semantics. */
export default function AdminOverview({ rows, summary, members, auth, onOpen, onViewRegister, onTeam, Icon, Avatar, StatusBadge }) {
  const next = [...rows].filter(row => row.status === "new").sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))[0];
  return <div className="adm-dash">
    <div className="adm-dash-metrics" role="group" aria-label="Saved request summary">
      <Metric label="Requests" value={summary.savedRequests.value} note="Saved" actionLabel="Open register" Icon={Icon} onClick={() => onViewRegister({})} />
      <Metric label="Trials" value={summary.trialRequests.value} note="Requests" actionLabel="View trial requests" Icon={Icon} onClick={() => onViewRegister({ formType: "trial" })} />
      <Metric label="Approved" value={summary.approvedEnrolmentRequests.value} note="Enrolment requests" actionLabel="View approved enrolment requests" Icon={Icon} onClick={() => onViewRegister({ formType: "enrol", reviewDecision: "accepted" })} />
      <Metric label="Follow-up" value={summary.awaitingFollowUp.value} note="New requests" actionLabel="View new requests" Icon={Icon} onClick={() => onViewRegister({ status: "new" })} />
    </div>
    <NextFollowUp row={next} onOpen={onOpen} Icon={Icon} />
    <LatestRequests rows={rows} onOpen={onOpen} onViewRegister={onViewRegister} StatusBadge={StatusBadge} />
    <div className="adm-dash-summary-grid">
      <RequestStatus summary={summary} onViewRegister={onViewRegister} />
      <RequestMix summary={summary} />
      <TeamSummary members={members} auth={auth} onTeam={onTeam} Avatar={Avatar} />
    </div>
    <SiteActivity Icon={Icon} />
  </div>;
}
