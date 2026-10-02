/**
 * Rate governor (PRD D5). These are hard ceilings, not targets: the scheduler
 * never places more than `perDay` submissions on a platform in one IST day,
 * spaces them by a random human-paced gap, and only inside waking hours.
 */
export interface PlatformLimit {
  perDay: number;
  minGapSec: number;
  maxGapSec: number;
  /** No activity on Saturday/Sunday (LinkedIn bursts at weekends look automated). */
  skipWeekends?: boolean;
}

export const RATE_LIMITS: Record<string, PlatformLimit> = {
  linkedin: { perDay: 12, minGapSec: 120, maxGapSec: 420, skipWeekends: true },
  naukri: { perDay: 30, minGapSec: 45, maxGapSec: 180 },
  indeed: { perDay: 15, minGapSec: 60, maxGapSec: 240 },
  foundit: { perDay: 20, minGapSec: 45, maxGapSec: 180 },
  instahyre: { perDay: 20, minGapSec: 45, maxGapSec: 180 },
  cutshort: { perDay: 15, minGapSec: 60, maxGapSec: 240 },
  wellfound: { perDay: 15, minGapSec: 60, maxGapSec: 240 },
  yc: { perDay: 10, minGapSec: 60, maxGapSec: 240 },
  // Company ATS forms: "ATS direct applies ≤ 15/day" shared across these.
  ats: { perDay: 15, minGapSec: 45, maxGapSec: 180 },
};

const ATS_PLATFORMS = new Set(['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'zohorecruit', 'amazon', 'microsoft', 'google']);

/** Which bucket a platform's submissions count against. */
export function limitBucket(platform: string): string {
  return ATS_PLATFORMS.has(platform) ? 'ats' : platform;
}

export function limitFor(platform: string): PlatformLimit {
  return RATE_LIMITS[limitBucket(platform)] ?? { perDay: 10, minGapSec: 60, maxGapSec: 240 };
}

const IST_OFFSET_MS = 5.5 * 36e5;
const WINDOW_START_H = 8;
const WINDOW_END_H = 23;

/** Start of the IST calendar day containing `d`, as a UTC instant. */
export function istDayStart(d: Date): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}

function istHour(d: Date): number {
  return new Date(d.getTime() + IST_OFFSET_MS).getUTCHours();
}

function istWeekday(d: Date): number {
  return new Date(d.getTime() + IST_OFFSET_MS).getUTCDay();
}

/** Move `d` forward to the next allowed moment (08:00–23:00 IST, weekdays if required). */
export function nextAllowedTime(d: Date, limit: PlatformLimit): Date {
  let t = new Date(d);
  for (let i = 0; i < 10; i++) {
    const h = istHour(t);
    const dayStart = istDayStart(t);
    if (limit.skipWeekends && (istWeekday(t) === 0 || istWeekday(t) === 6)) {
      t = new Date(dayStart.getTime() + 864e5 + WINDOW_START_H * 36e5);
      continue;
    }
    if (h < WINDOW_START_H) { t = new Date(dayStart.getTime() + WINDOW_START_H * 36e5); continue; }
    if (h >= WINDOW_END_H) { t = new Date(dayStart.getTime() + 864e5 + WINDOW_START_H * 36e5); continue; }
    return t;
  }
  return t;
}

export interface SlotInput {
  platform: string;
  now: Date;
  /** Latest already-scheduled submission time in this bucket. */
  lastScheduled?: Date;
  /** How many are already scheduled/submitted on the IST day of a candidate time. */
  countOnDay: (dayStart: Date) => Promise<number> | number;
  random?: () => number;
}

/**
 * Earliest time the next submission may run. Walks forward day by day when a
 * day's ceiling is reached. Never returns a time inside a full day.
 */
export async function nextSlot(input: SlotInput): Promise<Date> {
  const limit = limitFor(input.platform);
  const rnd = input.random ?? Math.random;
  const gapMs = (limit.minGapSec + rnd() * (limit.maxGapSec - limit.minGapSec)) * 1000;
  let candidate = new Date(Math.max(input.now.getTime(), (input.lastScheduled?.getTime() ?? 0) + gapMs));
  candidate = nextAllowedTime(candidate, limit);

  for (let day = 0; day < 30; day++) {
    const dayStart = istDayStart(candidate);
    if ((await input.countOnDay(dayStart)) < limit.perDay) return candidate;
    candidate = nextAllowedTime(new Date(dayStart.getTime() + 864e5 + WINDOW_START_H * 36e5 + rnd() * 30 * 6e4), limit);
  }
  return candidate;
}
