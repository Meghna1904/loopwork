import { ensureSchema, isConfigured, readProjects, replaceProjects } from "./db.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  // Vercel pre-parses JSON bodies; local node:http hands us the raw stream.
  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};
    if (typeof request.body === "object") return request.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body is too large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function handleProjectsRequest(request, response) {
  if (!isConfigured()) {
    sendJson(response, 503, {
      error: "database-not-configured",
      message: "Set DATABASE_URL to your Neon connection string."
    });
    return;
  }

  try {
    await ensureSchema();

    if (request.method === "GET" || request.method === "HEAD") {
      sendJson(response, 200, await readProjects());
      return;
    }

    if (request.method === "PUT" || request.method === "POST") {
      const body = await readJsonBody(request);
      if (!Array.isArray(body.projects)) {
        sendJson(response, 400, { error: "invalid-payload", message: "Expected a projects array." });
        return;
      }
      await replaceProjects(body.projects);
      sendJson(response, 200, { saved: true, count: body.projects.length });
      return;
    }

    response.writeHead(405, { Allow: "GET, PUT", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
  } catch (error) {
    const status = error.statusCode || 500;
    process.stderr.write(`[loopwork] projects API error: ${error.message}\n`);
    sendJson(response, status, { error: status === 413 ? "payload-too-large" : "database-error" });
  }
}
