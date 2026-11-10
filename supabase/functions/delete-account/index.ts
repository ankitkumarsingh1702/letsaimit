import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { createAccountDeletionHandler } from "../_shared/account-deletion.js";

const env = (name: string) => Deno.env.get(name) || "";
const url = env("SUPABASE_URL"), serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
// No persisted server session; the service credential is never returned to the browser.
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(name, args);
  if (error) {
    // The SQL error contains a fixed code, not a user-selected subject or SQL text.
    if (error.code === "PT409" && error.message === "owner_protected") throw Object.assign(new Error("owner_protected"), { code: "owner_protected" });
    throw new Error("deletion_rpc_failed");
  }
  return data;
}
Deno.serve(createAccountDeletionHandler({
  allowedOrigin: env("ADMIN_DASHBOARD_ORIGIN"), workerSecret: env("NOTIFICATION_CRON_SECRET"), rpc,
  verifyUser: async (token: string) => { const { data, error } = await admin.auth.getUser(token); return error ? null : data.user; },
  verifyClaims: async (token: string) => { const { data, error } = await admin.auth.getClaims(token); return error ? null : data?.claims; },
  revokeSessions: async (token: string) => { const { error } = await admin.auth.admin.signOut(token, "global"); if (error) throw new Error("session_revoke_failed"); },
  removeAuthUser: async (id: string) => {
    const { error } = await admin.auth.admin.deleteUser(id, false);
    return !error || error.code === "user_not_found" || error.status === 404;
  },
  assertReady: () => {
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !serviceKey || !/^https:\/\/[^/]+$/.test(env("ADMIN_DASHBOARD_ORIGIN")) || env("NOTIFICATION_CRON_SECRET").length < 32) throw new Error("not_configured");
  },
  log: (entry: Record<string, unknown>) => console.info(JSON.stringify(entry)),
}));
