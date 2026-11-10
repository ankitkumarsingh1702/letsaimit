import { timingSafeEqual } from "node:crypto";

export const ACCOUNT_DELETION_POLICY = "2026-11-11";
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validStatus = value => value === "deleting" || value === "deleted";
function workerAuthorized(value, secret) {
  if (typeof secret !== "string" || secret.length < 32 || typeof value !== "string") return false;
  const expected = new TextEncoder().encode(`Bearer ${secret}`), supplied = new TextEncoder().encode(value);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

/** Runs only rows already archived by the service-owned transaction. No caller can choose a different user. */
export async function drainAccountDeletions({ rpc, removeAuthUser, deletionId = null, expectedUserId = null, limit = 5 }) {
  const jobs = await rpc("claim_account_deletions", { p_deletion_id: deletionId, p_limit: Math.min(5, Math.max(1, limit)) });
  if (!Array.isArray(jobs) || jobs.length > 5) throw new Error("invalid_deletion_jobs");
  const counts = { processed: 0, deleted: 0, deferred: 0 };
  for (const job of jobs) {
    if (!uuid(job.id) || !uuid(job.user_id) || !uuid(job.lease_token)) throw new Error("invalid_deletion_job");
    if (deletionId && job.id !== deletionId || expectedUserId && job.user_id !== expectedUserId) throw new Error("deletion_subject_mismatch");
    counts.processed += 1;
    let success = false;
    try { success = (await removeAuthUser(job.user_id)) === true; } catch { /* Durable retry; never expose Auth/provider details. */ }
    const result = await rpc("finish_account_deletion", { p_id: job.id, p_lease_token: job.lease_token, p_success: success, p_error_code: success ? "" : "auth_delete_failed" });
    if (result === "deleted" || result?.status === "deleted") counts.deleted += 1;
    else counts.deferred += 1;
  }
  return counts;
}

/** Public self-deletion uses a remotely verified actor; recovery uses the existing narrow worker secret. */
export function createAccountDeletionHandler({ allowedOrigin, workerSecret, verifyUser, verifyClaims, revokeSessions, removeAuthUser, rpc, assertReady = () => {}, log = (_entry) => {}, clock = Date.now }) {
  return async request => {
    const started = clock();
    const correlation = crypto.randomUUID();
    const origin = request.headers.get("origin");
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", "X-Request-Id": correlation };
    if (origin && origin === allowedOrigin) Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" });
    const reply = (status, body) => {
      log({ stage: "account_deletion", correlation, outcome: body.code || body.status || "worker_complete", elapsedMs: Math.max(0, clock() - started) });
      return new Response(JSON.stringify(body), { status, headers });
    };
    if (origin && origin !== allowedOrigin) return reply(403, { ok: false, code: "origin_not_allowed" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, { ok: false, code: "method_not_allowed" });
    try { await assertReady(); } catch { return reply(503, { ok: false, code: "deletion_unavailable" }); }
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 2048) throw new Error("oversized");
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    } catch { return reply(400, { ok: false, code: "invalid_request" }); }
    if (body.mode === "worker") {
      if (!workerAuthorized(request.headers.get("authorization"), workerSecret)) return reply(401, { ok: false, code: "unauthorized" });
      try { return reply(200, { ok: true, ...await drainAccountDeletions({ rpc, removeAuthUser }) }); }
      catch { return reply(503, { ok: false, code: "deletion_unavailable" }); }
    }
    if (!uuid(body.expectedUserId) || body.policyVersion !== ACCOUNT_DELETION_POLICY || body.confirmPermanent !== true || body.acceptForfeit !== true) return reply(400, { ok: false, code: "confirmation_required" });
    const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 8192) return reply(401, { ok: false, code: "unauthorized" });
    try {
      let actor = null;
      try { actor = await verifyUser(token); } catch { /* A completed Auth deletion may leave its signed access JWT until expiry. */ }
      if (!actor) {
        // Verify the signature/expiry through Supabase, never decode an untrusted token to select a subject.
        const claims = await verifyClaims(token);
        if (!uuid(claims?.sub)) return reply(401, { ok: false, code: "unauthorized" });
        if (claims.sub !== body.expectedUserId) return reply(409, { ok: false, code: "identity_changed" });
        const existing = await rpc("get_account_deletion_status", { p_user_id: claims.sub });
        if (!existing || !validStatus(existing.status)) return reply(401, { ok: false, code: "unauthorized" });
        return reply(existing.status === "deleted" ? 200 : 202, { ok: true, status: existing.status, deletedUserId: claims.sub });
      }
      if (!uuid(actor.id) || actor.app_metadata?.provider !== "google") return reply(401, { ok: false, code: "unauthorized" });
      if (actor.id !== body.expectedUserId) return reply(409, { ok: false, code: "identity_changed" });
      const prepared = await rpc("prepare_account_deletion", { p_user_id: actor.id, p_policy_version: ACCOUNT_DELETION_POLICY, p_accept_forfeit: true });
      if (!uuid(prepared?.deletion_id) || !validStatus(prepared.status)) throw new Error("invalid_deletion_receipt");
      if (prepared.status !== "deleted") {
        try { await revokeSessions(token); } catch { /* DB tombstone already denies sensitive access; Auth deletion also removes refresh sessions. */ }
        try { await drainAccountDeletions({ rpc, removeAuthUser, deletionId: prepared.deletion_id, expectedUserId: actor.id, limit: 1 }); } catch { /* Minute recovery resumes only persisted work. */ }
      }
      const state = await rpc("get_account_deletion_status", { p_user_id: actor.id });
      if (!state || !validStatus(state.status)) throw new Error("invalid_deletion_status");
      return reply(state.status === "deleted" ? 200 : 202, { ok: true, status: state.status, deletedUserId: actor.id });
    } catch (error) {
      if (error?.code === "owner_protected") return reply(409, { ok: false, code: "owner_protected" });
      return reply(503, { ok: false, code: "deletion_unavailable" });
    }
  };
}
