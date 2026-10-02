import { extname } from 'node:path';

/** Pull plain text out of an uploaded resume. PDF and DOCX cover nearly every resume. */
export async function extractResumeText(fileName: string, data: Uint8Array): Promise<string> {
  const ext = extname(fileName).toLowerCase();
  if (ext === '.pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join('\n');
  }
  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return value;
  }
  if (ext === '.txt' || ext === '.md') return new TextDecoder().decode(data);
  throw new Error(`Unsupported resume format "${ext}". Upload a PDF, DOCX or TXT.`);
}
