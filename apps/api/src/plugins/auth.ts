import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ApiError } from '../errors.js';

const OPEN_PATHS = new Set(['/health', '/health/ready', '/docs', '/docs/json', '/docs/yaml']);

function isOpen(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return OPEN_PATHS.has(path) || path.startsWith('/docs/');
}

/** Constant-time compare so the key can't be probed by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface AuthOptions { apiKey?: string }

export default fp<AuthOptions>(async (app: FastifyInstance, opts) => {
  if (!opts.apiKey) {
    app.log.warn(
      'API_KEY is not set — the API is unauthenticated. Fine on localhost; set one before binding to 0.0.0.0.',
    );
    return;
  }

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (isOpen(req.url)) return;
    const header = req.headers['x-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided || !safeEqual(provided, opts.apiKey!)) throw ApiError.unauthorized();
  });
});
