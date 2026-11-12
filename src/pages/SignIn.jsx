import React from "react";
import ProfileAvatar from "../components/ProfileAvatar.jsx";
import { asset } from "../lib/assets.js";
import { mediaProps } from "../lib/media.js";
import { useAdminAuth } from "../context/AdminAuth.jsx";
import { accessRequestHref } from "../lib/adminAuth.js";
import { PUBLIC_BRAND } from "../lib/publicBrand.js";
import { validateAuthReturnTarget } from "../lib/authReturn.js";
import "../styles/sign-in.css";

export default function SignIn({ mode = "admin" } = {}) {
  const { phase, user, error, signOutRetryable, signIn, signOut, checkAccess } = useAdminAuth();
  const pending = ["checking", "signing_in", "signing_out"].includes(phase);
  const [entry, setEntry] = React.useState(["parent", "coach"].includes(mode) ? mode : "admin");
  const parentEntry = mode === "parent";
  const isParent = entry === "parent";
  const isCoach = entry === "coach";
  const denied = entry === "admin" && phase === "denied";
  const authorized = isParent || isCoach ? Boolean(user?.isGoogle && !pending) : phase === "authorized";
  const retry = () => { void checkAccess().catch(() => {}); };
  const google = () => {
    const here = validateAuthReturnTarget(window.location.pathname + window.location.search);
    void signIn(isCoach ? "/coach-dashboard/" : isParent ? here?.startsWith("/parent/") ? here : "/parent/" : here?.startsWith("/admin/") ? here : "/admin/").catch(() => {});
  };
  const chooseEntry = value => setEntry(value);
  const tabsKeyDown = event => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const entries = ["parent", "coach", "admin"];
    const current = entries.indexOf(entry);
    const backwards = ["ArrowLeft", "ArrowUp"].includes(event.key);
    const next = event.key === "Home" ? entries[0] : event.key === "End" ? entries[2] : entries[(current + (backwards ? 2 : 1)) % 3];
    setEntry(next); document.getElementById(`signin-tab-${next}`)?.focus();
  };
  return <section className={parentEntry ? "signin-page signin-page-parent" : "signin-page"} aria-labelledby="signin-heading">
    <div className="signin-wrap">
      <div className="signin-card">
        {!parentEntry && <div className="signin-visual">
          <img className="signin-ribbon" src={asset("signin-ribbon.svg")} alt="" width="500" height="800" />
          <div className="signin-art-shade" aria-hidden="true" />
          <div className="signin-role-tabs" data-entry-count="3" role="tablist" aria-label="Sign-in destination" onKeyDown={tabsKeyDown}>
            {[['parent', 'Parents'], ['coach', 'Coach'], ['admin', 'Admin']].map(([value, label]) => <button key={value} className="signin-role-tab" id={`signin-tab-${value}`} type="button" role="tab" aria-selected={entry === value} aria-controls="signin-panel" tabIndex={entry === value ? 0 : -1} onClick={() => chooseEntry(value)}>{label}</button>)}
          </div>
        </div>}
        <div className="signin-panel" id="signin-panel" role={parentEntry ? undefined : "tabpanel"} aria-labelledby={parentEntry ? undefined : `signin-tab-${entry}`}>
          <div className="signin-content">
            {parentEntry ? <img className="signin-parent-logo" {...mediaProps("logo.png", "112px")} width="538" height="393" alt="LetsAimIt" /> : <div className="signin-role-icon"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="2" /><rect x="19" y="5" width="8" height="8" rx="2" /><rect x="5" y="19" width="8" height="8" rx="2" /><rect x="19" y="19" width="8" height="8" rx="2" /></svg></div>}
            <h1 id="signin-heading">{denied ? "Admin access required." : authorized ? "You’re signed in." : parentEntry ? "Parent sign in" : "Sign in."}</h1>
            <p className="signin-description">{isCoach ? "Use your Google account to open attendance and feedback for assigned children." : isParent ? "View requests, payments and coaching updates." : denied ? "You don’t have admin access. Request access from the LetsAimIt team." : authorized ? "Your team dashboard is ready." : "Sign in with your approved Google account to open the team dashboard."}</p>
            {user?.email && <div className="signin-profile"><ProfileAvatar name={user.displayName || user.email} src={user.avatarUrl} /><div className="signin-profile-details"><strong>{user.displayName || user.email}</strong><span>{user.email}</span></div></div>}
            {authorized ? <a className="signin-google" href={isCoach ? "/coach-dashboard/" : isParent ? "/parent/" : "/admin/"}>{isParent ? "Parent dashboard" : isCoach ? "Coaching tracker" : "Open dashboard"}</a> : denied ? <>
              <a className="signin-google" href={accessRequestHref(user?.email)}>Request access</a>
              <p className="signin-access-help">Opens an email draft to LetsAimIt. Access is reviewed by the team.</p>
            </> : <button className="signin-google" type="button" onClick={google} disabled={pending || phase === "not_configured"} aria-describedby="signin-status">
              <img src={asset("google-g.png")} alt="" width="20" height="20" />
              <span>{phase === "checking" ? "Checking access…" : phase === "signing_in" ? "Opening Google…" : phase === "signing_out" ? "Signing out…" : "Continue with Google"}</span>
            </button>}
            <p id="signin-status" className="signin-status" role={error && !authorized ? "alert" : "status"} aria-live="polite">{authorized && (isParent || isCoach) ? "" : error || (phase === "checking" ? "Checking your Google account." : "")}</p>
            {denied && user?.isGoogle && <a className="signin-text-button" href="/parent/">Open my parent requests</a>}
            {denied && <button className="signin-text-button" type="button" onClick={google}>Use another Google account</button>}
            {(denied || (phase === "error" && !authorized)) && <button className="signin-text-button" type="button" onClick={retry}>Check access again</button>}
            {user && <button className="signin-text-button" type="button" onClick={() => { void signOut(); }}>Sign out</button>}
            {signOutRetryable && <button className="signin-text-button" type="button" onClick={() => { void signOut(); }}>Retry sign-out</button>}
            {parentEntry && !user && <a className="signin-text-button signin-register-link" href="/register/">Register your child</a>}
            <div className="signin-legal" aria-label="Policies"><a href={PUBLIC_BRAND.privacyUrl}>Privacy</a><span aria-hidden="true">·</span><a href={PUBLIC_BRAND.termsUrl}>Terms</a></div>
          </div>
        </div>
      </div>
      <a className="signin-home" href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>Back to home</a>
    </div>
  </section>;
}
