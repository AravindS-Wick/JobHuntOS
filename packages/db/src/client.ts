import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../migrations');

/**
 * Deliberately the abstract Drizzle base rather than the postgres-js concrete
 * type, so the same repositories work against postgres-js in production and
 * PGlite (embedded WASM Postgres) in local dev and tests. Real Postgres semantics either way.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let _db: Db | null = null;
let _sql: ReturnType<typeof postgres> | null = null;
let _pglite: PGlite | null = null;
let _ready: Promise<void> = Promise.resolve();

/** Resolves once an embedded database has its migrations applied. Await before serving. */
export function dbReady(): Promise<void> {
  return _ready;
}

async function applyMigrationsToPglite(client: PGlite) {
  if (!existsSync(MIGRATIONS_DIR)) return;
  await client.exec(`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
      name text PRIMARY KEY,
      applied_at timestamp DEFAULT now()
    );
  `);

  const applied = await client.query<{ name: string }>('SELECT name FROM _applied_migrations');
  const appliedSet = new Set(applied.rows.map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed) await client.exec(trimmed);
    }
    await client.exec(`INSERT INTO _applied_migrations (name) VALUES ('${file}') ON CONFLICT DO NOTHING;`);
  }
}

export function getDb(url = process.env.DATABASE_URL): Db {
  if (_db) return _db;

  if (url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    _sql = postgres(url, { max: 10, onnotice: () => {} });
    _db = drizzlePg(_sql, { schema });
    return _db;
  }

  // Zero-dependency embedded PGlite fallback
  // `DATABASE_URL=pglite` (or unset): persistent embedded Postgres, no Docker needed.
  const dataDir = resolve(process.env.JOBHUNT_DATA_DIR ?? '.data', 'pglite');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  _pglite = new PGlite(dataDir);
  _db = drizzlePglite(_pglite, { schema }) as unknown as Db;
  _ready = applyMigrationsToPglite(_pglite);

  return _db;
}

export async function closeDb(): Promise<void> {
  await _sql?.end({ timeout: 5 });
  await _pglite?.close();
  _sql = null;
  _pglite = null;
  _db = null;
}

/** Used by the API's readiness probe. */
export async function pingDb(db: Db): Promise<boolean> {
  try {
    await db.execute('select 1');
    return true;
  } catch {
    return false;
  }
}
