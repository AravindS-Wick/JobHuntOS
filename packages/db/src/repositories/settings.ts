import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { settings } from '../schema.js';

export function settingsRepo(db: Db) {
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<T> {
      await db.insert(settings)
        .values({ key, value: value as never })
        .onConflictDoUpdate({ target: settings.key, set: { value: value as never, updatedAt: new Date() } });
      return value;
    },
    async remove(key: string): Promise<boolean> {
      const rows = await db.delete(settings).where(eq(settings.key, key)).returning({ key: settings.key });
      return rows.length > 0;
    },
  };
}
export type SettingsRepo = ReturnType<typeof settingsRepo>;
