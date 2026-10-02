/**
 * Structured resume. The master resume is the only source of truth for
 * tailoring: a tailored variant may reorder and select from it, never add.
 */
export interface ResumeContact {
  email?: string;
  phone?: string;
  location?: string;
  links: string[];
}

export interface ResumeRole {
  company: string;
  title: string;
  location?: string;
  start?: string;
  end?: string;
  bullets: string[];
}

export interface ResumeProject {
  name: string;
  tech: string[];
  bullets: string[];
  link?: string;
}

export interface ResumeEducation {
  institution: string;
  degree?: string;
  start?: string;
  end?: string;
  details?: string;
}

export interface ResumeDoc {
  name: string;
  headline?: string;
  contact: ResumeContact;
  summary?: string;
  /** Grouped skills, e.g. { group: 'Frontend', items: ['React', 'TypeScript'] }. */
  skills: { group?: string; items: string[] }[];
  experience: ResumeRole[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  certifications: string[];
}

export const emptyResume = (): ResumeDoc => ({
  name: '', contact: { links: [] }, skills: [], experience: [], projects: [], education: [], certifications: [],
});

export function allSkills(doc: ResumeDoc): string[] {
  return doc.skills.flatMap((g) => g.items);
}

/** Every line of text in the resume, for "was this in the master?" checks. */
export function resumeText(doc: ResumeDoc): string {
  return [
    doc.name, doc.headline, doc.summary,
    ...allSkills(doc),
    ...doc.experience.flatMap((r) => [r.company, r.title, ...r.bullets]),
    ...doc.projects.flatMap((p) => [p.name, ...p.tech, ...p.bullets]),
    ...doc.education.flatMap((e) => [e.institution, e.degree, e.details]),
    ...doc.certifications,
  ].filter(Boolean).join('\n');
}

// ------------------------------------------------------------- parsing ----

const SECTION_RE: [keyof Omit<ResumeDoc, 'name' | 'contact' | 'headline'> | 'ignore', RegExp][] = [
  ['summary', /^(professional\s+)?(summary|profile|objective|about( me)?)$/i],
  ['skills', /^(technical\s+|core\s+|key\s+)?(skills|competencies|technologies|tech stack|tools)(\s*&\s*\w+)?$/i],
  ['experience', /^(professional\s+|work\s+)?(experience|employment|work history|career history)$/i],
  ['projects', /^(personal\s+|key\s+|selected\s+)?projects$/i],
  ['education', /^education(al)?(\s+background)?$/i],
  ['certifications', /^(certifications?|certificates|licen[cs]es)(\s*&\s*\w+)?$/i],
  ['ignore', /^(achievements|awards|interests|hobbies|languages|references|declaration)$/i],
];

const BULLET_RE = /^\s*(?:[•●▪◦‣∙·\-–*]|\d+[.)])\s+/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d[\d\s()-]{8,}\d)/;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|[\w-]+\.(?:dev|io|me|com|in))\/?[^\s|,]*/gi;
const DATE_RANGE_RE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*(?:-|–|—|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}|present|current|now|till date)/i;

function sectionOf(line: string) {
  const clean = line.replace(/[:|]+$/, '').trim();
  if (clean.length > 40) return undefined;
  return SECTION_RE.find(([, re]) => re.test(clean))?.[0];
}

/**
 * Best-effort parse of resume plain text (from PDF/DOCX extraction) into a
 * ResumeDoc. Layouts vary too much for this to be perfect, so the console
 * shows the result for the user to correct before it is used.
 */
export function parseResumeText(text: string): ResumeDoc {
  const doc = emptyResume();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let section: ReturnType<typeof sectionOf> | 'header' = 'header';
  let role: ResumeDoc['experience'][number] | undefined;
  let project: ResumeDoc['projects'][number] | undefined;
  const summary: string[] = [];

  for (const line of lines) {
    const next = sectionOf(line);
    if (next) { section = next; role = undefined; project = undefined; continue; }

    if (section === 'header') {
      if (!doc.name && !EMAIL_RE.test(line) && !PHONE_RE.test(line) && line.split(' ').length <= 5) { doc.name = line; continue; }
      const email = line.match(EMAIL_RE)?.[0];
      if (email && !doc.contact.email) doc.contact.email = email;
      const phone = line.replace(EMAIL_RE, '').match(PHONE_RE)?.[1];
      if (phone && !doc.contact.phone) doc.contact.phone = phone.replace(/\s+/g, ' ').trim();
      // Strip emails first, or "name@example.com" yields a bogus "example.com" link.
      const withoutEmails = line.replace(new RegExp(EMAIL_RE.source, 'g'), ' ');
      for (const u of withoutEmails.match(URL_RE) ?? []) doc.contact.links.push(u);
      if (!email && !phone && !(withoutEmails.match(URL_RE)?.length) && !doc.headline) doc.headline = line;
      continue;
    }

    const isBullet = BULLET_RE.test(line);
    const body = line.replace(BULLET_RE, '').trim();

    switch (section) {
      case 'summary':
        summary.push(body);
        break;
      case 'skills': {
        const [group, rest] = body.includes(':') ? [body.split(':')[0]!.trim(), body.slice(body.indexOf(':') + 1)] : [undefined, body];
        const items = rest.split(/\s*[,|•·;]\s*/).map((s) => s.trim()).filter((s) => s && s.length < 40);
        if (items.length) doc.skills.push({ group, items });
        break;
      }
      case 'experience': {
        if (isBullet && role) { role.bullets.push(body); break; }
        // A new role needs a date range; DOCX/PDF extraction often drops bullet
        // glyphs, so an undated plain line under a role is one of its bullets.
        const dates = body.match(DATE_RANGE_RE);
        if (dates || !role) {
          // New role header: "Title | Company | Dates" or "Company — Title  Jan 2021 – Present"
          const withoutDates = body.replace(DATE_RANGE_RE, '').replace(/[|,–—-]\s*$/, '').trim();
          const parts = withoutDates.split(/\s*(?:\||–|—| - | at |,)\s*/).filter(Boolean);
          role = {
            title: parts[0] ?? withoutDates,
            company: parts[1] ?? '',
            location: parts[2],
            start: dates?.[1],
            end: dates?.[2],
            bullets: [],
          };
          doc.experience.push(role);
        } else if (!role.company && role.bullets.length === 0) {
          role.company = body;
        } else {
          role.bullets.push(body);
        }
        break;
      }
      case 'projects': {
        if (isBullet && project) { project.bullets.push(body); break; }
        const tech = body.match(/\(([^)]+)\)|[|:]\s*(.+)$/);
        project = {
          name: body.replace(/\(([^)]+)\)|[|:]\s*(.+)$/, '').trim(),
          tech: (tech?.[1] ?? tech?.[2] ?? '').split(/\s*[,/|]\s*/).filter(Boolean),
          bullets: [],
        };
        doc.projects.push(project);
        break;
      }
      case 'education': {
        const dates = body.match(DATE_RANGE_RE);
        const last = doc.education[doc.education.length - 1];
        if (last && !last.degree && !dates && last.institution !== body) { last.degree = body; break; }
        doc.education.push({
          institution: body.replace(DATE_RANGE_RE, '').trim(),
          start: dates?.[1],
          end: dates?.[2],
        });
        break;
      }
      case 'certifications':
        doc.certifications.push(body);
        break;
      default:
        break;
    }
  }

  if (summary.length) doc.summary = summary.join(' ');
  doc.contact.links = Array.from(new Set(doc.contact.links));
  return doc;
}

/** Import from the JSON Resume standard (jsonresume.org), which many tools export. */
export function fromJsonResume(j: Record<string, any>): ResumeDoc {
  const basics = j.basics ?? {};
  return {
    name: basics.name ?? '',
    headline: basics.label,
    summary: basics.summary,
    contact: {
      email: basics.email,
      phone: basics.phone,
      location: [basics.location?.city, basics.location?.region].filter(Boolean).join(', ') || undefined,
      links: [basics.url, ...(basics.profiles ?? []).map((p: any) => p.url)].filter(Boolean),
    },
    skills: (j.skills ?? []).map((s: any) => ({ group: s.name, items: s.keywords ?? [] })),
    experience: (j.work ?? []).map((w: any) => ({
      company: w.name ?? w.company ?? '',
      title: w.position ?? '',
      location: w.location,
      start: w.startDate,
      end: w.endDate ?? 'Present',
      bullets: [w.summary, ...(w.highlights ?? [])].filter(Boolean),
    })),
    projects: (j.projects ?? []).map((p: any) => ({
      name: p.name ?? '', tech: p.keywords ?? [], bullets: [p.description, ...(p.highlights ?? [])].filter(Boolean), link: p.url,
    })),
    education: (j.education ?? []).map((e: any) => ({
      institution: e.institution ?? '',
      degree: [e.studyType, e.area].filter(Boolean).join(', ') || undefined,
      start: e.startDate,
      end: e.endDate,
    })),
    certifications: (j.certificates ?? []).map((c: any) => c.name).filter(Boolean),
  };
}
