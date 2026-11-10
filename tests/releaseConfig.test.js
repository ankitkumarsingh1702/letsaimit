import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateReleaseConfig } from "../scripts/releaseConfig.js";

const targets = JSON.parse(readFileSync(new URL("../deployment/release-targets.json", import.meta.url), "utf8"));
const futureProduction = { ...targets, production: { ...targets.production, supabaseProjectRef: "abcdefghijklmnopqrst" } };
const publicKey = "sb_publishable_test_browser_key";
const uatEnv = {
  VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_GIT_COMMIT_REF: "uat",
  VITE_SITE_ORIGIN: targets.uat.origin,
  VITE_SUPABASE_URL: `https://${targets.uat.supabaseProjectRef}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: publicKey,
};
const productionEnv = {
  ...uatEnv, VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production", VERCEL_GIT_COMMIT_REF: "main",
  VITE_SITE_ORIGIN: targets.production.origin,
  VITE_SUPABASE_URL: `https://${futureProduction.production.supabaseProjectRef}.supabase.co`,
};
const check = (env = {}, manifest = targets) => validateReleaseConfig({ ...uatEnv, ...env }, manifest);
const jwt = claims => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test-signature`;

test("the UAT release requires its declared source, site, backend and public key", () => {
  assert.equal(check().code, "CONFIGURATION_VALID");
  assert.equal(check({ VERCEL_TARGET_ENV: "uat" }).target, "uat");
  assert.equal(check({ VITE_SITE_ORIGIN: `${targets.uat.origin}/`, VITE_SUPABASE_URL: `${uatEnv.VITE_SUPABASE_URL}/` }).ok, true);
  assert.equal(check({ VERCEL_TARGET_ENV: "uat", VERCEL_GIT_COMMIT_REF: "feature/change" }).code, "SOURCE_BRANCH_MISMATCH");
  assert.equal(check({ VITE_SITE_ORIGIN: targets.production.origin }).code, "SITE_ORIGIN_MISMATCH");
  assert.equal(check({ VITE_SUPABASE_PUBLISHABLE_KEY: "", VITE_SUPABASE_ANON_KEY: "" }).code, "PUBLIC_KEY_MISSING");
  assert.equal(check({ VITE_SUPABASE_PUBLISHABLE_KEY: "   ", VITE_SUPABASE_ANON_KEY: publicKey }).code, "PUBLIC_KEY_MISSING");
});

test("backend URL checks reject a different project, insecure URL, credentials, path and query", () => {
  for (const url of [undefined, "", productionEnv.VITE_SUPABASE_URL, uatEnv.VITE_SUPABASE_URL.replace("https:", "http:"),
    uatEnv.VITE_SUPABASE_URL.replace("https://", "https://user:password@"), `${uatEnv.VITE_SUPABASE_URL}/rest/v1`, `${uatEnv.VITE_SUPABASE_URL}?target=uat`]) {
    assert.equal(check({ VITE_SUPABASE_URL: url }).code, "BACKEND_TARGET_MISMATCH");
  }
});

test("Production remains blocked until its separate project is configured", () => {
  assert.equal(validateReleaseConfig(productionEnv, targets).code, "BACKEND_NOT_CONFIGURED");
  assert.equal(validateReleaseConfig(productionEnv, futureProduction).code, "CONFIGURATION_VALID");
  assert.equal(validateReleaseConfig({ ...productionEnv, VITE_SUPABASE_URL: uatEnv.VITE_SUPABASE_URL }, futureProduction).code, "BACKEND_TARGET_MISMATCH");
  assert.equal(validateReleaseConfig({ ...productionEnv, VITE_SUPABASE_PUBLISHABLE_KEY: "" }, futureProduction).code, "PUBLIC_KEY_MISSING");
  const sharedBackend = { ...targets, production: { ...targets.production, supabaseProjectRef: targets.uat.supabaseProjectRef } };
  assert.equal(validateReleaseConfig(productionEnv, sharedBackend).code, "BACKEND_NOT_SEPARATE");
});

test("explicit Vercel Production metadata wins over branch or conflicting target metadata", () => {
  assert.equal(check({ VERCEL_ENV: "production" }).target, "production");
  assert.equal(check({ VERCEL_ENV: "production" }).code, "SOURCE_BRANCH_MISMATCH");
  assert.equal(check({ VERCEL_TARGET_ENV: "production" }).target, "production");
  assert.equal(validateReleaseConfig({ ...productionEnv, VERCEL_TARGET_ENV: "preview" }, targets).code, "BACKEND_NOT_CONFIGURED");
  assert.equal(check({ VERCEL_ENV: "", VERCEL_TARGET_ENV: "" }).code, "DEPLOYMENT_TARGET_MISSING");
});

test("unbound feature previews can build but never claim release readiness or infer Production from main", () => {
  for (const branch of ["feature/change", "main"]) {
    const result = validateReleaseConfig({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: branch }, targets);
    assert.deepEqual({ ok: result.ok, code: result.code, target: result.target }, { ok: true, code: "NOT_RELEASE_READY", target: null });
  }
  assert.equal(validateReleaseConfig({ VERCEL_ENV: "development" }, targets).code, "NOT_RELEASE_READY");
});

test("only public browser keys are accepted; legacy anon keys must identify the selected project", () => {
  assert.equal(check({ VITE_SUPABASE_PUBLISHABLE_KEY: "", VITE_SUPABASE_ANON_KEY: jwt({ role: "anon", ref: targets.uat.supabaseProjectRef }) }).ok, true);
  for (const key of ["sb_secret_never_publish", "not-a-key", jwt({ role: "service_role", ref: targets.uat.supabaseProjectRef }), jwt({ role: "anon", ref: futureProduction.production.supabaseProjectRef }), "a.b.c", "..c"]) {
    assert.equal(check({ VITE_SUPABASE_PUBLISHABLE_KEY: key }).code, "PUBLIC_KEY_INVALID");
  }
  assert.equal(check({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_never_publish", VITE_SUPABASE_ANON_KEY: publicKey }).code, "PUBLIC_KEY_INVALID");
});

test("the Vercel guard exits closed without echoing credentials and leaves the local build separate", () => {
  const script = fileURLToPath(new URL("../scripts/check-release.mjs", import.meta.url));
  const invalid = spawnSync(process.execPath, [script], { env: { ...uatEnv, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_do_not_echo" }, encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /\[release-config:PUBLIC_KEY_INVALID\]/);
  assert.doesNotMatch(invalid.stdout + invalid.stderr, /sb_secret_do_not_echo|sb_publishable_test_browser_key/);
  assert.equal(spawnSync(process.execPath, [script], { env: productionEnv }).status, 1);
  assert.equal(spawnSync(process.execPath, [script], { env: uatEnv }).status, 0);
  const preview = spawnSync(process.execPath, [script], { env: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/change" }, encoding: "utf8" });
  assert.equal(preview.status, 0);
  assert.match(preview.stdout, /NOT_RELEASE_READY/);
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(vercel.buildCommand, /npm run release:build$/);
  assert.match(vercel.buildCommand, /export VITE_SITE_ORIGIN=https:\/\/uat\.letsaimit\.com/);
  assert.doesNotMatch(pkg.scripts.build, /check-release/);
  // The actual pipeline must stop before tests/build when target credentials are unsafe.
  const pipeline = spawnSync("npm", ["run", "--silent", "release:build"], {
    env: { ...process.env, ...uatEnv, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_pipeline_must_not_echo" }, encoding: "utf8",
  });
  assert.equal(pipeline.status, 1);
  assert.match(pipeline.stderr, /release-config:PUBLIC_KEY_INVALID/);
  assert.doesNotMatch(pipeline.stdout + pipeline.stderr, /sb_secret_pipeline_must_not_echo|node --test|vite build|TAP version/);
});
