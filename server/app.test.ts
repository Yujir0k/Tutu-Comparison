import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { app } from './index.js';

test('API exposes health, security headers and stable validation errors', async (context) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  context.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.match(health.headers.get('x-request-id') || '', /^[a-f0-9-]{36}$/);
  assert.equal(((await health.json()) as { ok: boolean }).ok, true);

  const invalidSearch = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(invalidSearch.status, 400);
  assert.match(((await invalidSearch.json()) as { error: string }).error, /город отправления/);

  const missing = await fetch(`${baseUrl}/api/not-found`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'API endpoint не найден' });
});
