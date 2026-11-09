import { timingSafeEqual } from "node:crypto";
import { buildNewRequestEmail, buildDigestEmail } from "./notification-email.js";

const response = (status, value) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
function authorized(value, secret) {
  if (typeof secret !== "string" || secret.length < 32 || typeof value !== "string") return false;
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  const received = new TextEncoder().encode(value);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function isSingleMailbox(value) {
  if (typeof value !== "string" || value.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/i.test(value)) return false;
  const [local, domain] = value.split("@");
  return local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..")
    && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}

export function validateMailConfiguration({ smtpHost, smtpPort, smtpUser, smtpPassword, senderEmail, dashboardOrigin }) {
  if (smtpHost !== "smtp.gmail.com" || Number(smtpPort) !== 465 || !isSingleMailbox(smtpUser) || !isSingleMailbox(senderEmail) || smtpUser.toLowerCase() !== senderEmail.toLowerCase() || !/^[a-z0-9]{16}$/i.test(smtpPassword || "")) throw new Error("configuration_error");
  if (!["https://letsaimit.com", "https://uat.letsaimit.com"].includes(dashboardOrigin)) throw new Error("configuration_error");
}

/** Authenticated POST drains durable jobs only; the request body never chooses recipients or content. */
export function createNotificationHandler({ secret, dashboardOrigin, assertReady = () => {}, rpc, sendEmail, clock = Date.now, maxJobs = 8 }) {
  return async request => {
    if (request.method !== "POST") return response(405, { ok: false, error: "method_not_allowed" });
    if (typeof secret !== "string" || secret.length < 32) return response(503, { ok: false, error: "not_configured" });
    if (!authorized(request.headers.get("authorization"), secret)) return response(401, { ok: false, error: "unauthorized" });
    try { await assertReady(); } catch { return response(503, { ok: false, error: "not_configured" }); }
    const counts = { processed: 0, sent: 0, failedAttempts: 0, skipped: 0, unconfirmed: 0 };
    const deadline = clock() + 90000;
    try {
      await rpc("enqueue_admin_notification_digests", {});
      for (let index = 0; index < Math.min(8, Math.max(1, maxJobs)) && clock() < deadline; index += 1) {
        const job = await rpc("claim_admin_notification", {});
        if (!job) break;
        counts.processed += 1;
        try {
          // This immediately preceding read checks CURRENT membership, not the enqueue-time recipient snapshot.
          const prepared = await rpc("prepare_admin_notification", { p_id: job.id, p_lease_token: job.leaseToken });
          if (!prepared) { counts.skipped += 1; continue; }
          const message = prepared.kind === "new_request"
            ? buildNewRequestEmail({ request: prepared.content, dashboardOrigin })
            : prepared.kind === "digest" ? buildDigestEmail({ summary: prepared.content, dashboardOrigin }) : null;
          if (!message || !isSingleMailbox(prepared.recipientEmail)) throw new Error("invalid_job");
          const delivered = await sendEmail({ ...message, recipientEmail: prepared.recipientEmail, messageId: `<${job.id}@letsaimit.com>` });
          if (delivered?.accepted !== true) throw new Error("transport_failure");
          const saved = await rpc("finish_admin_notification", { p_id: job.id, p_lease_token: job.leaseToken, p_outcome: "sent", p_failure_code: "" });
          if (saved) counts.sent += 1;
          else counts.unconfirmed += 1;
        } catch {
          counts.failedAttempts += 1;
          try {
            const saved = await rpc("finish_admin_notification", { p_id: job.id, p_lease_token: job.leaseToken, p_outcome: "retry", p_failure_code: "transport_failure" });
            if (!saved) counts.unconfirmed += 1;
          } catch { counts.unconfirmed += 1; }
        }
      }
      return response(200, { ok: true, ...counts });
    } catch {
      // No recipient, body, credential, SQL or provider exception is returned/logged.
      return response(503, { ok: false, error: "worker_unavailable", ...counts });
    }
  };
}
