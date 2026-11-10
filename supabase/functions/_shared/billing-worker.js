import { timingSafeEqual } from "node:crypto";
import { isSingleMailbox } from "./notification-worker.js";
import { buildBillingEmail, buildBillingReminderEmail } from "./billing-email.js";

const response = (status, body) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function authorized(value, secret) {
  if (typeof secret !== "string" || secret.length < 32 || typeof value !== "string") return false;
  const expected = new TextEncoder().encode(`Bearer ${secret}`), received = new TextEncoder().encode(value);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Requests choose no accounts, amounts or recipients. Only durable service-owned work is processed. */
export function createBillingWorker({ secret, rpc, provider, sendEmail, dashboardOrigin, assertReady = () => {}, maxJobs = 6, clock = Date.now }) {
  return async request => {
    if (request.method !== "POST") return response(405, { ok: false, error: "method_not_allowed" });
    if (!secret || secret.length < 32) return response(503, { ok: false, error: "not_configured" });
    if (!authorized(request.headers.get("authorization"), secret)) return response(401, { ok: false, error: "unauthorized" });
    try { await assertReady(); } catch { return response(503, { ok: false, error: "not_configured" }); }
    const counts = { processed: 0, completed: 0, sent: 0, deferred: 0, skipped: 0, unconfirmed: 0 };
    const deadline = clock() + 90000;
    try {
      await rpc("enqueue_billing_work", {});
      for (let index = 0; index < Math.max(1, Math.min(6, maxJobs)) && clock() < deadline; index += 1) {
        const job = await rpc("claim_billing_job", {});
        if (!job) break;
        counts.processed += 1;
        const lease = { p_id: job.id, p_lease_token: job.leaseToken };
        const finish = async (outcome, code = "") => {
          const saved = await rpc("finish_billing_job", { ...lease, p_outcome: outcome, p_failure_code: code });
          if (!saved) counts.unconfirmed += 1;
          return saved;
        };
        let stage = "prepare";
        try {
          let work = await rpc("prepare_billing_job", lease);
          if (!work) { counts.skipped += 1; continue; }
          const save = async (invoice, snapshot) => rpc("save_billing_provider_snapshot", { p_invoice_id: invoice.id, p_snapshot: snapshot });
          const deliver=async(recipientEmail,message)=>{
            stage="email";
            if(!isSingleMailbox(recipientEmail)) throw Object.assign(new Error("invalid_recipient"),{code:"invalid_bill"});
            const result=await sendEmail({...message,recipientEmail,messageId:`<billing-${job.id}@letsaimit.com>`});
            if(result?.accepted!==true) throw new Error("transport_failure");
            counts.sent+=1;
          };
          if(work.kind==="send_fee_change"||work.kind==="send_month_summary") {
            await deliver(work.kind==="send_fee_change"?work.invoice?.parent_email:work.recipient_email,buildBillingEmail({kind:work.kind,invoice:work.invoice,summary:work.summary,dashboardOrigin}));
            if(await finish("done")) counts.completed+=1;
            continue;
          }
          if(work.kind==="send_reminder") {
            if(!Array.isArray(work.preflight_invoices)||work.preflight_invoices.length>20||!Number.isSafeInteger(work.preflight_remaining)||work.preflight_remaining<0) throw Object.assign(new Error("invalid_group"),{code:"invalid_bill"});
            stage="reconcile";
            let outOfTime=false;
            for(const invoice of work.preflight_invoices) {
              // Preserve progress through large groups without holding a lease past its deadline.
              if(clock()>deadline-25000) {outOfTime=true;break;}
              if(!invoice?.provider_invoice_id) throw Object.assign(new Error("invoice_missing"),{code:"invalid_provider_snapshot"});
              const snapshot=await provider.reconcileInvoice(invoice);
              if(!await save(invoice,snapshot)) throw Object.assign(new Error("snapshot_rejected"),{code:"invalid_provider_snapshot"});
            }
            work=await rpc("prepare_billing_job",lease);
            if(!work) {counts.skipped+=1;continue;}
            if(outOfTime||!Number.isSafeInteger(work.preflight_remaining)||work.preflight_remaining>0) {
              await finish("retry","provider_unavailable");counts.deferred+=1;continue;
            }
            await deliver(work.recipient_email,buildBillingReminderEmail({reminder:work,dashboardOrigin}));
            if(await finish("done")) counts.completed+=1;
            continue;
          }
          // Recheck the provider before emailing an unpaid bill or issuing a late-fee bill.
          // The second preparation rechecks current ownership, account state and captured payment.
          if (work.invoice.base_invoice_id && !work.invoice.base_provider_invoice_id) {
            await finish("retry", "invoice_missing"); counts.deferred += 1; continue;
          }
          if (work.invoice.base_provider_invoice_id) {
            stage = "reconcile";
            const base = { ...work.invoice.base_invoice, id: work.invoice.base_invoice_id, provider_invoice_id: work.invoice.base_provider_invoice_id };
            const snapshot = await provider.reconcileInvoice(base);
            if (!await save(base, snapshot)) throw Object.assign(new Error("snapshot_rejected"), { code: "invalid_provider_snapshot" });
            work = await rpc("prepare_billing_job", lease);
            if (!work) { counts.skipped += 1; continue; }
          } else if (work.kind==="send_invoice" && work.invoice.provider_invoice_id) {
            stage = "reconcile";
            const snapshot = await provider.reconcileInvoice(work.invoice);
            if (!await save(work.invoice, snapshot)) throw Object.assign(new Error("snapshot_rejected"), { code: "invalid_provider_snapshot" });
            work = await rpc("prepare_billing_job", lease);
            if (!work) { counts.skipped += 1; continue; }
          }
          if (work.kind === "create_invoice") {
            stage = "create";
            const snapshot = await provider.createInvoice(work.invoice);
            stage = "save_created";
            if (!await save(work.invoice, snapshot)) throw new Error("snapshot_rejected");
          } else if (work.kind === "reconcile_invoice") {
            stage = "reconcile";
            const snapshot = work.invoice.provider_invoice_id
              ? await provider.reconcileInvoice(work.invoice)
              : await provider.findByReceipt(work.invoice);
            // A missing result is not permission to create another real collectible invoice.
            if (!snapshot) { await finish("retry", "invoice_missing"); counts.deferred += 1; continue; }
            if (!await save(work.invoice, snapshot)) throw Object.assign(new Error("snapshot_rejected"), { code: "invalid_provider_snapshot" });
          } else if (["send_invoice", "send_receipt", "send_refund"].includes(work.kind)) {
            const message = buildBillingEmail({ kind: work.kind, invoice: work.invoice, dashboardOrigin, teamTesting: work.team_testing });
            await deliver(work.invoice.parent_email,message);
          } else throw Object.assign(new Error("invalid_job"), { code: "invalid_bill" });
          if (await finish("done")) counts.completed += 1;
        } catch (error) {
          counts.deferred += 1;
          // A timed-out create or lost save acknowledgement may already have created a payable bill.
          // Always reconcile by stable receipt next. Never repeat that POST blindly.
          const definiteFailure = ["provider_rejected", "invalid_bill", "provider_not_configured", "invalid_provider_snapshot", "provider_duplicate_invoice"].includes(error?.code);
          const ambiguous = stage === "save_created" || (stage === "create" && error?.code !== "provider_retry" && !definiteFailure);
          const outcome = ambiguous ? "ambiguous" : definiteFailure ? "failed" : "retry";
          const code = ambiguous ? "creation_ambiguous" : definiteFailure
            ? ["invalid_bill", "provider_not_configured"].includes(error?.code) ? "configuration_error" : "provider_mismatch"
            : stage === "email" ? "send_failure" : "provider_unavailable";
          try { await finish(outcome, code); }
          catch { counts.unconfirmed += 1; }
        }
      }
      return response(200, { ok: true, ...counts });
    } catch { return response(503, { ok: false, error: "worker_unavailable", ...counts }); }
  };
}
