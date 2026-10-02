/** Company slug used as `companySlug` when a source has no board token. */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Turn relative ages ("Posted 3 Days Ago", "4 days ago", "about 24 hours",
 * "Posted Today", "Posted 30+ Days Ago") into a date. Returns undefined when
 * the text carries no age, so the scorer treats recency as unknown rather
 * than as "just posted".
 */
export function parseRelativeAge(text: string | null | undefined, now = new Date()): Date | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/\b(today|just now|few (seconds|minutes)|moments? ago)\b/.test(t)) return now;
  if (/\byesterday\b/.test(t)) return new Date(now.getTime() - 864e5);
  const m = t.match(/(\d+)\s*\+?\s*(minute|hour|day|week|month)s?/);
  if (!m?.[1] || !m[2]) {
    if (/\ban? hour\b/.test(t)) return new Date(now.getTime() - 36e5);
    if (/\ba day\b/.test(t)) return new Date(now.getTime() - 864e5);
    return undefined;
  }
  const n = Number(m[1]);
  const unitMs = { minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6 }[m[2] as 'day'];
  return new Date(now.getTime() - n * unitMs);
}

/** Parse a date string or epoch; undefined when it is not a real date. */
export function toDate(v: unknown): Date | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Stable short hash for ids when a source gives none. */
export function stableId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
