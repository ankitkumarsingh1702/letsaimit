import { createBillingWebhookHandler, createRazorpayClient } from "../_shared/razorpay-billing.js";
const env = (name: string) => Deno.env.get(name) || "";
async function rpc(name: string, body: Record<string, unknown>, options?: { signal: AbortSignal }) {
  const result = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` }, body: JSON.stringify(body), signal: options?.signal ?? AbortSignal.timeout(3500) });
  if (!result.ok) throw new Error("rpc_failed");
  return result.json();
}
let provider: ReturnType<typeof createRazorpayClient> | undefined;
Deno.serve(createBillingWebhookHandler({ secret: env("RAZORPAY_WEBHOOK_SECRET"), rpc,
  resolveOwnership: (ids, options) => {
    if (!/^rzp_live_[a-zA-Z0-9]+$/.test(env("RAZORPAY_KEY_ID"))) throw new Error("configuration_error");
    provider ??= createRazorpayClient({ keyId: env("RAZORPAY_KEY_ID"), keySecret: env("RAZORPAY_KEY_SECRET"), timeoutMs: 3000 });
    return provider.resolveWebhookOwnership(ids, options);
  },
}));
