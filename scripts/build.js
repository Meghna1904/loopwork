import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const staticFiles = [
  "index.html", "app.css", "app.js", "guide.js", "base.css", "tokens.css",
  "favicon.svg", "favicon-32.png", "apple-touch-icon.png"
];

// Start clean every time: a leftover file from an older build layout used to
// keep shipping, and a stale module at a stale path hides a broken one.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(staticFiles.map((file) => copyFile(new URL(file, root), new URL(file, output))));

// Everything under lib/ is imported by the browser bundle: the pattern engine,
// the terminology registry and the guide content. Copy the tree as it is so a
// new module never has to be registered in two places.
async function copyTree(fromUrl, toUrl) {
  await mkdir(toUrl, { recursive: true });
  for (const item of await readdir(fromUrl, { withFileTypes: true })) {
    const source = new URL(item.name, fromUrl);
    const target = new URL(item.name, toUrl);
    // Both sides need the trailing slash, or URL resolution treats the
    // directory as a file and writes its children one level too high.
    if (item.isDirectory()) await copyTree(new URL(`${item.name}/`, fromUrl), new URL(`${item.name}/`, toUrl));
    else await copyFile(source, target);
  }
}

await copyTree(new URL("lib/", root), new URL("lib/", output));

let copied = 0;
async function countFiles(directoryUrl) {
  for (const item of await readdir(directoryUrl, { withFileTypes: true })) {
    if (item.isDirectory()) await countFiles(new URL(`${item.name}/`, directoryUrl));
    else copied += 1;
  }
}
await countFiles(new URL("lib/", output));

process.stdout.write(
  `Built ${staticFiles.length} static files and ${copied} library modules into ${join(process.cwd(), "dist")}\n`
);
