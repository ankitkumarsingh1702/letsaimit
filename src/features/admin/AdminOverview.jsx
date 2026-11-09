import * as React from "react";
import { FORM_LABELS, STATUS_OPTIONS, formatIST } from "./admin-model.js";
import "./admin-overview.css";

function Metric({ label, value, note, actionLabel, featured, onClick, Icon }) {
  return <article className={`adm-dash-metric${featured ? " adm-dash-metric-featured" : ""}`}>
    <div className="adm-dash-metric-top">
      <h2 className="adm-dash-metric-title">{label}</h2>
      <button type="button" className="adm-dash-arrow" onClick={onClick} aria-label={actionLabel}><Icon name="arrow" /></button>
    </div>
    <p className="adm-dash-metric-value">{value}</p>
    <p className="adm-dash-metric-note">{note}</p>
  </article>;
}

function RequestStatus({ summary, onViewRegister }) {
  const maximum = Math.max(1, ...Object.values(summary.byStatus));
  return <section className="adm-dash-card adm-dash-status" aria-labelledby="adm-dash-status-title">
    <h2 id="adm-dash-status-title" className="adm-dash-title">Request status</h2>
    <div className="adm-dash-bars">{STATUS_OPTIONS.map(item => {
      const value = summary.byStatus[item.value] || 0;
      return <button className={`adm-dash-bar-button adm-dash-bar-${item.value}`} type="button" key={item.value} onClick={() => onViewRegister({ status: item.value })} aria-label={`${item.label}: ${value} ${value === 1 ? "request" : "requests"}`}>
        <span className="adm-dash-bar-value">{value}</span>
        <span className="adm-dash-bar-track" aria-hidden="true"><span className={`adm-dash-bar-fill${value === 0 ? " adm-dash-bar-empty" : ""}`} style={{ height: `${value / maximum * 100}%` }} /></span>
        <span className="adm-dash-bar-label">{item.label}</span>
      </button>;
    })}</div>
  </section>;
}

function NextFollowUp({ row, onOpen, Icon }) {
  return <section className="adm-dash-card adm-dash-next" aria-labelledby="adm-dash-next-title">
    <h2 id="adm-dash-next-title" className="adm-dash-title">Next follow-up</h2>
    {row ? <>
      <div className="adm-dash-next-copy"><p className="adm-dash-next-name">{row.parentName}</p><p>{FORM_LABELS[row.formType]} · {row.sport}</p><span>{formatIST(row.submittedAt, "time")} IST</span></div>
      <button className="adm-dash-primary" type="button" onClick={() => onOpen(row.id)}>View request <Icon name="arrow" /></button>
    </> : <><p className="adm-dash-next-empty">No new requests</p><span className="adm-dash-next-check"><Icon name="check" /></span></>}
  </section>;
}

function RequestMix({ summary }) {
  const patternId = `adm-dash-pattern-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const total = summary.savedRequests.value;
  const trial = summary.trialRequests.value;
  const enrol = summary.enrolmentRequests.value;
  const share = total > 0 ? trial / total * 100 : 0;
  return <section className="adm-dash-card adm-dash-mix" aria-labelledby="adm-dash-mix-title">
    <h2 id="adm-dash-mix-title" className="adm-dash-title">Request mix</h2>
    <svg className="adm-dash-gauge" viewBox="0 0 260 156" role="img" aria-label={`${trial} of ${total} requests are trials; ${enrol} ${enrol === 1 ? "enrolment" : "enrolments"}.`}>
      <defs><pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="#f0f4ef" /><rect width="2" height="6" fill="#9bb5a7" /></pattern></defs>
      <path d="M26 132 A104 104 0 0 1 234 132" fill="none" stroke={total > 0 ? `url(#${patternId})` : "#edf1eb"} strokeWidth="32" strokeLinecap="round" pathLength="100" />
      {trial > 0 && <path d="M26 132 A104 104 0 0 1 234 132" fill="none" stroke="#238362" strokeWidth="32" strokeLinecap="round" pathLength="100" strokeDasharray={`${share} 100`} />}
      <text x="130" y="112" textAnchor="middle" className="adm-dash-gauge-value">{total > 0 ? `${trial}/${total}` : "—"}</text>
      <text x="130" y="135" textAnchor="middle" className="adm-dash-gauge-label">{total > 0 ? "Trials" : "No requests"}</text>
    </svg>
    <div className="adm-dash-legend"><span><i className="adm-dash-legend-trial" aria-hidden="true" />Trial <strong>{trial}</strong></span><span><i className="adm-dash-legend-enrol" aria-hidden="true" />Enrolment <strong>{enrol}</strong></span></div>
  </section>;
}

function memberName(member, auth) {
  if (member.email === auth.user.email) return auth.user.displayName;
  return member.email.split("@")[0].split(/[._-]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function TeamCard({ members, auth, onTeam, Avatar }) {
  return <section className="adm-dash-card adm-dash-team" aria-labelledby="adm-dash-team-title">
    <div className="adm-dash-card-heading"><h2 id="adm-dash-team-title" className="adm-dash-title">Team</h2><button type="button" className="adm-dash-small-button" onClick={onTeam}>View</button></div>
    <div className="adm-dash-team-list">{members.map(member => <div className="adm-dash-team-row" key={member.email}>
      <Avatar name={memberName(member, auth)} small />
      <div className="adm-dash-team-person"><strong>{memberName(member, auth)}</strong><span>{member.email}</span></div>
      <span className="adm-dash-member-role">{member.role === "owner" ? "Owner" : "Admin"}</span>
    </div>)}</div>
  </section>;
}

function LatestRequests({ rows, onOpen, onViewRegister, Icon, StatusBadge }) {
  const latest = [...rows].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 3);
  return <section className="adm-dash-card adm-dash-latest" aria-labelledby="adm-dash-latest-title">
    <div className="adm-dash-card-heading"><h2 id="adm-dash-latest-title" className="adm-dash-title">Latest requests</h2><button className="adm-dash-arrow adm-dash-arrow-quiet" type="button" aria-label="View all requests" onClick={() => onViewRegister({})}><Icon name="arrow" /></button></div>
    <div className="adm-dash-latest-list">{latest.map(row => <button type="button" className="adm-dash-request" key={row.id} onClick={() => onOpen(row.id)} aria-label={`Open ${row.parentName}`}>
      <span className={`adm-dash-request-symbol adm-dash-request-symbol-${row.formType}`} aria-hidden="true"><Icon name={row.formType === "enrol" ? "check" : "ball"} /></span>
      <span className="adm-dash-request-copy"><strong>{row.parentName}</strong><span>{FORM_LABELS[row.formType]} · {row.sport}</span><StatusBadge status={row.status} /></span>
    </button>)}</div>
    {latest.length === 0 && <p className="adm-dash-small-empty">No requests yet</p>}
  </section>;
}

function SiteActivity({ Icon }) {
  return <section className="adm-dash-activity" aria-labelledby="adm-dash-activity-title">
    <div className="adm-dash-activity-lines" aria-hidden="true" />
    <h2 id="adm-dash-activity-title" className="adm-dash-title">Site activity</h2>
    <p>Not tracked</p>
    <span className="adm-dash-activity-mark" aria-hidden="true"><Icon name="clock" /></span>
  </section>;
}

/** Summary of the same saved-record population and IST period as the register. */
export default function AdminOverview({ rows, summary, members, auth, onOpen, onViewRegister, onTeam, Icon, Avatar, StatusBadge }) {
  const next = [...rows].filter(row => row.status === "new").sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))[0];
  return <div className="adm-dash">
    <div className="adm-dash-metrics">
      <Metric label="Requests" value={summary.savedRequests.value} note="Saved" actionLabel="Open register" featured Icon={Icon} onClick={() => onViewRegister({})} />
      <Metric label="Trials" value={summary.trialRequests.value} note="Requests" actionLabel="View trial requests" Icon={Icon} onClick={() => onViewRegister({ formType: "trial" })} />
      <Metric label="Confirmed" value={summary.confirmedEnrolmentRequests.value} note="Enrolment requests" actionLabel="View confirmed enrolments" Icon={Icon} onClick={() => onViewRegister({ formType: "enrol", status: "confirmed" })} />
      <Metric label="Follow-up" value={summary.awaitingFollowUp.value} note="New requests" actionLabel="View new requests" Icon={Icon} onClick={() => onViewRegister({ status: "new" })} />
    </div>
    <div className="adm-dash-grid">
      <div className="adm-dash-main">
        <div className="adm-dash-top"><RequestStatus summary={summary} onViewRegister={onViewRegister} /><NextFollowUp row={next} onOpen={onOpen} Icon={Icon} /></div>
        <div className="adm-dash-bottom"><TeamCard members={members} auth={auth} onTeam={onTeam} Avatar={Avatar} /><RequestMix summary={summary} /></div>
      </div>
      <aside className="adm-dash-rail" aria-label="Recent activity"><LatestRequests rows={rows} onOpen={onOpen} onViewRegister={onViewRegister} Icon={Icon} StatusBadge={StatusBadge} /><SiteActivity Icon={Icon} /></aside>
    </div>
  </div>;
}
