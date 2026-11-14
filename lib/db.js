import { neon } from "@neondatabase/serverless";
import { cleanCode, cleanName, sameName, SessionError } from "./session.js";

const SCHEMA_STATEMENTS = [
  `create table if not exists loopwork_users (
    code text primary key,
    name text not null,
    created_at timestamptz not null default now()
  )`,
  `alter table loopwork_projects add column if not exists owner_code text`,
  `create index if not exists loopwork_projects_owner_idx on loopwork_projects (owner_code, sort_index)`,
  `create table if not exists loopwork_projects (
    id text primary key,
    name text not null,
    description text not null default '',
    type text not null default 'custom',
    original_pattern text not null default '',
    rounds jsonb not null default '[]'::jsonb,
    current_round_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    sort_index integer not null default 0
  )`,
  `create index if not exists loopwork_projects_sort_index_idx on loopwork_projects (sort_index)`,
  `create table if not exists loopwork_state (
    key text primary key,
    value jsonb not null default 'null'::jsonb
  )`
];

let client = null;
let schemaReady = null;

function connectionString() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
  return url ? url.trim() : "";
}

export function isConfigured() {
  return Boolean(connectionString());
}

function sqlClient() {
  if (!client) client = neon(connectionString());
  return client;
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = sqlClient();
      for (const statement of SCHEMA_STATEMENTS) {
        await sql.query(statement);
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function serializeProject(project, index) {
  const now = new Date().toISOString();
  return {
    id: String(project.id),
    name: String(project.name ?? "Untitled project"),
    description: project.description ?? "",
    type: project.type ?? "custom",
    original_pattern: project.originalPattern ?? "",
    rounds: Array.isArray(project.rounds) ? project.rounds : [],
    current_round_id: project.currentRoundId ?? null,
    created_at: project.createdAt ?? now,
    updated_at: project.updatedAt ?? now,
    sort_index: index
  };
}

// A sign-in is just "this name with this code". A code nobody has used yet
// starts an account; a code that exists must come back with the same name, so
// a typo cannot quietly open someone else's projects.
export async function openSession(rawName, rawCode) {
  const name = cleanName(rawName);
  const code = cleanCode(rawCode);
  const sql = sqlClient();

  const existing = await sql.query(`select name from loopwork_users where code = $1`, [code]);
  if (existing.length) {
    const stored = String(existing[0].name || "");
    if (!sameName(stored, name)) {
      throw new SessionError("That code is already used with a different name.", 409);
    }
    return { name: stored, code };
  }

  try {
    await sql.query(`insert into loopwork_users (code, name) values ($1, $2)`, [code, name]);
  } catch (error) {
    // Two devices signing in at once: the other one won, so read it back.
    if (/duplicate key|unique/i.test(error.message)) return openSession(name, code);
    throw error;
  }
  // Projects saved before sign-in existed have no owner. The first code to
  // sign in takes them, so nothing written earlier is lost.
  await sql.query(`update loopwork_projects set owner_code = $1 where owner_code is null`, [code]);
  return { name, code };
}

export async function userExists(code) {
  const rows = await sqlClient().query(`select 1 from loopwork_users where code = $1`, [code]);
  return rows.length > 0;
}

export async function readProjects(code) {
  const sql = sqlClient();
  const rows = await sql.query(
    `select
       coalesce((
         select jsonb_agg(jsonb_build_object(
           'id', p.id,
           'name', p.name,
           'description', p.description,
           'type', p.type,
           'originalPattern', p.original_pattern,
           'rounds', p.rounds,
           'currentRoundId', p.current_round_id,
           'createdAt', p.created_at,
           'updatedAt', p.updated_at
         ) order by p.sort_index, p.created_at)
         from loopwork_projects p
         where p.owner_code = $1
       ), '[]'::jsonb) as projects,
       exists(select 1 from loopwork_state where key = 'loopwork-initialized') as initialized`,
    [code]
  );
  const row = rows[0] || {};
  return {
    projects: Array.isArray(row.projects) ? row.projects : [],
    initialized: Boolean(row.initialized)
  };
}

export async function replaceProjects(projects, code) {
  const sql = sqlClient();
  const payload = JSON.stringify(projects.map(serializeProject));
  await sql.query(
    `with incoming as (
       select * from jsonb_to_recordset($1::jsonb) as item(
         id text,
         name text,
         description text,
         type text,
         original_pattern text,
         rounds jsonb,
         current_round_id text,
         created_at timestamptz,
         updated_at timestamptz,
         sort_index integer
       )
     ), upserted as (
       insert into loopwork_projects (id, name, description, type, original_pattern, rounds, current_round_id, created_at, updated_at, sort_index, owner_code)
       select
         id,
         coalesce(name, 'Untitled project'),
         coalesce(description, ''),
         coalesce(type, 'custom'),
         coalesce(original_pattern, ''),
         coalesce(rounds, '[]'::jsonb),
         current_round_id,
         coalesce(created_at, now()),
         coalesce(updated_at, now()),
         coalesce(sort_index, 0),
         $2
       from incoming
       on conflict (id) do update set
         name = excluded.name,
         description = excluded.description,
         type = excluded.type,
         original_pattern = excluded.original_pattern,
         rounds = excluded.rounds,
         current_round_id = excluded.current_round_id,
         updated_at = excluded.updated_at,
         sort_index = excluded.sort_index,
         owner_code = excluded.owner_code
       returning id
     )
     delete from loopwork_projects p
     where p.owner_code = $2
       and not exists (select 1 from incoming i where i.id = p.id)`,
    [payload, code]
  );
  await sql.query(
    `insert into loopwork_state (key, value) values ('loopwork-initialized', 'true'::jsonb)
     on conflict (key) do update set value = excluded.value`
  );
}
