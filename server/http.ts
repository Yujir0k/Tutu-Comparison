import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ValidationError } from './validation.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RequestWithId extends Request {
  requestId: string;
}

/** Attach a stable request identifier and safe browser security headers. */
export const hardenHttp: RequestHandler = (request, response, next) => {
  const incomingId = request.header('x-request-id');
  const requestId =
    incomingId && /^[a-zA-Z0-9._-]{8,80}$/.test(incomingId) ? incomingId : crypto.randomUUID();
  (request as RequestWithId).requestId = requestId;

  response.set({
    'X-Request-Id': requestId,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
  });
  if (request.secure || request.header('x-forwarded-proto') === 'https') {
    response.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
};

/** In-memory fixed-window limiter suitable for a single-instance deployment. */
export function createRateLimiter({ windowMs, max }: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (buckets.size > 10_000) {
      for (const [candidate, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(candidate);
      }
    }

    response.set('RateLimit-Limit', String(max));
    response.set('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    response.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      response.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      response
        .status(429)
        .json({ error: 'Слишком много запросов. Повторите попытку через минуту.' });
      return;
    }
    next();
  };
}

/** Convert internal/upstream failures to a stable public error contract. */
export function sendPublicError(response: Response, error: unknown, fallback: string): void {
  if (error instanceof ValidationError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  response.status(502).json({ error: upstreamMessage(error, fallback) });
}

export function upstreamMessage(error: unknown, fallback = 'Источник временно недоступен'): string {
  const message = error instanceof Error ? error.message : '';
  if (/не успел ответить|abort|timeout/i.test(message))
    return 'Источник не успел ответить. Попробуйте ещё раз.';
  if (/HTTP 429|too many/i.test(message))
    return 'Источник временно перегружен. Попробуйте ещё раз.';
  return fallback;
}

/** Final Express error boundary, including malformed JSON payloads. */
export function errorBoundary(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (response.headersSent) return;
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'Тело запроса содержит некорректный JSON' });
    return;
  }
  sendPublicError(response, error, 'Не удалось обработать запрос');
}
