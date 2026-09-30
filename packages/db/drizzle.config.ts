import type { Config } from 'drizzle-kit';
import 'dotenv/config';

export default {
  schema: './packages/db/src/schema.ts',
  out: './packages/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://jobhunt:jobhunt@localhost:5433/jobhunt' },
} satisfies Config;
