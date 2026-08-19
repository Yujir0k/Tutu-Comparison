import type { RequestHandler } from 'express';
import type { RequestWithId } from './http.js';

type LogLevel = 'info' | 'error';

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${entry}\n`);
}

/** Emit one structured access record after a response is completed. */
export const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = performance.now();
  response.once('finish', () => {
    log('info', 'http_request', {
      requestId: (request as RequestWithId).requestId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    });
  });
  next();
};
