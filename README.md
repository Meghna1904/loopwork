# Loopwork

A laptop-first crochet pattern companion prototype. It parses common round instructions, lets you review and edit them, and tracks progress by operation or output stitch. Projects can be deleted from the sidebar after a confirmation step.

Projects and progress are stored in a [Neon](https://neon.com) Postgres database. The browser keeps a local copy so the app still opens and works when the database is unreachable.

## Run locally

Requires Node.js 20 or newer.

```powershell
npm install
```

Create a `.env` file (already listed in `.gitignore`) with your Neon connection string, copied from **Connect** in the Neon console:

```
DATABASE_URL="postgresql://user:password@ep-…-pooler.…neon.tech/neondb?sslmode=require"
```

Then create the tables and start the app:

```powershell
npm run db:push
npm run dev
```

Open <http://127.0.0.1:4173>. Without `DATABASE_URL`, the app still runs and keeps projects in browser storage only.

The first open of an empty database starts with an editable sample project.

## Deploying to Vercel

Add `DATABASE_URL` under **Project → Settings → Environment Variables**, then redeploy. Static files are built into `dist`, and `/api/projects` is served by the serverless function in `api/projects.js`, which uses the same code as the local server.

Run `npm run db:push` once against that database (or let the first request create the tables — they are created automatically).

## Data model

Both tables are created by `lib/db.js`:

- `loopwork_projects` — one row per project: name, description, type, the original pattern text, the parsed rounds (`jsonb`), the current round, timestamps and a sort index.
- `loopwork_state` — small key/value table; `loopwork-initialized` records that the app has written a project list, so an emptied project list stays empty instead of being refilled with the sample.

## API

- `GET /api/projects` → `{ projects: [...], initialized: boolean }`
- `PUT /api/projects` with `{ projects: [...] }` → replaces the stored list (rows missing from the payload are deleted)
