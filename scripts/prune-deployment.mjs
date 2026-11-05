#!/usr/bin/env node
// Keep source originals in public/, but ship only their responsive replacements.
import { readFile, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("src/data/media-manifest.json", root), "utf8"));
const dist = new URL("dist/", root);
async function documents(folder) {
  const result = [];
  for (const entry of await readdir(folder, {withFileTypes:true})) {
    const file = new URL(entry.name + (entry.isDirectory() ? "/" : ""), folder);
    if (entry.isDirectory()) result.push(...await documents(file));
    else if (/\.(html|css)$/.test(entry.name)) result.push(await readFile(file, "utf8"));
  }
  return result;
}
const htmlAndCss = (await documents(dist)).join("\n");
let count=0, bytes=0;
for (const name of [...Object.keys(manifest.images), ...Object.keys(manifest.videos)]) {
  if (name.includes("..") || name.startsWith("/")) throw new Error("Unsafe media path in manifest.");
  const url = `/assets/${name}`;
  if (htmlAndCss.includes(url + '"') || htmlAndCss.includes(url + "'") || htmlAndCss.includes(url + " ")) throw new Error(`Original is still referenced in output: ${name}`);
  const file = new URL(`assets/${name}`, dist);
  try { bytes += (await readFile(file)).length; await unlink(file); count++; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
console.log(`Excluded ${count} superseded originals (${bytes.toLocaleString()} bytes) from dist; public/ retains them.`);
