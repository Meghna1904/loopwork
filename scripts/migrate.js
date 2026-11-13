import { loadEnv } from "../lib/env.js";
import { ensureSchema, isConfigured } from "../lib/db.js";

await loadEnv();

if (!isConfigured()) {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env and paste your Neon connection string.\n");
  process.exit(1);
}

try {
  await ensureSchema();
  process.stdout.write("Loopwork tables are ready in Neon.\n");
} catch (error) {
  process.stderr.write(`Could not prepare the database: ${error.message}\n`);
  process.exit(1);
}
