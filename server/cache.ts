import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface CacheEntry<T> {
  savedAt: string;
  data: T;
}

interface FileCacheOptions {
  directory: string;
  maxEntries?: number;
  retentionMs?: number;
}

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Small bounded disk cache for successful upstream responses.
 * Writes are atomic and cleanup is throttled so cache maintenance never sits on
 * the critical response path for every request.
 */
export class FileCache {
  readonly #directory: string;
  readonly #maxEntries: number;
  readonly #retentionMs: number;
  #lastCleanupAt = 0;

  constructor({
    directory,
    maxEntries = 250,
    retentionMs = 7 * 24 * 60 * 60 * 1000,
  }: FileCacheOptions) {
    this.#directory = path.resolve(directory);
    this.#maxEntries = maxEntries;
    this.#retentionMs = retentionMs;
  }

  async read<T>(
    namespace: string,
    key: unknown,
    maxAgeMs = 30 * 60 * 1000,
  ): Promise<CacheEntry<T> | null> {
    try {
      const raw = await fs.readFile(this.#filePath(namespace, key), 'utf8');
      const entry = JSON.parse(raw) as Partial<CacheEntry<T>>;
      const savedAtMs = typeof entry.savedAt === 'string' ? Date.parse(entry.savedAt) : Number.NaN;
      if (!Number.isFinite(savedAtMs) || !('data' in entry) || Date.now() - savedAtMs > maxAgeMs) {
        return null;
      }
      return entry as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  async write<T>(namespace: string, key: unknown, data: T): Promise<void> {
    await fs.mkdir(this.#directory, { recursive: true });
    const destination = this.#filePath(namespace, key);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    const payload: CacheEntry<T> = { savedAt: new Date().toISOString(), data };

    try {
      await fs.writeFile(temporary, JSON.stringify(payload), { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporary, destination);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }

    if (Date.now() - this.#lastCleanupAt > 60 * 60 * 1000) {
      this.#lastCleanupAt = Date.now();
      await this.cleanup().catch(() => undefined);
    }
  }

  async cleanup(now = Date.now()): Promise<number> {
    let names: string[];
    try {
      names = await fs.readdir(this.#directory);
    } catch {
      return 0;
    }

    const candidates = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          const file = path.join(this.#directory, name);
          const stats = await fs.stat(file).catch(() => null);
          return stats?.isFile() ? { file, modifiedAt: stats.mtimeMs } : null;
        }),
    );
    const files = candidates
      .filter((entry): entry is { file: string; modifiedAt: number } => entry !== null)
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
    const expired = files.filter(
      (entry, index) => now - entry.modifiedAt > this.#retentionMs || index >= this.#maxEntries,
    );

    await Promise.allSettled(expired.map((entry) => fs.rm(entry.file, { force: true })));
    return expired.length;
  }

  #filePath(namespace: string, key: unknown): string {
    if (!NAMESPACE_PATTERN.test(namespace)) {
      throw new Error('Invalid cache namespace');
    }
    const digest = crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex');
    return path.join(this.#directory, `${namespace}-${digest}.json`);
  }
}
