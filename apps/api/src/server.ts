import { createRepos, closeDb, getDb, createTestDb, pingDb } from '@jobhunt/db';
import { syncRegistry } from '@jobhunt/services';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main() {
  const config = loadConfig();
  let repos;
  let closeEmbeddedDb: (() => Promise<void>) | null = null;

  try {
    const db = getDb(config.DATABASE_URL);
    const reachable = await pingDb(db);
    if (!reachable) throw new Error('Database unreachable');
    repos = createRepos(db);
  } catch (err) {
    // An in-memory fallback in production would silently lose data on restart.
    if (config.NODE_ENV === 'production') throw err;
    console.warn(
      `Database unreachable (${err instanceof Error ? err.message : err}) — starting embedded PGlite. Data is NOT persisted.`,
    );
    const { db, close } = await createTestDb();
    closeEmbeddedDb = close;
    repos = createRepos(db);
    try {
      await syncRegistry(repos, config.REGISTRY_PATH);
      console.log(`Synced target companies from ${config.REGISTRY_PATH} into embedded database.`);
    } catch (e) {
      console.warn('Could not sync registry:', e instanceof Error ? e.message : e);
    }
  }

  const app = await buildApp({ config, repos });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      if (closeEmbeddedDb) {
        await closeEmbeddedDb();
      } else {
        await closeDb();
      }
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  app.log.info(`docs at http://${config.API_HOST}:${config.API_PORT}/docs`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
