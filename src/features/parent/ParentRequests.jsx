import React from "react";
import { useAdminAuth } from "../../context/AdminAuth.jsx";
import { useSiteActions } from "../../context/SiteActions.jsx";
import SignIn from "../../pages/SignIn.jsx";
import ProfileAvatar from "../../components/ProfileAvatar.jsx";
import { mediaProps } from "../../lib/media.js";
import { fetchMyRegistrations } from "./parentRequests.js";
import { useParentTracker } from "../tracker/useParentTracker.js";
import ParentTracker from "./ParentTracker.jsx";
import BillingPanel from "../billing/BillingPanel.jsx";
import DeleteAccountPanel, { AccountDeletionNotice } from "../account/DeleteAccountPanel.jsx";
import "./parent-requests.css";

const formatDate = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const decisionLabels = { pending: "Pending review", accepted: "Accepted", declined: "Declined" };
const views = [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }, { id: "tracker", label: "Tracker", icon: "tracker" }, { id: "account", label: "Account", icon: "account" }];

function ParentIcon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    tracker: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 2v4m8-4v4M4 10h16m-12 5 3 3 5-5" /></>,
    account: <><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>,
    website: <><path d="M13 4h7v7m0-7L10 14" /><path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    exit: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M13 7l5 5-5 5M8 12h13" /></>,
  };
  return <svg className="parent-dashboard-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name] || paths.dashboard}</svg>;
}

export function PendingEnrolmentNotice({ loaded, rows }) {
  const pending = loaded ? rows.filter(row => row.formType === "enrol" && row.reviewDecision === "pending").length : 0;
  return pending ? <p className="parent-request-pending" role="status">Awaiting approval · {pending} {pending === 1 ? "enrolment" : "enrolments"}</p> : null;
}

export function ParentRequestError({ error, loaded }) {
  return error ? <p className="parent-request-error" role="alert">{error}{loaded ? " Showing your previously loaded requests." : ""}</p> : null;
}

export function OwnRequests({ auth }) {
  const { openForm } = useSiteActions();
  const tracker = useParentTracker(auth);
  const [view, setView] = React.useState(() => typeof window !== "undefined" && views.some(item => item.id === new URLSearchParams(window.location.search).get("view")) ? new URLSearchParams(window.location.search).get("view") : "dashboard");
  const heading = React.useRef(null);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState("");
  const alive = React.useRef(false);
  const sequence = React.useRef(0);
  const flight = React.useRef(null);
  const queued = React.useRef(false);
  const loadedRef = React.useRef(false);
  const load = React.useCallback(() => {
    if (!alive.current || document.visibilityState === "hidden") return Promise.resolve();
    if (flight.current) { queued.current = true; return flight.current; }
    const request = ++sequence.current;
    if (!loadedRef.current) setLoading(true);
    const work = (async () => {
    try {
      const saved = await fetchMyRegistrations({ client: auth.client, verifyGoogleUser: auth.verifyGoogleUser, userId: auth.user.id });
      if (!alive.current || sequence.current !== request) return;
      setRows(saved); setLoaded(true); loadedRef.current = true; setError("");
    } catch (cause) {
      if (alive.current && sequence.current === request) setError(cause.message || "Your requests could not load. Please retry.");
    } finally {
      flight.current = null;
      if (alive.current && sequence.current === request) setLoading(false);
      if (alive.current && queued.current) { queued.current = false; queueMicrotask(() => { void load(); }); }
    }
    })();
    flight.current = work;
    return work;
  }, [auth.client, auth.verifyGoogleUser, auth.user.id]);
  React.useEffect(() => {
    alive.current = true; void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const saved = event => { if (event.detail?.userId === auth.user.id) refresh(); };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("letsaimit:registration-saved", saved);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false; ++sequence.current; queued.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("letsaimit:registration-saved", saved);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, auth.user.id]);
  React.useEffect(() => {
    const resume = new URLSearchParams(window.location.search).get("resume");
    if (!["trial", "enrol"].includes(resume)) return;
    window.history.replaceState(window.history.state, "", "/parent/");
    openForm(resume === "enrol" ? "enroll" : "trial");
  }, [openForm]);
  function changeView(next) {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "dashboard") url.searchParams.delete("view"); else url.searchParams.set("view", next);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    window.requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); });
  }
  return <div className="parent-app">
    <aside className="parent-dashboard-sidebar"><a className="parent-dashboard-brand" href="/" aria-label="LetsAimIt home"><img {...mediaProps("logo.png", "110px")} alt="LetsAimIt" /></a><p className="parent-dashboard-sidebar-label">PARENT</p><nav className="parent-dashboard-nav" aria-label="Parent navigation">{views.map(item => <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} onClick={() => changeView(item.id)}><ParentIcon name={item.icon} /><span>{item.label}</span></button>)}</nav><div className="parent-dashboard-utilities">{auth.phase === "authorized" && <a href="/admin/"><ParentIcon name="account" />Team dashboard</a>}<a href="/coach-dashboard/"><ParentIcon name="tracker" />Coaching tracker</a><a href="/"><ParentIcon name="website" />Website</a><button type="button" onClick={() => { void auth.signOut(); }}><ParentIcon name="exit" />Sign out</button></div></aside>
    <div className="parent-dashboard-workspace"><header className="parent-dashboard-topbar"><span className="parent-dashboard-title">Parent dashboard</span><div className="parent-dashboard-user"><ProfileAvatar name={auth.user.displayName || auth.user.email} src={auth.user.avatarUrl} /><span><strong>{auth.user.displayName || auth.user.email}</strong><span>{auth.user.email}</span></span><details className="parent-dashboard-mobile-tools"><summary aria-label="Parent workspace actions">•••</summary><div>{auth.phase === "authorized" && <a href="/admin/">Team dashboard</a>}<a href="/coach-dashboard/">Coaching tracker</a><a href="/">Website</a><button type="button" onClick={() => { void auth.signOut(); }}>Sign out</button></div></details></div></header>
      <section className="parent-requests" aria-labelledby="parent-requests-title"><header className="parent-requests-heading"><div><h1 ref={heading} tabIndex={-1} id="parent-requests-title">{views.find(item => item.id === view)?.label || "Dashboard"}</h1><p>Parent workspace</p></div><div className="parent-request-actions"><button type="button" className="btn" onClick={event => openForm("enroll", event.currentTarget)}>Enrol a child</button></div></header>
        <div hidden={view !== "dashboard"}>
          <ParentRequestError error={error} loaded={loaded} />
          <PendingEnrolmentNotice loaded={loaded} rows={rows} />
          <BillingPanel key={auth.user.id} auth={auth} />
          <section className="parent-request-history" aria-labelledby="parent-request-history-title"><header className="parent-request-history-heading"><h2 id="parent-request-history-title">Requests{loaded ? ` · ${rows.length}` : ""}</h2><div className="parent-request-actions"><button type="button" className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh requests"}</button><button type="button" className="btn" onClick={event => openForm("trial", event.currentTarget)}>Free trial</button></div></header>
          {!loaded ? <p className="parent-request-empty" role="status">{loading ? "Loading your saved requests…" : "Your request list is not loaded. Please retry."}</p> : rows.length ? <div className="parent-request-scroll" tabIndex={0} role="region" aria-label="Your submitted requests"><table className="parent-request-table"><caption className="parent-dashboard-sr-only">{rows.length} saved {rows.length === 1 ? "request" : "requests"}. Times are in India Standard Time.</caption><thead><tr><th scope="col">Type</th><th scope="col">Child</th><th scope="col">Sport</th><th scope="col">Community</th><th scope="col">Submitted · IST</th><th scope="col">Review</th><th scope="col">Reviewed · IST</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.formType === "enrol" ? "Enrolment" : "Trial"}</td><td title={row.childName}>{row.childName || "—"}</td><td>{row.sport}</td><td title={row.community}>{row.community}</td><td>{formatDate(row.submittedAt)}</td><td>{decisionLabels[row.reviewDecision]}</td><td>{formatDate(row.reviewedAt)}</td></tr>)}</tbody></table></div> : <p className="parent-request-empty" role="status">No requests have been sent with this Google account yet.</p>}
          </section>
        </div>
        <div hidden={view !== "tracker"}><ParentTracker tracker={tracker} /></div>
        <div hidden={view !== "account"}><DeleteAccountPanel auth={auth} /></div>
      </section>
    </div>
  </div>;
}

export default function ParentRequests() {
  const auth = useAdminAuth();
  if (!auth.user?.isGoogle || ["checking", "signing_in", "signing_out"].includes(auth.phase)) return <>{!auth.user && <AccountDeletionNotice status={auth.deletionStatus} />}<SignIn mode="parent" /></>;
  return <OwnRequests key={auth.user.id} auth={auth} />;
}
