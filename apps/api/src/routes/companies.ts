import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { detectAts, fetchCompany, mapWithConcurrency } from '@jobhunt/connectors';
import type { CompanyEntry } from '@jobhunt/core';
import { ApiError, } from '../errors.js';
import {
  Company, CompanyCreate, CompanyListQuery, CompanyUpdate, DetectRequest, DetectResponse,
  ErrorResponse, VerifyRequest, VerifyResponse,
} from '@jobhunt/contracts';

const IdParam = z.object({ id: z.string().min(1) });

export const companyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/companies', {
    schema: {
      tags: ['companies'],
      summary: 'List the target company registry',
      querystring: CompanyListQuery,
      response: { 200: z.array(Company) },
    },
  }, async (req) => app.repos.companies.list(req.query));

  app.get('/companies/:id', {
    schema: {
      tags: ['companies'],
      summary: 'Get one company',
      params: IdParam,
      response: { 200: Company, 404: ErrorResponse },
    },
  }, async (req) => {
    const row = await app.repos.companies.byId(req.params.id);
    if (!row) throw ApiError.notFound('company', req.params.id);
    return row;
  });

  app.post('/companies', {
    schema: {
      tags: ['companies'],
      summary: 'Add a company to the registry (idempotent on ats + token)',
      body: CompanyCreate,
      response: { 201: Company, 400: ErrorResponse },
    },
  }, async (req, reply) => {
    const row = await app.repos.companies.upsert(req.body as CompanyEntry & { enabled?: boolean });
    await app.repos.events.record({
      entityType: 'company', entityId: row.id, action: 'created', actor: 'user',
      payload: { ats: row.ats, token: row.token },
    });
    return reply.status(201).send(row);
  });

  app.patch('/companies/:id', {
    schema: {
      tags: ['companies'],
      summary: 'Update a company',
      params: IdParam,
      body: CompanyUpdate,
      response: { 200: Company, 404: ErrorResponse },
    },
  }, async (req) => {
    const row = await app.repos.companies.update(req.params.id, req.body);
    if (!row) throw ApiError.notFound('company', req.params.id);
    await app.repos.events.record({
      entityType: 'company', entityId: row.id, action: 'updated', actor: 'user',
      payload: { fields: Object.keys(req.body) },
    });
    return row;
  });

  app.delete('/companies/:id', {
    schema: {
      tags: ['companies'],
      summary: 'Remove a company from the registry',
      params: IdParam,
      response: { 204: z.null(), 404: ErrorResponse },
    },
  }, async (req, reply) => {
    const ok = await app.repos.companies.remove(req.params.id);
    if (!ok) throw ApiError.notFound('company', req.params.id);
    await app.repos.events.record({
      entityType: 'company', entityId: req.params.id, action: 'deleted', actor: 'user',
    });
    return reply.status(204).send(null);
  });

  app.post('/companies/detect', {
    schema: {
      tags: ['companies'],
      summary: 'Identify the ATS and board token behind a careers URL',
      description:
        'Paste any job or careers URL. Returns the ATS type and the board token needed to poll its public API. This is the fastest way to grow the registry.',
      body: DetectRequest,
      response: { 200: DetectResponse },
    },
  }, async (req) => {
    const d = detectAts(req.body.url);
    return {
      ats: d.ats,
      token: d.token,
      meta: d.meta,
      note: d.note,
      suggestion: d.token && d.ats !== 'unknown'
        ? { ats: d.ats, token: d.token, careersUrl: req.body.url }
        : undefined,
    };
  });

  app.post('/companies/verify', {
    schema: {
      tags: ['companies'],
      summary: 'Check which registry entries actually return jobs',
      description:
        'Polls each board once and reports working / empty / failed. Run this after bulk-adding companies to prune bad tokens.',
      body: VerifyRequest,
      response: { 200: VerifyResponse },
    },
  }, async (req) => {
    const all = await app.repos.companies.list(
      req.body.includeDisabled ? {} : { enabled: true },
    );
    const targets = req.body.companyIds?.length
      ? all.filter((c) => req.body.companyIds!.includes(c.id))
      : all;

    const results = await mapWithConcurrency(targets, 4, async (c) => {
      const entry: CompanyEntry = { name: c.name, ats: c.ats as CompanyEntry['ats'], token: c.token };
      const r = await fetchCompany(entry);
      return {
        companyId: c.id, name: c.name, ats: c.ats, token: c.token,
        ok: !r.error && r.jobs.length > 0, count: r.jobs.length, error: r.error,
      };
    });

    return {
      results,
      summary: {
        working: results.filter((r) => r.ok).length,
        empty: results.filter((r) => !r.error && r.count === 0).length,
        failed: results.filter((r) => r.error).length,
      },
    };
  });
};
