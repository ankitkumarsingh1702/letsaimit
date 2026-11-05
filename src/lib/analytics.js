const ALLOWED_EVENTS = new Set(["free_trial_click", "enrol_click", "whatsapp_click", "call_click", "lead_saved", "society_enquiry_click", "school_enquiry_click"]);
const ALLOWED_PAGES = new Set(["home", "programme", "coach", "societies", "schools", "events", "privacy", "terms", "refunds", "notfound"]);
const GA_ID = import.meta.env.VITE_GA4_ID || "";
let analyticsReady = false;
export const analyticsConfigured = /^G-[A-Z0-9]+$/.test(GA_ID) && import.meta.env.VITE_GA4_MANUAL_EVENTS_ONLY_CONFIRMED === "true";
export function startAnalytics() {
  if (!analyticsConfigured || analyticsReady || navigator.globalPrivacyControl) return;
  analyticsReady = true;
  window.dataLayer ||= [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, {
    send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
    page_location: window.location.origin + window.location.pathname, page_referrer: "",
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);
}
export function trackEvent(name, { page, kind } = {}) {
  if (!analyticsReady || !ALLOWED_EVENTS.has(name)) return;
  const safePage = ALLOWED_PAGES.has(page) ? page : document.body.dataset.page;
  const meta = { page_name: ALLOWED_PAGES.has(safePage) ? safePage : "notfound" };
  if (["trial", "enrol", "society", "school"].includes(kind)) meta.form_kind = kind;
  // Never send field values, parent/child details, full URLs or WhatsApp message text.
  window.gtag("event", name, meta);
}
export function installClickAnalytics() {
  function handleClick(event) {
    const target = event.target.closest?.("a,button");
    if (!target) return;
    const action = target.dataset.action;
    const href = target.getAttribute("href") || "";
    if (href.startsWith("tel:")) trackEvent("call_click");
    else if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)) trackEvent("whatsapp_click");
    else if (action === "trial") trackEvent("free_trial_click");
    else if (action === "enroll" || action === "enrol") trackEvent("enrol_click");
    else if (action === "society") trackEvent("society_enquiry_click");
    else if (action === "school") trackEvent("school_enquiry_click");
  }
  document.addEventListener("click", handleClick);
  return () => document.removeEventListener("click", handleClick);
}
