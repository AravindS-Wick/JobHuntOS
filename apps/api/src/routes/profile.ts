import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ProfileOverrides } from '@jobhunt/services';
import { ErrorResponse, ProfileResponse, RescoreResponse } from '@jobhunt/contracts';

export const profileRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/profile', {
    schema: {
      tags: ['profile'],
      summary: 'The effective scoring profile, plus whatever the UI has overridden',
      description:
        '`effective` is what the scorer actually uses: the code default merged with `overrides`. `gaps` lists technologies the candidate does not have — the scorer can never count them as a match.',
      response: { 200: ProfileResponse },
    },
  }, async () => ({
    effective: await app.services.profile.resolve(),
    overrides: await app.services.profile.getOverrides(),
  }));

  app.put('/profile/overrides', {
    schema: {
      tags: ['profile'],
      summary: 'Replace the profile overrides',
      description:
        'Partial by design — omitted fields fall through to the code default. `skills` merges rather than replaces, so you can nudge one weight. Call POST /profile/rescore afterwards to apply it to stored jobs.',
      body: ProfileOverrides,
      response: { 200: ProfileResponse, 400: ErrorResponse },
    },
  }, async (req) => {
    await app.services.profile.setOverrides(req.body);
    return {
      effective: await app.services.profile.resolve(),
      overrides: await app.services.profile.getOverrides(),
    };
  });

  app.delete('/profile/overrides', {
    schema: {
      tags: ['profile'],
      summary: 'Drop all overrides and fall back to the code default',
      response: { 200: ProfileResponse },
    },
  }, async () => {
    await app.services.profile.reset();
    return {
      effective: await app.services.profile.resolve(),
      overrides: await app.services.profile.getOverrides(),
    };
  });

  app.post('/profile/rescore', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      tags: ['profile'],
      summary: 'Re-score every stored job against the current profile',
      description:
        'Scoring is a pure function of (job, profile, now), so this needs no network calls. Run it after any profile change.',
      response: { 200: RescoreResponse },
    },
  }, async () => {
    const r = await app.services.rescore.run();
    return { ...r, tiers: Object.fromEntries(Object.entries(r.tiers).map(([k, v]) => [String(k), v])) };
  });

  void z; // keep the import meaningful if schemas move
};
