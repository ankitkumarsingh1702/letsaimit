#!/usr/bin/env node
/** Refresh only reviewed public content fingerprints after a committed build. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { utcTimestamp, validateRoutePath } from './discovery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--manifest')) {
  throw new Error('Usage: node scripts/discovery-baseline.mjs [--manifest dist/discovery-manifest.json]');
}
const filename = resolve(root, args[1] ?? 'dist/discovery-manifest.json');
const manifest = JSON.parse(await readFile(filename, 'utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.pages) || !manifest.pages.length) throw new Error('Build the public discovery manifest before refreshing its baseline.');
const seen = new Set();
const pages = manifest.pages.map(page => {
  validateRoutePath(page.path);
  if (seen.has(page.path) || !/^[a-f0-9]{64}$/.test(page.contentHash)) throw new Error('Invalid public content fingerprint.');
  seen.add(page.path);
  return { path: page.path, contentHash: page.contentHash, lastmod: utcTimestamp(page.lastmod) };
}).sort((a, b) => a.path.localeCompare(b.path, 'en'));
const output = resolve(root, 'deployment/discovery-baseline.json');
const next = JSON.stringify({ schemaVersion: 1, pages }, null, 2) + '\n';
let previous = '';
try { previous = await readFile(output, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (next !== previous) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, next);
  console.log(`Updated reviewed discovery baseline for ${pages.length} public pages.`);
} else {
  console.log('Public content baseline is unchanged.');
}
