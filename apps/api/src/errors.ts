import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';

/**
 * One error shape for the whole API, close to RFC 7807. The UI can rely on
 * `error.code` for control flow and `error.details` for field-level messages.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  static notFound(what: string, id?: string) {
    return new ApiError(404, 'not_found', id ? `${what} ${id} not found` : `${what} not found`);
  }
  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'bad_request', message, details);
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError(409, 'conflict', message, details);
  }
  static unauthorized(message = 'missing or invalid API key') {
    return new ApiError(401, 'unauthorized', message);
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: 'not_found', message: `route ${req.method} ${req.url} not found`, requestId: req.id },
    } satisfies ApiErrorBody);
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const requestId = req.id;

    if (hasZodFastifySchemaValidationErrors(err)) {
      req.log.info({ err }, 'request validation failed');
      return reply.status(400).send({
        error: {
          code: 'validation_failed',
          message: 'request did not match the expected schema',
          details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
          requestId,
        },
      } satisfies ApiErrorBody);
    }

    if (isResponseSerializationError(err)) {
      // A response that doesn't match its schema is our bug, not the caller's.
      req.log.error({ err }, 'response serialization failed');
      return reply.status(500).send({
        error: { code: 'internal_error', message: 'response did not match its schema', requestId },
      } satisfies ApiErrorBody);
    }

    if (err instanceof ApiError) {
      req.log.info({ code: err.code }, err.message);
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details, requestId },
      } satisfies ApiErrorBody);
    }

    if (err.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'rate_limited', message: err.message, requestId },
      } satisfies ApiErrorBody);
    }

    req.log.error({ err }, 'unhandled error');
    return reply.status(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({
      error: {
        code: 'internal_error',
        message: process.env.NODE_ENV === 'production' ? 'internal server error' : err.message,
        requestId,
      },
    } satisfies ApiErrorBody);
  });
}
