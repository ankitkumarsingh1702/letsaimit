#!/usr/bin/env node
/** Check the bundled media, fonts and licenses against the published snapshot. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(projectRoot, 'docs/ASSET-MANIFEST.json');

async function verifyAssets() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('Unsupported or invalid asset manifest.');
  }
  if (manifest.file_count !== manifest.files.length) {
    throw new Error('The manifest file count does not match its entries.');
  }

  const failures = [];
  const seenPaths = new Set();
  let verifiedCount = 0;
  let verifiedBytes = 0;
  let expectedBytes = 0;

  for (const entry of manifest.files) {
    if (
      typeof entry.path !== 'string' ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
      typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      failures.push('Invalid manifest entry.');
      continue;
    }

    expectedBytes += entry.bytes;
    const absolutePath = resolve(projectRoot, entry.path);
    const projectRelativePath = relative(projectRoot, absolutePath);
    if (
      isAbsolute(entry.path) || isAbsolute(projectRelativePath) ||
      projectRelativePath === '..' || projectRelativePath.startsWith(`..${sep}`) ||
      seenPaths.has(absolutePath)
    ) {
      failures.push(`${entry.path}: unsafe or duplicate path.`);
      continue;
    }
    seenPaths.add(absolutePath);

    try {
      const bytes = await readFile(absolutePath);
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== entry.bytes || hash !== entry.sha256) {
        failures.push(`${entry.path}: content differs from the published snapshot.`);
      } else {
        verifiedCount += 1;
        verifiedBytes += bytes.length;
      }
    } catch (error) {
      failures.push(`${entry.path}: ${error.code === 'ENOENT' ? 'file is missing' : 'cannot read file'}.`);
    }
  }

  if (expectedBytes !== manifest.total_bytes) {
    failures.push('The manifest total byte count does not match its entries.');
  }
  if (failures.length) {
    console.error(`Asset verification failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Verified ${verifiedCount} assets (${verifiedBytes.toLocaleString('en-US')} bytes).`);
  console.log('Every listed image, video, font and source/license file matches the published snapshot.');
}

verifyAssets().catch((error) => {
  console.error(`Asset verification could not run: ${error.message}`);
  process.exitCode = 1;
});
