import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { fromJsonResume, parseResumeText, type ResumeDoc } from '@jobhunt/core';
import { extractResumeText } from '@jobhunt/documents';
import type { Repos, ResumeRow } from '@jobhunt/db';
import { saveFile } from './storage.js';

export interface ResumeImport {
  fileName: string;
  data: Uint8Array;
  label?: string;
  /** Make this the master resume (default: true when none exists yet). */
  makeMaster?: boolean;
}

/** Fields the user must confirm before the resume can drive applications. */
export function resumeReadiness(doc: ResumeDoc): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!doc.name) missing.push('name');
  if (!doc.contact.email) missing.push('email');
  if (!doc.contact.phone) missing.push('phone');
  if (!doc.experience.length) missing.push('experience');
  if (!doc.skills.length) missing.push('skills');
  return { ready: missing.length === 0, missing };
}

export function resumeService(repos: Repos) {
  return {
    async import(input: ResumeImport): Promise<ResumeRow> {
      const ext = extname(input.fileName).toLowerCase();
      let rawText: string;
      let doc: ResumeDoc;
      if (ext === '.json') {
        rawText = new TextDecoder().decode(input.data);
        doc = fromJsonResume(JSON.parse(rawText));
      } else {
        rawText = await extractResumeText(input.fileName, input.data);
        doc = parseResumeText(rawText);
      }
      const filePath = await saveFile(`resumes/${randomUUID()}${ext}`, input.data);
      const hasMaster = Boolean(await repos.resumes.master());
      const row = await repos.resumes.create({
        label: input.label ?? input.fileName,
        fileName: input.fileName,
        mimeType: ext === '.pdf' ? 'application/pdf' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain',
        filePath,
        rawText,
        doc,
        isMaster: false,
      });
      const master = input.makeMaster ?? !hasMaster;
      const result = master ? (await repos.resumes.setMaster(row.id))! : row;
      await repos.events.record({
        entityType: 'resume', entityId: row.id, action: 'imported', actor: 'user',
        payload: { fileName: input.fileName, master, roles: doc.experience.length, skills: doc.skills.flatMap((g) => g.items).length },
      });
      return result;
    },

    /** The user corrects the parsed structure; that corrected doc becomes the truth source. */
    async updateDoc(id: string, doc: ResumeDoc): Promise<ResumeRow | undefined> {
      const row = await repos.resumes.updateDoc(id, doc);
      if (row) await repos.events.record({ entityType: 'resume', entityId: id, action: 'doc_updated', actor: 'user' });
      return row;
    },

    async setMaster(id: string) {
      const row = await repos.resumes.setMaster(id);
      if (row) await repos.events.record({ entityType: 'resume', entityId: id, action: 'set_master', actor: 'user' });
      return row;
    },

    async master(): Promise<{ row: ResumeRow; doc: ResumeDoc } | undefined> {
      const row = await repos.resumes.master();
      return row ? { row, doc: row.doc as ResumeDoc } : undefined;
    },
  };
}
export type ResumeService = ReturnType<typeof resumeService>;
