import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { CompanyEntry } from '@jobhunt/core';

const Entry = z.object({
  name: z.string(),
  ats: z.enum(['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'unknown']),
  token: z.string(),
  careersUrl: z.string().optional(),
  signal: z.number().min(-5).max(5).optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

const File = z.object({ companies: z.array(Entry) });

export function loadRegistry(path: string): CompanyEntry[] {
  const parsed = File.parse(parse(readFileSync(path, 'utf8')));
  return parsed.companies.filter((c) => c.enabled !== false);
}
