import * as React from "react";
import { analyticsConfigured, installClickAnalytics, startAnalytics } from "../lib/analytics.js";
export default function AnalyticsConsent() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    const cleanup = installClickAnalytics();
    if (!analyticsConfigured || navigator.globalPrivacyControl) return cleanup;
    let choice;
    try { choice = localStorage.getItem("letsaimit-analytics-consent-v1"); } catch { /* Preferences may be unavailable. */ }
    if (choice === "yes") startAnalytics();
    else if (!choice) setShow(true);
    return cleanup;
  }, []);
  function choose(yes) {
    try { localStorage.setItem("letsaimit-analytics-consent-v1", yes ? "yes" : "no"); } catch { /* Keep this choice for the current visit. */ }
    if (yes) startAnalytics();
    setShow(false);
  }
  if (!show) return null;
  return <aside className="analytics-consent" aria-label="Analytics preference">
    <p>Help us improve? Allow usage analytics without form details. <a href="/privacy/">Privacy</a></p>
    <div><button type="button" onClick={() => choose(false)}>No thanks</button><button type="button" className="btn btn-lime" onClick={() => choose(true)}>Allow analytics</button></div>
  </aside>;
}
