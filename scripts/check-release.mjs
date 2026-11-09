import { readFile } from "node:fs/promises";
import { validateReleaseConfig } from "./releaseConfig.js";

try {
  const targets = JSON.parse(await readFile(new URL("../deployment/release-targets.json", import.meta.url), "utf8"));
  const result = validateReleaseConfig(process.env, targets);
  const output = `[release-config:${result.code}] ${result.message}`;
  if (result.ok) console.log(output);
  else { console.error(output); process.exitCode = 1; }
} catch {
  console.error("[release-config:MANIFEST_INVALID] Release-target configuration could not be read or validated.");
  process.exitCode = 1;
}
