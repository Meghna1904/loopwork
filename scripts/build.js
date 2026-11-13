import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const staticFiles = ["index.html", "app.css", "app.js", "base.css", "tokens.css"];

await mkdir(output, { recursive: true });
await Promise.all(staticFiles.map((file) => copyFile(new URL(file, root), new URL(file, output))));

// The pattern engine is imported by app.js, so it has to ship with the build.
const parserSource = new URL("../lib/parser/", import.meta.url);
const parserOutput = new URL("../dist/lib/parser/", import.meta.url);
await mkdir(parserOutput, { recursive: true });
const parserFiles = await readdir(parserSource);
await Promise.all(parserFiles.map((file) => copyFile(new URL(file, parserSource), new URL(file, parserOutput))));

process.stdout.write(
  `Built ${staticFiles.length} static files and ${parserFiles.length} parser modules into ${join(process.cwd(), "dist")}\n`
);
