import { z } from 'zod';
import { PROFILE, type Profile } from '@jobhunt/core';
import type { Repos } from '@jobhunt/db';

export const PROFILE_KEY = 'profile.overrides';

/**
 * What the UI is allowed to change. Everything is optional — whatever is absent
 * falls through to the code default in packages/core/src/profile.ts, which
 * stays the source of truth for shape.
 */
export const ProfileOverrides = z.object({
  skills: z.record(z.string(), z.number().min(0).max(5)).optional(),
  gaps: z.array(z.string()).optional(),
  targetTitles: z.array(z.string()).optional(),
  excludeTitles: z.array(z.string()).optional(),
  minSalaryInrLpa: z.number().min(0).max(500).optional(),
  flexSalaryInrLpa: z.number().min(0).max(500).optional(),
  acceptableSeniority: z.array(z.enum(['intern', 'junior', 'mid', 'senior', 'staff', 'lead', 'manager', 'unknown'])).optional(),
  workModePriority: z.array(z.enum(['remote', 'hybrid', 'onsite', 'unknown'])).optional(),
  acceptableCities: z.array(z.string()).optional(),
  homeCity: z.string().optional(),
  yearsExperience: z.number().min(0).max(60).optional(),
}).strict();

export type ProfileOverrides = z.infer<typeof ProfileOverrides>;

export function mergeProfile(overrides: ProfileOverrides | undefined): Profile {
  if (!overrides) return PROFILE;
  return {
    ...PROFILE,
    ...overrides,
    // skills merge rather than replace, so the UI can nudge one weight
    // without having to resend the entire map.
    skills: overrides.skills ? { ...PROFILE.skills, ...overrides.skills } : PROFILE.skills,
  };
}

export function profileService(repos: Repos) {
  return {
    async resolve(): Promise<Profile> {
      const raw = await repos.settings.get<unknown>(PROFILE_KEY);
      const parsed = raw ? ProfileOverrides.safeParse(raw) : undefined;
      return mergeProfile(parsed?.success ? parsed.data : undefined);
    },

    async getOverrides(): Promise<ProfileOverrides> {
      const raw = await repos.settings.get<unknown>(PROFILE_KEY);
      const parsed = raw ? ProfileOverrides.safeParse(raw) : undefined;
      return parsed?.success ? parsed.data : {};
    },

    async setOverrides(next: ProfileOverrides): Promise<ProfileOverrides> {
      await repos.settings.set(PROFILE_KEY, next);
      await repos.events.record({
        entityType: 'profile', action: 'overrides_updated', actor: 'user',
        payload: { keys: Object.keys(next) },
      });
      return next;
    },

    async reset(): Promise<void> {
      await repos.settings.remove(PROFILE_KEY);
      await repos.events.record({ entityType: 'profile', action: 'overrides_reset', actor: 'user' });
    },
  };
}
export type ProfileService = ReturnType<typeof profileService>;
