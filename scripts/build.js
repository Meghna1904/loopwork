import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const staticFiles = ["index.html", "app.css", "app.js", "base.css", "tokens.css"];

await mkdir(output, { recursive: true });
await Promise.all(staticFiles.map((file) => copyFile(new URL(file, root), new URL(file, output))));
process.stdout.write(`Built ${staticFiles.length} static files into ${join(process.cwd(), "dist")}\n`);
