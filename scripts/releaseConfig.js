function publicKeyMatches(key, projectRef) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const parts = key.split(".");
    if (parts.length !== 3 || parts.some(part => !part)) return false;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claims.role === "anon" && claims.ref === projectRef;
  } catch { return false; }
}

/** Configuration checks only: no credentials are returned, logged or sent. */
export function validateReleaseConfig(env, targets) {
  const deployment = env.VERCEL_TARGET_ENV || env.VERCEL_ENV;
  const production = [env.VERCEL_ENV, env.VERCEL_TARGET_ENV].includes("production");
  const target = production ? "production" : deployment === "uat" || (deployment === "preview" && env.VERCEL_GIT_COMMIT_REF === targets.uat.branch) ? "uat" : null;
  const result = (ok, code, message) => ({ ok, target, code, message });
  if (!deployment) return result(false, "DEPLOYMENT_TARGET_MISSING", "Vercel deployment environment metadata is required.");
  if (!target) return result(true, "NOT_RELEASE_READY", "Preview/development build; backend release readiness is not checked.");
  const expected = targets[target];
  if (env.VERCEL_GIT_COMMIT_REF !== expected.branch) return result(false, "SOURCE_BRANCH_MISMATCH", "Release source branch does not match the selected target.");
  if (!/^[a-z0-9]{20}$/.test(expected.supabaseProjectRef || "")) return result(false, "BACKEND_NOT_CONFIGURED", "The selected target has no configured Supabase project reference.");
  if (production && expected.supabaseProjectRef === targets.uat.supabaseProjectRef) return result(false, "BACKEND_NOT_SEPARATE", "Production must use a separate Supabase project from UAT.");
  if ((env.VITE_SITE_ORIGIN || "").replace(/\/$/, "") !== expected.origin) return result(false, "SITE_ORIGIN_MISMATCH", "Public site origin does not match the selected release target.");
  if ((env.VITE_SUPABASE_URL || "").replace(/\/$/, "") !== `https://${expected.supabaseProjectRef}.supabase.co`) return result(false, "BACKEND_TARGET_MISMATCH", "Supabase URL does not match the selected release target.");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!key || !key.trim()) return result(false, "PUBLIC_KEY_MISSING", "A Supabase public browser key is required for a release.");
  if (!publicKeyMatches(key, expected.supabaseProjectRef)) return result(false, "PUBLIC_KEY_INVALID", "Use a Supabase publishable key or matching legacy anon key, never a private key.");
  return result(true, "CONFIGURATION_VALID", "Release target configuration passed; live backend verification remains separate.");
}
