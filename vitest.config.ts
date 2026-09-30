import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
    // PGlite boots a real Postgres in WASM — several seconds per suite.
    // Worth it: repositories are tested against genuine Postgres semantics.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@jobhunt/core': r('./packages/core/src/index.ts'),
      '@jobhunt/connectors': r('./packages/connectors/src/index.ts'),
      '@jobhunt/db': r('./packages/db/src/index.ts'),
      '@jobhunt/services': r('./packages/services/src/index.ts'),
      '@jobhunt/contracts': r('./packages/contracts/src/index.ts'),
      '@jobhunt/api-client': r('./packages/api-client/src/index.ts'),
    },
  },
});
