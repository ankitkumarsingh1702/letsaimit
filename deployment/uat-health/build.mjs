import { mkdir, writeFile } from "node:fs/promises";

await mkdir(new URL("./public/", import.meta.url), { recursive: true });
await writeFile(new URL("./public/index.html", import.meta.url), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LetsAimIt UAT health service</title>
  </head>
  <body><p>LetsAimIt UAT health service</p></body>
</html>
`);
