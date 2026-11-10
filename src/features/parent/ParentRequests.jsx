import React from "react";
import { useAdminAuth } from "../../context/AdminAuth.jsx";
import { useSiteActions } from "../../context/SiteActions.jsx";
import SignIn from "../../pages/SignIn.jsx";
import ProfileAvatar from "../../components/ProfileAvatar.jsx";
import { fetchMyRegistrations } from "./parentRequests.js";
import BillingPanel from "../billing/BillingPanel.jsx";
import "./parent-requests.css";

const formatDate = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const decisionLabels = { pending: "Pending review", accepted: "Accepted", declined: "Declined" };

export function PendingEnrolmentNotice({ loaded, rows }) {
  const pending = loaded ? rows.filter(row => row.formType === "enrol" && row.reviewDecision === "pending").length : 0;
  return pending ? <p className="parent-request-pending" role="status">Awaiting approval · {pending} {pending === 1 ? "enrolment" : "enrolments"}</p> : null;
}

export function ParentRequestError({ error, loaded }) {
  return error ? <p className="parent-request-error" role="alert">{error}{loaded ? " Showing your previously loaded requests." : ""}</p> : null;
}

export function OwnRequests({ auth }) {
  const { openForm } = useSiteActions();
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
  return <section className="parent-requests wrap" aria-labelledby="parent-requests-title">
    <header className="parent-requests-heading"><h1 id="parent-requests-title">Parent dashboard</h1><div className="parent-request-actions"><button type="button" className="btn" onClick={event => openForm("enroll", event.currentTarget)}>Enrol a child</button><button type="button" className="btn" onClick={() => { void auth.signOut(); }}>Sign out</button></div></header>
    <div className="parent-request-account"><ProfileAvatar name={auth.user.displayName || auth.user.email} src={auth.user.avatarUrl} /><strong>{auth.user.displayName || auth.user.email}</strong><span className="parent-account-email">{auth.user.email}</span>{auth.phase === "authorized" && <a href="/admin/">Admin dashboard</a>}</div>
    <ParentRequestError error={error} loaded={loaded} />
    <PendingEnrolmentNotice loaded={loaded} rows={rows} />
    <BillingPanel key={auth.user.id} auth={auth} />
    <details className="parent-request-history" open><summary>Requests{loaded ? ` · ${rows.length}${rows.some(row => row.reviewDecision === "pending") ? ` · ${rows.filter(row => row.reviewDecision === "pending").length} pending` : ""}` : ""}</summary>
    {!loaded ? <p role="status">{loading ? "Loading your saved requests…" : "Your request list is not loaded. Please retry."}</p> : rows.length ? <div className="parent-request-scroll" tabIndex={0} role="region" aria-label="Your submitted requests"><table className="parent-request-table"><caption className="parent-request-count">{rows.length} saved {rows.length === 1 ? "request" : "requests"}</caption><thead><tr><th scope="col">Type</th><th scope="col">Child</th><th scope="col">Sport</th><th scope="col">Community</th><th scope="col">Submitted · IST</th><th scope="col">Review</th><th scope="col">Reviewed · IST</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.formType === "enrol" ? "Enrolment" : "Trial"}</td><td>{row.childName || "—"}</td><td>{row.sport}</td><td>{row.community}</td><td>{formatDate(row.submittedAt)}</td><td>{decisionLabels[row.reviewDecision]}</td><td>{formatDate(row.reviewedAt)}</td></tr>)}</tbody></table></div> : <p role="status">No requests have been sent with this Google account yet.</p>}
    <div className="parent-request-actions"><button type="button" className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh requests"}</button><button type="button" className="btn" onClick={event => openForm("trial", event.currentTarget)}>Free trial</button></div>
    </details>
  </section>;
}

export default function ParentRequests() {
  const auth = useAdminAuth();
  if (!auth.user?.isGoogle || ["checking", "signing_in", "signing_out"].includes(auth.phase)) return <SignIn mode="parent" />;
  return <OwnRequests key={auth.user.id} auth={auth} />;
}
