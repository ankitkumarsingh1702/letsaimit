import { timingSafeEqual } from "node:crypto";

export function createHealthHandler({ env = process.env, fetch: request = globalThis.fetch } = {}) {
  return async function health(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false });
    }
    if (!env.CRON_SECRET || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
      return res.status(503).json({ ok: false });
    }
    const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
    const authorization = typeof req.headers?.authorization === "string" ? req.headers.authorization : "";
    const supplied = Buffer.from(authorization);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return res.status(401).json({ ok: false });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/registration_health`;
      const response = await request(url, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: "{}",
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      });
      const healthy = response.ok === true && await response.json() === true;
      return res.status(healthy ? 200 : 503).json({ ok: healthy });
    } catch {
      return res.status(503).json({ ok: false });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export default createHealthHandler();
