import { app } from './index.js';
import { log } from './logger.js';
import { warmTutuConnection } from './mcp.js';

const port = readPort(process.env.PORT);
const host = process.env.HOST?.trim() || '127.0.0.1';
const server = app.listen(port, host, () => {
  log('info', 'server_started', { host, port, environment: process.env.NODE_ENV || 'development' });
  void warmTutuConnection().then((ready) => {
    log('info', 'upstream_warmup_completed', { ready });
  });
});

let stopping = false;
const shutdown = (signal: string) => {
  if (stopping) return;
  stopping = true;
  log('info', 'server_stopping', { signal });
  server.close((error) => {
    if (error) {
      log('error', 'server_shutdown_failed', { message: error.message });
      process.exitCode = 1;
    }
  });
  setTimeout(() => {
    log('error', 'server_shutdown_timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function readPort(raw: string | undefined): number {
  const value = Number(raw || 8787);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return value;
}
