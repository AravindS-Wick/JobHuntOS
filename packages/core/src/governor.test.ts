import { describe, expect, it } from 'vitest';
import { istDayStart, limitBucket, nextAllowedTime, nextSlot, RATE_LIMITS } from './governor.js';

// 2026-10-05 is a Monday. 10:00 IST = 04:30 UTC.
const ist = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);

describe('rate governor', () => {
  it('shares one bucket across company ATS forms', () => {
    expect(limitBucket('greenhouse')).toBe('ats');
    expect(limitBucket('workday')).toBe('ats');
    expect(limitBucket('naukri')).toBe('naukri');
  });

  it('keeps activity inside 08:00–23:00 IST', () => {
    expect(nextAllowedTime(ist('2026-10-05', '03:00'), RATE_LIMITS.naukri!)).toEqual(ist('2026-10-05', '08:00'));
    expect(nextAllowedTime(ist('2026-10-05', '23:30'), RATE_LIMITS.naukri!)).toEqual(ist('2026-10-06', '08:00'));
  });

  it('skips weekends for LinkedIn only', () => {
    const sat = ist('2026-10-10', '11:00');
    expect(nextAllowedTime(sat, RATE_LIMITS.linkedin!)).toEqual(ist('2026-10-12', '08:00'));
    expect(nextAllowedTime(sat, RATE_LIMITS.naukri!)).toEqual(sat);
  });

  it('spaces submissions by a human-paced gap', async () => {
    const now = ist('2026-10-05', '10:00');
    const t = await nextSlot({ platform: 'naukri', now, lastScheduled: now, countOnDay: () => 0, random: () => 0 });
    expect((t.getTime() - now.getTime()) / 1000).toBe(45);
  });

  it('never exceeds the daily ceiling: rolls to the next day', async () => {
    const now = ist('2026-10-05', '10:00');
    const today = istDayStart(now).getTime();
    const t = await nextSlot({
      platform: 'linkedin', now, random: () => 0,
      countOnDay: (d) => (d.getTime() === today ? 12 : 0),
    });
    expect(istDayStart(t)).toEqual(istDayStart(ist('2026-10-06', '10:00')));
    expect(t.getTime()).toBeGreaterThanOrEqual(ist('2026-10-06', '08:00').getTime());
  });
});
