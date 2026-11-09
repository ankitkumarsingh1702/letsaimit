import React from "react";
import ProfileAvatar from "../components/ProfileAvatar.jsx";
import { asset } from "../lib/assets.js";
import { useAdminAuth } from "../context/AdminAuth.jsx";
import { accessRequestHref } from "../lib/adminAuth.js";
import { PUBLIC_BRAND } from "../lib/publicBrand.js";
import "../styles/sign-in.css";

export default function SignIn() {
  const { phase, user, error, signOutRetryable, signIn, signOut, checkAccess } = useAdminAuth();
  const pending = ["checking", "signing_in", "signing_out"].includes(phase);
  const denied = phase === "denied";
  const authorized = phase === "authorized";
  const retry = () => { void checkAccess().catch(() => {}); };
  const google = () => { void signIn().catch(() => {}); };
  return <section className="signin-page" aria-labelledby="signin-heading">
    <div className="signin-wrap">
      <div className="signin-card">
        <div className="signin-visual">
          <img className="signin-ribbon" src={asset("signin-ribbon.svg")} alt="" width="500" height="800" />
          <div className="signin-art-shade" aria-hidden="true" />
          <div className="signin-role-tabs" role="tablist" aria-label="Team sign-in">
            <button className="signin-role-tab" id="signin-tab-admin" type="button" role="tab" aria-selected="true" aria-controls="signin-panel">Admin</button>
          </div>
        </div>
        <div className="signin-panel" id="signin-panel" role="tabpanel" aria-labelledby="signin-tab-admin">
          <div className="signin-content">
            <div className="signin-role-icon"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="2" /><rect x="19" y="5" width="8" height="8" rx="2" /><rect x="5" y="19" width="8" height="8" rx="2" /><rect x="19" y="19" width="8" height="8" rx="2" /></svg></div>
            <h1 id="signin-heading">{denied ? "Admin access required." : authorized ? "You’re signed in." : "Sign in."}</h1>
            <p className="signin-description">{denied ? "You don’t have admin access. Request access from the LetsAimIt team." : authorized ? "Your team dashboard is ready." : "Sign in with your approved Google account to open the team dashboard."}</p>
            {user?.email && <div className="signin-profile"><ProfileAvatar name={user.displayName || user.email} src={user.avatarUrl} /><div className="signin-profile-details"><strong>{user.displayName || user.email}</strong><span>{user.email}</span></div></div>}
            {authorized ? <a className="signin-google" href="/admin/">Open dashboard</a> : denied ? <>
              <a className="signin-google" href={accessRequestHref(user?.email)}>Request access</a>
              <p className="signin-access-help">Opens an email draft to LetsAimIt. Access is reviewed by the team.</p>
            </> : <button className="signin-google" type="button" onClick={google} disabled={pending || phase === "not_configured"} aria-describedby="signin-status">
              <img src={asset("google-g.png")} alt="" width="20" height="20" />
              <span>{phase === "checking" ? "Checking access…" : phase === "signing_in" ? "Opening Google…" : phase === "signing_out" ? "Signing out…" : "Continue with Google"}</span>
            </button>}
            <p id="signin-status" className="signin-status" role={error ? "alert" : "status"} aria-live="polite">{error || (phase === "checking" ? "Verifying your team access." : "")}</p>
            {denied && <button className="signin-text-button" type="button" onClick={google}>Use another Google account</button>}
            {(denied || phase === "error") && <button className="signin-text-button" type="button" onClick={retry}>Check access again</button>}
            {user && <button className="signin-text-button" type="button" onClick={() => { void signOut(); }}>Sign out</button>}
            {signOutRetryable && <button className="signin-text-button" type="button" onClick={() => { void signOut(); }}>Retry sign-out</button>}
            <div className="signin-legal" aria-label="Policies"><a href={PUBLIC_BRAND.privacyUrl}>Privacy</a><span aria-hidden="true">·</span><a href={PUBLIC_BRAND.termsUrl}>Terms</a></div>
          </div>
        </div>
      </div>
      <a className="signin-home" href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>Back to home</a>
    </div>
  </section>;
}
