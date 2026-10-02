import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allSkills, fromJsonResume, parseResumeText } from './resume.js';
import { coverLetter, rephraseIsSafe, tailorResume, validateVariant } from './tailor.js';

const text = readFileSync(resolve(__dirname, '../../../fixtures/resume.sample.txt'), 'utf8');
const master = parseResumeText(text);

const job = {
  title: 'Senior Frontend Engineer',
  company: 'Acme',
  descriptionText: 'We need React, TypeScript and Next.js. CI/CD with GitHub Actions. Kubernetes and GraphQL are a plus. Improve page load time.',
};

describe('parseResumeText', () => {
  it('reads header, contact and sections', () => {
    expect(master.name).toBe('Sample Candidate');
    expect(master.headline).toBe('Senior Full Stack Engineer');
    expect(master.contact.email).toBe('sample.candidate@example.com');
    expect(master.contact.phone).toBe('+91 90000 00000');
    expect(master.contact.links).toEqual(expect.arrayContaining(['linkedin.com/in/sample-candidate', 'github.com/sample-candidate']));
    expect(master.summary).toMatch(/5 years/);
  });

  it('reads grouped skills', () => {
    expect(master.skills.map((g) => g.group)).toEqual(['Frontend', 'Backend', 'Cloud & Tools']);
    expect(allSkills(master)).toContain('TypeScript');
  });

  it('reads roles with dates and bullets', () => {
    expect(master.experience).toHaveLength(2);
    expect(master.experience[0]).toMatchObject({ title: 'Senior Software Engineer', company: 'Example Corp', start: 'Jan 2023', end: 'Present' });
    expect(master.experience[0]!.bullets).toHaveLength(7);
    expect(master.experience[1]!.bullets[0]).toMatch(/^Developed React/);
  });

  it('reads projects, education and certifications', () => {
    expect(master.projects.map((p) => p.name)).toEqual(['Job Tracker', 'Recipe Bot']);
    expect(master.projects[0]!.tech).toEqual(['React', 'Node.js', 'PostgreSQL']);
    expect(master.education[0]!.institution).toMatch(/B\.E\. Computer Science/);
    expect(master.certifications).toEqual(['Google Cloud Associate Cloud Engineer']);
  });

  it('imports JSON Resume', () => {
    const doc = fromJsonResume({
      basics: { name: 'A B', email: 'a@b.c', profiles: [{ url: 'https://github.com/ab' }] },
      work: [{ name: 'Co', position: 'Dev', startDate: '2020', highlights: ['Did X'] }],
      skills: [{ name: 'Web', keywords: ['React'] }],
    });
    expect(doc.experience[0]).toMatchObject({ company: 'Co', title: 'Dev', bullets: ['Did X'] });
    expect(doc.contact.links).toEqual(['https://github.com/ab']);
  });
});

describe('tailorResume', () => {
  const t = tailorResume(master, job, { maxBulletsPerRole: 5 });

  it('puts the most relevant bullet first', () => {
    expect(t.doc.experience[0]!.bullets[0]).toMatch(/React and TypeScript/);
  });

  it('only reorders and trims: every bullet is verbatim from the master', () => {
    const masterBullets = new Set(master.experience.flatMap((r) => r.bullets));
    for (const b of t.doc.experience.flatMap((r) => r.bullets)) expect(masterBullets.has(b)).toBe(true);
    expect(t.doc.experience[0]!.bullets).toHaveLength(5);
  });

  it('never adds the JD gaps, and reports them', () => {
    expect(t.gaps).toEqual(expect.arrayContaining(['kubernetes', 'graphql']));
    expect(JSON.stringify(t.doc).toLowerCase()).not.toMatch(/kubernetes|graphql/);
  });

  it('builds the headline from the candidate title and matched master skills', () => {
    expect(t.doc.headline).toMatch(/^Senior Full Stack Engineer \| React/);
    expect(t.doc.headline).not.toMatch(/Kubernetes|GraphQL/);
  });

  it('passes validation', () => {
    expect(validateVariant(t, master)).toEqual({ ok: true, issues: [] });
  });
});

describe('validateVariant blocks fabrication', () => {
  const base = tailorResume(master, job);

  it('rejects an added skill', () => {
    const bad = structuredClone(base);
    bad.doc.skills[0]!.items.push('Kubernetes');
    const r = validateVariant(bad, master);
    expect(r.ok).toBe(false);
    expect(r.issues.join()).toMatch(/Kubernetes/);
  });

  it('rejects an invented bullet', () => {
    const bad = structuredClone(base);
    bad.doc.experience[0]!.bullets.push('Scaled Kafka to 1B events per day');
    expect(validateVariant(bad, master).ok).toBe(false);
  });

  it('rejects a rephrase that adds a number or technology', () => {
    const before = master.experience[0]!.bullets[2]!; // "Mentored 4 engineers…"
    for (const after of ['Mentored 6 engineers and introduced code review guidelines', 'Mentored 4 engineers on AWS and introduced code review guidelines']) {
      const bad = structuredClone(base);
      const role = bad.doc.experience[0]!;
      role.bullets = role.bullets.map((b) => (b === before ? after : b));
      if (!role.bullets.includes(after)) role.bullets.push(after);
      bad.changes.push({ kind: 'bullet_rephrased', section: 'x', detail: 'x', before, after });
      expect(validateVariant(bad, master).ok).toBe(false);
    }
  });

  it('accepts a safe recorded rephrase', () => {
    const before = master.experience[0]!.bullets[2]!;
    const after = 'Mentored 4 engineers and established code review guidelines';
    expect(rephraseIsSafe(before, after)).toEqual({ ok: true });
  });

  it('rejects changed contact details', () => {
    const bad = structuredClone(base);
    bad.doc.contact.email = 'other@example.com';
    expect(validateVariant(bad, master).ok).toBe(false);
  });
});

describe('coverLetter', () => {
  it('uses only master bullets and names no gap technology', () => {
    const t = tailorResume(master, job);
    const letter = coverLetter(master, job, t);
    expect(letter).toMatch(/^Dear Acme hiring team/);
    expect(letter).toContain(t.doc.experience[0]!.bullets[0]!.replace(/\.$/, ''));
    expect(letter.toLowerCase()).not.toMatch(/kubernetes|graphql/);
  });
});

describe('gaps vs not-on-resume', () => {
  it('separates skills you lack from skills you have but did not list', () => {
    const t = tailorResume(master, { title: 'Frontend Engineer', company: 'X', descriptionText: 'React.js, JavaScript, HTML5 and GraphQL' });
    expect(t.matched).toContain('react');
    expect(t.gaps).toContain('graphql');
    expect(t.gaps).not.toContain('react.js');
    expect(t.notOnResume).toEqual(expect.arrayContaining(['javascript', 'html5']));
  });
});
