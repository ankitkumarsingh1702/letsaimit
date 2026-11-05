import { trackEvent } from "./analytics.js";
export const CONSENT_VERSION = "2026-11-05";
const endpoint = import.meta.env.VITE_LEAD_ENDPOINT || "";
export const leadCaptureConfigured = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint);
export function newSubmissionId() { return crypto.randomUUID(); }

export async function saveLead(formType, data, consent, submissionId) {
  if (!leadCaptureConfigured) throw new Error("Registration storage is not connected yet.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ submissionId, formType, consent: { ...consent, version: CONSENT_VERSION }, data }),
      credentials: "omit", redirect: "follow", referrerPolicy: "no-referrer", signal: controller.signal,
    });
    if (!response.ok) throw new Error("We couldn’t confirm that your details were saved. Please retry.");
    const result = await response.json();
    if (result?.ok !== true || result.submissionId !== submissionId || typeof result.duplicate !== "boolean" || !Number.isFinite(Date.parse(result.savedAt))) {
      throw new Error(result?.code === "VALIDATION_ERROR" || result?.code === "CONSENT_REQUIRED" ? "Please check your details and consent, then retry." : "We couldn’t confirm that your details were saved. Please retry.");
    }
    if (!result.duplicate) trackEvent("lead_saved", { kind: formType });
    return result;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The connection took too long. Retry safely, or contact us in WhatsApp.");
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error("We couldn’t confirm a save. Check your connection and retry, or use WhatsApp.");
    throw error;
  } finally { window.clearTimeout(timeout); }
}
