import React from "react";
import { useAdminAuth } from "../../context/AdminAuth.jsx";
import { useSiteActions } from "../../context/SiteActions.jsx";
import SignIn from "../../pages/SignIn.jsx";
import ProfileAvatar from "../../components/ProfileAvatar.jsx";
import WorkspaceSwitch from "../../components/WorkspaceSwitch.jsx";
import { mediaProps } from "../../lib/media.js";
import { fetchMyRegistrations, takeParentRegistration } from "./parentRequests.js";
import { useParentTracker } from "../tracker/useParentTracker.js";
import ParentTracker from "./ParentTracker.jsx";
import BillingPanel from "../billing/BillingPanel.jsx";
import DeleteAccountPanel, { AccountDeletionNotice } from "../account/DeleteAccountPanel.jsx";
import "./parent-requests.css";

const submittedDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const decisionLabels = { pending: "Pending review", accepted: "Accepted", declined: "Declined" };
const views = [
  { id: "requests", label: "My requests" },
  { id: "payments", label: "Payments" },
  { id: "tracking", label: "Tracking" },
  { id: "account", label: "Account" },
];

function viewUrl(view) {
  return view === "requests" ? "/parent/" : `/parent/?view=${view}`;
}

function readView() {
  const value = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("view");
  if (value === "tracker") return "tracking";
  return views.some(item => item.id === value) ? value : "requests";
}

function ParentIcon({ name }) {
  const paths = {
    requests: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6m-6 4h6m-6 4h4" /></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18m-14 5h3" /></>,
    tracking: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 2v4m8-4v4M4 10h16m-12 5 3 3 5-5" /></>,
    account: <><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>,
    success: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  };
  return <svg className="parent-dashboard-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function RegistrationLink({ another = false }) {
  return <a className="parent-registration-link" href="/register/">{another ? "Register another child" : "Register your child"}<ParentIcon name="arrow" /></a>;
}

export function ParentRequestError({ error, loaded, onRetry }) {
  return error ? <div className="parent-request-error" role="alert"><span>{error}{loaded ? " Showing your previously loaded requests." : ""}</span>{onRetry && <button className="parent-dashboard-text-button" type="button" onClick={onRetry}>Try again</button>}</div> : null;
}

export function ParentRequestList({ rows, receivedId, onViewPayments }) {
  const received = rows.find(row => row.formType === "enrol" && row.id === receivedId);
  const visible = received ? [received, ...rows.filter(row => row !== received)] : rows;
  return <>
    {received && <div className="parent-request-received" role="status">
      <ParentIcon name="success" />
      <div><strong>Registration received</strong>{received.reviewDecision === "pending" && <p>We’ll email you after review.</p>}</div>
    </div>}
    <ul className="parent-request-list" aria-label="Submitted requests">
      {visible.map(row => {
        const trial = row.formType === "trial";
        const title = trial ? "Free trial" : row.childName || "Child registration";
        return <li key={row.id} className="parent-request-row" data-received={row === received || undefined}>
          <div className="parent-request-subject">
            <strong>{title}</strong>
            <span>{[row.sport, row.community].filter(Boolean).join(" · ")}</span>
          </div>
          <time className="parent-request-date" dateTime={row.submittedAt}>{submittedDate.format(new Date(row.submittedAt))}</time>
          <span className="parent-request-status" data-decision={row.reviewDecision}>{decisionLabels[row.reviewDecision]}</span>
          <div className="parent-request-next">{!trial && row.reviewDecision === "accepted" && <a className="parent-request-payment" href={viewUrl("payments")} onClick={onViewPayments}>View payments<ParentIcon name="arrow" /></a>}</div>
        </li>;
      })}
    </ul>
  </>;
}

export function OwnRequests({ auth }) {
  const { openForm } = useSiteActions();
  const tracker = useParentTracker(auth);
  const canAdmin = auth.phase === "authorized";
  const [coachUserId, setCoachUserId] = React.useState(null);
  const { client, user: { id: userId } } = auth;

  React.useEffect(() => {
    if (canAdmin || !client) return;
    let active = true;
    let checking = false;
    async function checkCoachAccess() {
      if (checking) return;
      checking = true;
      try {
        const { data, error } = await client.rpc("has_coaching_assignments");
        if (active) setCoachUserId(!error && data === true ? userId : null);
      } catch {
        if (active) setCoachUserId(null);
      } finally {
        checking = false;
      }
    }
    void checkCoachAccess();
    window.addEventListener("focus", checkCoachAccess);
    return () => {
      active = false;
      window.removeEventListener("focus", checkCoachAccess);
    };
  }, [canAdmin, client, userId]);

  const [view, setView] = React.useState(readView);
  const [receivedId, setReceivedId] = React.useState(null);
  const heading = React.useRef(null);
  const receiptChecked = React.useRef(false);
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
        setRows(saved);
        setLoaded(true);
        loadedRef.current = true;
        setError("");
      } catch (cause) {
        if (alive.current && sequence.current === request) {
          if (["identity_changed", "access_denied"].includes(cause.code)) {
            setRows([]);
            setLoaded(false);
            loadedRef.current = false;
          }
          setError(cause.message || "Your requests could not load. Please retry.");
        }
      } finally {
        flight.current = null;
        if (alive.current && sequence.current === request) setLoading(false);
        if (alive.current && queued.current) {
          queued.current = false;
          queueMicrotask(() => { void load(); });
        }
      }
    })();
    flight.current = work;
    return work;
  }, [auth.client, auth.verifyGoogleUser, auth.user.id]);

  React.useEffect(() => {
    alive.current = true;
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const saved = event => { if (event.detail?.userId === auth.user.id) refresh(); };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("letsaimit:registration-saved", saved);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false;
      ++sequence.current;
      queued.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("letsaimit:registration-saved", saved);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, auth.user.id]);

  React.useEffect(() => {
    if (receiptChecked.current) return;
    receiptChecked.current = true;
    setReceivedId(takeParentRegistration(auth.user.id));
  }, [auth.user.id]);

  React.useEffect(() => {
    const resume = new URLSearchParams(window.location.search).get("resume");
    if (resume === "enrol") {
      window.location.replace("/register/?resume=enrol");
    } else if (resume === "trial") {
      window.history.replaceState(window.history.state, "", "/parent/");
      openForm("trial");
    }
  }, [openForm]);

  React.useEffect(() => {
    const onBack = () => setView(readView());
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  function changeView(event, next) {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (view === next) return;
    window.history.pushState(window.history.state, "", viewUrl(next));
    setView(next);
    window.requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }

  const name = auth.user.displayName || auth.user.email;
  return <div className="parent-app">
    <header className="parent-dashboard-header">
      <div className="parent-dashboard-topbar">
        <a className="parent-dashboard-brand" href="/" aria-label="LetsAimIt home"><img {...mediaProps("logo.png", "94px")} alt="LetsAimIt" /></a>
        <div className="parent-dashboard-controls">
          <WorkspaceSwitch current="parent" canAdmin={canAdmin} canCoach={canAdmin || coachUserId === userId} />
          <details className="parent-dashboard-user">
            <summary aria-label="Parent account actions"><ProfileAvatar name={name} src={auth.user.avatarUrl} /><span className="parent-dashboard-user-name">{name}</span><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></summary>
            <div className="parent-dashboard-menu">
              <span>{auth.user.email}</span>
              <a href="/">Website</a>
              <button type="button" onClick={() => { void auth.signOut(); }}>Sign out</button>
            </div>
          </details>
        </div>
      </div>
      <nav className="parent-dashboard-nav" aria-label="Parent navigation">
        {views.map(item => <a key={item.id} href={viewUrl(item.id)} aria-current={view === item.id ? "page" : undefined} onClick={event => changeView(event, item.id)}><ParentIcon name={item.id} /><span>{item.label}</span></a>)}
      </nav>
    </header>
    <div className="parent-requests">
      <header className="parent-requests-heading">
        <h1 ref={heading} tabIndex={-1} id="parent-requests-title">{views.find(item => item.id === view)?.label}</h1>
        {view === "requests" && loaded && rows.length > 0 && <RegistrationLink another={rows.some(row => row.formType === "enrol")} />}
      </header>
      <section className="parent-request-history" aria-label="Your registrations and trials" hidden={view !== "requests"}>
        <ParentRequestError error={error} loaded={loaded} onRetry={load} />
        {loading && <p className="parent-request-loading" role="status">Loading your saved requests…</p>}
        {loaded && (rows.length ? <ParentRequestList rows={rows} receivedId={receivedId} onViewPayments={event => changeView(event, "payments")} /> : <div className="parent-request-empty">
          <ParentIcon name="requests" />
          <h2>No requests yet</h2>
          <RegistrationLink />
        </div>)}
      </section>
      <div hidden={view !== "payments"}><BillingPanel key={auth.user.id} auth={auth} /></div>
      <div hidden={view !== "tracking"}><ParentTracker tracker={tracker} /></div>
      <div hidden={view !== "account"}><DeleteAccountPanel auth={auth} /></div>
    </div>
  </div>;
}

export default function ParentRequests() {
  const auth = useAdminAuth();
  if (!auth.user?.isGoogle || ["checking", "signing_in", "signing_out"].includes(auth.phase)) return <>{!auth.user && <AccountDeletionNotice status={auth.deletionStatus} />}<SignIn mode="parent" /></>;
  return <OwnRequests key={auth.user.id} auth={auth} />;
}
