import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/**
 * Where uploads and generated documents live. Paths stored in the database
 * are relative to this directory so the data folder can move.
 */
export function dataDir(): string {
  return resolve(process.env.JOBHUNT_DATA_DIR ?? '.data');
}

export function absPath(rel: string): string {
  return isAbsolute(rel) ? rel : join(dataDir(), rel);
}

export async function saveFile(rel: string, data: Uint8Array | string): Promise<string> {
  const abs = absPath(rel);
  if (relative(dataDir(), abs).startsWith('..')) throw new Error(`refusing to write outside the data dir: ${rel}`);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return rel;
}

export async function loadFile(rel: string): Promise<Buffer> {
  return readFile(absPath(rel));
}

/** "Sample Candidate", "Acme Inc." → "Sample_Candidate_Acme_Inc" — what recruiters see as the file name. */
export function documentName(person: string, company: string): string {
  return `${person} ${company}`.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'Resume';
}
