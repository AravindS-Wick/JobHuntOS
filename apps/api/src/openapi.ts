import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createTestDb, createRepos } from '@jobhunt/db';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

/**
 * Emit openapi.json without needing a database or a listening server, so the
 * UI can regenerate its client in CI.
 *   pnpm --filter @jobhunt/api openapi
 */
async function main() {
  const { db, close } = await createTestDb();
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: 'postgres://unused' });
  const app = await buildApp({ config, repos: createRepos(db) });
  await app.ready();

  const out = resolve(process.cwd(), 'openapi.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(app.swagger(), null, 2));
  console.log(`wrote ${out}`);

  await app.close();
  await close();
}

main().catch((err) => { console.error(err); process.exit(1); });
