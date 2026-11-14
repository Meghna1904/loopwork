import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/env.js";
import { isConfigured } from "./lib/db.js";
import { handleProjectsRequest, handleSessionRequest } from "./lib/projects-api.js";

await loadEnv();

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);

  if (pathname === "/api/projects") {
    await handleProjectsRequest(request, response);
    return;
  }

  if (pathname === "/api/session") {
    await handleSessionRequest(request, response);
    return;
  }

  const relative = normalize(pathname === "/" ? "index.html" : pathname.slice(1));
  const filePath = join(root, relative);
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      // Local development must never serve a stale app.js after an edit.
      "Cache-Control": "no-cache"
    });
    response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Loopwork is running at http://127.0.0.1:${port}\n`);
  if (!isConfigured()) {
    process.stdout.write("DATABASE_URL is not set, so projects stay in this browser only.\n");
  }
});
