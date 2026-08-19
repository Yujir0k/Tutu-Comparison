import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileCache } from './cache.js';

test('file cache round-trips data and removes excess entries', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tutu-cache-test-'));
  context.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const cache = new FileCache({ directory, maxEntries: 1 });

  await cache.write('transport', { page: 1 }, { variants: [1] });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await cache.write('transport', { page: 2 }, { variants: [2] });
  const removed = await cache.cleanup();

  assert.equal(removed, 1);
  assert.equal(await cache.read<{ variants: number[] }>('transport', { page: 1 }), null);
  assert.deepEqual((await cache.read<{ variants: number[] }>('transport', { page: 2 }))?.data, {
    variants: [2],
  });
});

test('file cache ignores expired and malformed entries', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tutu-cache-test-'));
  context.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const cache = new FileCache({ directory });

  await cache.write('hotels', 'valid', { hotels: [] });
  assert.equal(await cache.read('hotels', 'valid', -1), null);
  assert.equal(await cache.read('hotels', 'missing'), null);
  await assert.rejects(() => cache.write('../unsafe', 'key', {}), /Invalid cache namespace/);
});
