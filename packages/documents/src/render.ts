import {
  AlignmentType, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun,
} from 'docx';
import type { ResumeDoc } from '@jobhunt/core';

/**
 * ATS-safe layout (PRD C8): single column, no tables, no text in headers or
 * footers, standard section headings, plain bullets. The same content renders
 * to DOCX (what most ATS parse best) and PDF (what humans read).
 */

const dates = (start?: string, end?: string) => [start, end].filter(Boolean).join(' – ');

function contactLine(doc: ResumeDoc): string[] {
  return [doc.contact.location, doc.contact.phone, doc.contact.email, ...doc.contact.links].filter((x): x is string => Boolean(x));
}

export async function renderDocx(doc: ResumeDoc): Promise<Buffer> {
  const heading = (text: string) => new Paragraph({ text: text.toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 } });
  const bullet = (text: string) => new Paragraph({ text, numbering: { reference: 'bullets', level: 0 } });
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: doc.name, bold: true, size: 32 })], alignment: AlignmentType.LEFT }),
  ];
  if (doc.headline) children.push(new Paragraph({ children: [new TextRun({ text: doc.headline, size: 22 })] }));
  const contact = contactLine(doc);
  if (contact.length) {
    children.push(new Paragraph({
      children: contact.flatMap((c, i) => {
        const sep = i > 0 ? [new TextRun({ text: ' | ', size: 20 })] : [];
        const isLink = /^(https?:\/\/|www\.|[\w-]+\.(com|dev|io|in|me)\/)/.test(c) && !c.includes('@');
        return [
          ...sep,
          isLink
            ? new ExternalHyperlink({ link: c.startsWith('http') ? c : `https://${c}`, children: [new TextRun({ text: c, size: 20, style: 'Hyperlink' })] })
            : new TextRun({ text: c, size: 20 }),
        ];
      }),
    }));
  }

  if (doc.summary) children.push(heading('Summary'), new Paragraph({ text: doc.summary }));

  if (doc.skills.length) {
    children.push(heading('Skills'));
    for (const g of doc.skills) {
      children.push(new Paragraph({
        children: [
          ...(g.group ? [new TextRun({ text: `${g.group}: `, bold: true })] : []),
          new TextRun({ text: g.items.join(', ') }),
        ],
      }));
    }
  }

  if (doc.experience.length) {
    children.push(heading('Experience'));
    for (const r of doc.experience) {
      children.push(new Paragraph({
        spacing: { before: 120 },
        children: [
          new TextRun({ text: r.title, bold: true }),
          new TextRun({ text: r.company ? ` | ${r.company}` : '' }),
          new TextRun({ text: r.location ? ` | ${r.location}` : '' }),
          new TextRun({ text: dates(r.start, r.end) ? ` | ${dates(r.start, r.end)}` : '', italics: true }),
        ],
      }));
      for (const b of r.bullets) children.push(bullet(b));
    }
  }

  if (doc.projects.length) {
    children.push(heading('Projects'));
    for (const p of doc.projects) {
      children.push(new Paragraph({
        spacing: { before: 80 },
        children: [new TextRun({ text: p.name, bold: true }), new TextRun({ text: p.tech.length ? ` (${p.tech.join(', ')})` : '' })],
      }));
      for (const b of p.bullets) children.push(bullet(b));
    }
  }

  if (doc.education.length) {
    children.push(heading('Education'));
    for (const e of doc.education) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: e.institution, bold: true }),
          new TextRun({ text: e.degree ? ` | ${e.degree}` : '' }),
          new TextRun({ text: dates(e.start, e.end) ? ` | ${dates(e.start, e.end)}` : '' }),
        ],
      }));
    }
  }

  if (doc.certifications.length) {
    children.push(heading('Certifications'));
    for (const c of doc.certifications) children.push(bullet(c));
  }

  const file = new Document({
    creator: doc.name,
    title: `${doc.name} — Resume`,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }],
      }],
    },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 820, right: 820 } } }, children }],
  });
  return Packer.toBuffer(file);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Semantic single-column HTML; the PDF is printed from this. */
export function renderHtml(doc: ResumeDoc): string {
  const section = (title: string, body: string) => (body ? `<h2>${title}</h2>${body}` : '');
  const ul = (items: string[]) => (items.length ? `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.name)} — Resume</title><style>
  @page { size: A4; margin: 14mm 16mm; }
  body { font-family: Calibri, Carlito, 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.35; }
  h1 { font-size: 18pt; margin: 0; } .headline { font-size: 11pt; margin: 2px 0; }
  .contact { font-size: 9.5pt; color: #333; margin-bottom: 6px; }
  h2 { font-size: 10.5pt; letter-spacing: .06em; text-transform: uppercase; border-bottom: 1px solid #999; margin: 12px 0 4px; padding-bottom: 2px; }
  .role { margin-top: 6px; } .role b { font-weight: 700; } .muted { color: #444; }
  ul { margin: 2px 0 4px 16px; padding: 0; } li { margin: 1px 0; } p { margin: 2px 0; }
  </style></head><body>
  <h1>${esc(doc.name)}</h1>
  ${doc.headline ? `<p class="headline">${esc(doc.headline)}</p>` : ''}
  <p class="contact">${contactLine(doc).map(esc).join(' | ')}</p>
  ${section('Summary', doc.summary ? `<p>${esc(doc.summary)}</p>` : '')}
  ${section('Skills', doc.skills.map((g) => `<p>${g.group ? `<b>${esc(g.group)}:</b> ` : ''}${esc(g.items.join(', '))}</p>`).join(''))}
  ${section('Experience', doc.experience.map((r) => `<div class="role"><b>${esc(r.title)}</b>${r.company ? ` | ${esc(r.company)}` : ''}${r.location ? ` | ${esc(r.location)}` : ''}<span class="muted">${dates(r.start, r.end) ? ` | ${esc(dates(r.start, r.end))}` : ''}</span>${ul(r.bullets)}</div>`).join(''))}
  ${section('Projects', doc.projects.map((p) => `<div class="role"><b>${esc(p.name)}</b>${p.tech.length ? ` (${esc(p.tech.join(', '))})` : ''}${ul(p.bullets)}</div>`).join(''))}
  ${section('Education', doc.education.map((e) => `<p><b>${esc(e.institution)}</b>${e.degree ? ` | ${esc(e.degree)}` : ''}${dates(e.start, e.end) ? ` | ${esc(dates(e.start, e.end))}` : ''}</p>`).join(''))}
  ${section('Certifications', ul(doc.certifications))}
  </body></html>`;
}

/**
 * Print the HTML to PDF with headless Chrome. Uses the installed Google
 * Chrome (channel "chrome") so no separate browser download is needed.
 */
export async function renderPdf(doc: ResumeDoc): Promise<Buffer> {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: process.env.JOBHUNT_PDF_CHANNEL ?? 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(renderHtml(doc), { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: false, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

/** Text the ATS will see: used to check the rendered file round-trips cleanly. */
export function atsCheck(doc: ResumeDoc): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!doc.name) issues.push('missing name');
  if (!doc.contact.email) issues.push('missing email');
  if (!doc.contact.phone) issues.push('missing phone');
  if (!doc.experience.length) issues.push('no experience section');
  if (doc.experience.some((r) => !r.start)) issues.push('a role has no start date (ATS date parsing)');
  const long = doc.experience.flatMap((r) => r.bullets).find((b) => b.length > 300);
  if (long) issues.push(`bullet over 300 characters: "${long.slice(0, 50)}…"`);
  return { ok: issues.length === 0, issues };
}
