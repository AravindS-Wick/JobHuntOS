import { existsSync } from 'node:fs';
import { loadRegistry } from '@jobhunt/connectors';
import type { Repos } from '@jobhunt/db';

/**
 * One-way sync from config/companies.yaml into the database. The YAML stays the
 * editable source you keep in git; the DB is what the API and UI read.
 */
export async function syncRegistry(repos: Repos, path: string): Promise<{ synced: number }> {
  if (!existsSync(path)) throw new Error(`registry file not found: ${path}`);
  const entries = loadRegistry(path);
  for (const e of entries) await repos.companies.upsert(e);
  await repos.events.record({
    entityType: 'companies', action: 'registry_synced', actor: 'system',
    payload: { path, count: entries.length },
  });
  return { synced: entries.length };
}
