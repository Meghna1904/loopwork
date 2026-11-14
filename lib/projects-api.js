import { ensureSchema, isConfigured, openSession, readProjects, replaceProjects, userExists } from "./db.js";
import { cleanCode, SessionError } from "./session.js";

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

function databaseMissing(response) {
  sendJson(response, 503, {
    error: "database-not-configured",
    message: "Set DATABASE_URL to your Neon connection string."
  });
}

function logError(scope, error) {
  process.stderr.write(`[loopwork] ${scope} API error: ${error.message}\n`);
}

export async function handleSessionRequest(request, response) {
  if (!isConfigured()) {
    databaseMissing(response);
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405, { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  try {
    await ensureSchema();
    const body = await readJsonBody(request);
    const session = await openSession(body.name, body.code);
    sendJson(response, 200, session);
  } catch (error) {
    if (error instanceof SessionError) {
      sendJson(response, error.statusCode, { error: "invalid-session", message: error.message });
      return;
    }
    logError("session", error);
    sendJson(response, error.statusCode || 500, { error: "database-error" });
  }
}

// Every project request carries the code the browser signed in with.
function requestCode(request) {
  const value = request.headers?.["x-loopwork-code"];
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? "");
}

export async function handleProjectsRequest(request, response) {
  if (!isConfigured()) {
    databaseMissing(response);
    return;
  }

  try {
    await ensureSchema();

    let code;
    try {
      code = cleanCode(requestCode(request));
    } catch {
      sendJson(response, 401, { error: "signed-out", message: "Sign in with your name and code." });
      return;
    }
    if (!(await userExists(code))) {
      sendJson(response, 401, { error: "signed-out", message: "That code is not signed in on this device." });
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      sendJson(response, 200, await readProjects(code));
      return;
    }

    if (request.method === "PUT" || request.method === "POST") {
      const body = await readJsonBody(request);
      if (!Array.isArray(body.projects)) {
        sendJson(response, 400, { error: "invalid-payload", message: "Expected a projects array." });
        return;
      }
      await replaceProjects(body.projects, code);
      sendJson(response, 200, { saved: true, count: body.projects.length });
      return;
    }

    response.writeHead(405, { Allow: "GET, PUT", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
  } catch (error) {
    const status = error.statusCode || 500;
    logError("projects", error);
    sendJson(response, status, { error: status === 413 ? "payload-too-large" : "database-error" });
  }
}
