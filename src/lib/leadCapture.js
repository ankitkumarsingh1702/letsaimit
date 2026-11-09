import { trackEvent } from "./analytics.js";
import { getSupabaseClient } from "./supabase.js";
export const CONSENT_VERSION = "2026-11-05";
export const PARENT_CONSENT_VERSION = "2026-11-09";
const endpoint = import.meta.env?.VITE_LEAD_ENDPOINT || "";
export const leadCaptureConfigured = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint);
export function newSubmissionId() { return crypto.randomUUID(); }

/** Parent registration stays in the site; only a saved database receipt succeeds. */
export async function saveRegistration(formType, data, consent, submissionId) {
  return submitRegistration({ formType, data, consent, submissionId }, { client: getSupabaseClient() });
}

export async function submitRegistration({ formType, data, consent, submissionId }, {
  client, timeoutMs = 25000, onSaved = kind => trackEvent("lead_saved", { kind }),
} = {}) {
  if (!client) {
    throw new Error("We couldn’t connect to registration. Please try again shortly or contact the coach.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data: receipt, error } = await client.rpc("submit_registration", { payload: {
        full_name: data.parentName, email: data.email, phone: data.phone,
        metadata: { ...data, submissionId, formType, guardianConsent: consent.agreed === true && consent.guardian === true,
          termsAccepted: consent.terms === true, termsVersion: consent.terms ? CONSENT_VERSION : "", consentVersion: PARENT_CONSENT_VERSION },
      } }).abortSignal(controller.signal);
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (error) {
      throw new Error(["23505", "PT409"].includes(error.code) ? "These details changed. Edit the form and submit again." : "We couldn’t save your details. Please retry.");
    }
    if (receipt?.ok !== true || receipt.submissionId !== submissionId || typeof receipt.duplicate !== "boolean" ||
      typeof receipt.id !== "string" || !receipt.id || !Number.isFinite(Date.parse(receipt.savedAt))) {
      throw new Error("We couldn’t confirm the save. Please retry safely.");
    }
    if (!receipt.duplicate) onSaved(formType);
    return receipt;
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") throw new Error("The save took too long to confirm. Your answers are kept. Retry safely.");
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error("We couldn’t confirm the save. Check your connection and retry.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

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
