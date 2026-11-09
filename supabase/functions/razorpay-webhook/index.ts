import { createBillingWebhookHandler } from "../_shared/razorpay-billing.js";
const env = (name: string) => Deno.env.get(name) || "";
async function rpc(name: string, body: Record<string, unknown>) {
  const result = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(3500) });
  if (!result.ok) throw new Error("rpc_failed");
  return result.json();
}
Deno.serve(createBillingWebhookHandler({ secret: env("RAZORPAY_WEBHOOK_SECRET"), rpc }));
