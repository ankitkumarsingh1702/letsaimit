import { validTrackerDate } from "../features/tracker/trackerData.js";

const STORAGE_KEY = "letsaimit.auth.return.v1";
const MAX_AGE_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function browserStorage() {
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}

/** Only same-site product destinations are allowed; no OAuth codes, tokens or arbitrary return URLs. */
export function validateAuthReturnTarget(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f#]/u.test(value)) return null;
  let url;
  try { url = new URL(value, "https://letsaimit.com"); } catch { return null; }
  if (url.origin !== "https://letsaimit.com") return null;
  const entries = [...url.searchParams];
  if (url.pathname === "/coach-dashboard/") {
    if (!entries.length) return "/coach-dashboard/";
    if (entries.length === 1 && entries[0][0] === "date" && validTrackerDate(entries[0][1])) return `/coach-dashboard/?date=${entries[0][1]}`;
    return null;
  }
  if (url.pathname === "/register/" && entries.length === 1 && url.searchParams.get("resume") === "enrol") return "/register/?resume=enrol";
  if (url.pathname === "/parent/") {
    if (!entries.length) return "/parent/";
    if (entries.length === 1 && entries[0][0] === "view" && ["dashboard", "requests", "payments", "tracking", "tracker", "account"].includes(entries[0][1])) return `/parent/?view=${entries[0][1]}`;
    if (entries.length !== 1 || entries[0][0] !== "resume" || !["trial", "enrol"].includes(entries[0][1])) return null;
    return `/parent/?resume=${entries[0][1]}`;
  }
  if (url.pathname === "/admin/") {
    if (!entries.length) return "/admin/";
    if (url.searchParams.get("view") === "attendance") {
      if (entries.length === 1) return "/admin/?view=attendance";
      const date = url.searchParams.get("date");
      if (entries.length === 2 && validTrackerDate(date)) return `/admin/?view=attendance&date=${date}`;
      return null;
    }
    if (entries.length !== 2 || !entries.every(([key]) => ["requestId", "requestedDecision"].includes(key))) return null;
    const id = url.searchParams.get("requestId");
    const decision = url.searchParams.get("requestedDecision");
    if (!UUID.test(id || "") || !["accept", "decline"].includes(decision)) return null;
    return `/admin/?requestId=${id.toLowerCase()}&requestedDecision=${decision}`;
  }
  return null;
}

export function storeAuthReturnTarget(target, storage = browserStorage(), now = Date.now()) {
  const safe = validateAuthReturnTarget(target);
  try {
    if (!safe || !Number.isFinite(now)) { storage?.removeItem(STORAGE_KEY); return false; }
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify({ target: safe, createdAt: now, expiresAt: now + MAX_AGE_MS }));
    return true;
  } catch { return false; }
}

export function clearAuthReturnTarget(storage = browserStorage()) {
  try { storage?.removeItem(STORAGE_KEY); } catch { /* No persistent fallback. */ }
}

/** Consumed once, including invalid/expired entries, so callbacks cannot loop. */
export function consumeAuthReturnTarget(storage = browserStorage(), now = Date.now()) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    storage?.removeItem(STORAGE_KEY);
    if (!raw || !Number.isFinite(now)) return null;
    const entry = JSON.parse(raw);
    if (!entry || !Number.isFinite(entry.createdAt) || entry.expiresAt !== entry.createdAt + MAX_AGE_MS || now < entry.createdAt || now >= entry.expiresAt) return null;
    return validateAuthReturnTarget(entry.target);
  } catch { return null; }
}
