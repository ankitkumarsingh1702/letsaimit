import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export function createHealthHandler({ env = process.env, makeClient = createClient } = {}) {
  return async function health(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "GET") return res.status(405).json({ ok: false });
    if (!env.CRON_SECRET || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
      return res.status(503).json({ ok: false });
    }
    const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
    const supplied = Buffer.from(req.headers.authorization || "");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return res.status(401).json({ ok: false });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const client = makeClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.rpc("registration_health").abortSignal(controller.signal);
      return res.status(error || data !== true ? 503 : 200).json({ ok: !error && data === true });
    } catch {
      return res.status(503).json({ ok: false });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export default createHealthHandler();
