#!/usr/bin/env node
/** Produce the same checked source as one file for Supabase's browser editor. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

if (!process.argv[2]) throw new Error("Pass an output path outside the repository's published assets.");
const root = new URL("../", import.meta.url);
const files = [
  "supabase/functions/_shared/notification-email.js",
  "supabase/functions/_shared/notification-worker.js",
  "supabase/functions/admin-notifications/index.ts",
];
const relativeImports = [
  'import { buildNewRequestEmail, buildDigestEmail } from "./notification-email.js";',
  'import { createNotificationHandler, validateMailConfiguration } from "../_shared/notification-worker.js";',
];
const parts = [];
for (const file of files) {
  let source = await readFile(new URL(file, root), "utf8");
  for (const line of relativeImports) source = source.replace(line, "");
  // The separately checked JS helpers have untyped optional argument objects.
  // Preserve that typing when embedding them in a TypeScript editor document.
  if (file.endsWith("notification-email.js")) source = source.replace(/\} = \{\}\)/g, "} = {} as any)");
  if (/^import .*from ["']\.{1,2}\//m.test(source)) throw new Error(`Unbundled relative import in ${file}.`);
  parts.push(`// Source: ${file}\n${source}`);
}
const output = resolve(process.argv[2]);
if (/[/\\](?:public|dist)[/\\]/.test(output)) throw new Error("Keep backend source out of public frontend assets.");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `// Generated from the repository sources; contains no credentials.\n${parts.join("\n\n")}`);
process.stdout.write(`Wrote notification function bundle to ${output}\n`);
