import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseResumeText, tailorResume } from '@jobhunt/core';
import { atsCheck, extractResumeText, renderDocx, renderHtml, renderPdf } from './index.js';

const master = parseResumeText(readFileSync(resolve(__dirname, '../../../fixtures/resume.sample.txt'), 'utf8'));
const tailored = tailorResume(master, { title: 'Frontend Engineer', company: 'Acme', descriptionText: 'React TypeScript' }).doc;

describe('documents', () => {
  it('renders a DOCX that round-trips to the same text', async () => {
    const docx = await renderDocx(tailored);
    expect(docx.subarray(0, 2).toString()).toBe('PK'); // zip container
    const text = await extractResumeText('r.docx', docx);
    expect(text).toContain('Sample Candidate');
    expect(text).toContain(tailored.experience[0]!.bullets[0]!);
    // Re-parsing the generated file gives the same structure back (ATS readability).
    const again = parseResumeText(text);
    expect(again.experience.map((r) => r.company)).toEqual(['Example Corp', 'Demo Labs']);
  });

  it('renders single-column HTML with no tables', () => {
    const html = renderHtml(tailored);
    expect(html).not.toMatch(/<table/i);
    expect(html).toContain('<h2>Experience</h2>');
  });

  it('renders a PDF whose text an ATS can extract', async () => {
    const pdf = await renderPdf(tailored);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const text = await extractResumeText('r.pdf', new Uint8Array(pdf));
    expect(text).toContain('Sample Candidate');
    expect(text.replace(/\s+/g, ' ')).toContain('Example Corp');
  }, 30_000);

  it('flags ATS problems', () => {
    expect(atsCheck(tailored)).toEqual({ ok: true, issues: [] });
    expect(atsCheck({ ...tailored, contact: { links: [] } }).issues).toEqual(['missing email', 'missing phone']);
  });
});
