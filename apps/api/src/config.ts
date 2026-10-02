import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().default('postgres://jobhunt:jobhunt@localhost:5433/jobhunt'),
  /**
   * Single-user today, but the API must never be open on a LAN without a key.
   * Absent in development = auth disabled, with a startup warning.
   */
  API_KEY: z.string().min(16).optional(),
  /** Comma-separated origins the console is served from. */
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  REGISTRY_PATH: z.string().default('config/companies.yaml'),
});

export type Config = z.infer<typeof Env> & { corsOrigins: string[] };

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return {
    ...parsed.data,
    corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
