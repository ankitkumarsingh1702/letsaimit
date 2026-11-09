import { createClient } from "@supabase/supabase-js";

let client;
export function getSupabaseClient() {
  if (client) return client;
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { flowType: "pkce", detectSessionInUrl: true, autoRefreshToken: true, persistSession: true },
  });
  return client;
}
