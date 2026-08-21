import { DubbingProject, DubbingRenderConfig } from '../types';

const MAX_SAFE_SPEED_CAP = 1.18;

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function resolveDubbingRenderConfig(project?: Pick<DubbingProject, 'render_config'>): DubbingRenderConfig {
  const stored = project?.render_config;
  return {
    segment_concurrency: Math.round(boundedNumber(stored?.segment_concurrency ?? process.env.DUB_SEGMENT_CONCURRENCY, 3, 1, 8)),
    ffmpeg_concurrency: Math.round(boundedNumber(stored?.ffmpeg_concurrency ?? process.env.DUB_FFMPEG_CONCURRENCY, 1, 1, 4)),
    tts_max_attempts: Math.round(boundedNumber(stored?.tts_max_attempts ?? process.env.TTS_MAX_ATTEMPTS, 3, 1, 8)),
    retry_base_delay_ms: Math.round(boundedNumber(stored?.retry_base_delay_ms ?? process.env.TTS_RETRY_BASE_DELAY_MS, 750, 100, 30_000)),
    retry_max_delay_ms: Math.round(boundedNumber(stored?.retry_max_delay_ms ?? process.env.TTS_RETRY_MAX_DELAY_MS, 15_000, 500, 120_000)),
    // 1.18x is a quality invariant from the accepted benchmark rounds.
    speed_cap: boundedNumber(stored?.speed_cap ?? process.env.DUB_SPEED_CAP, MAX_SAFE_SPEED_CAP, 1, MAX_SAFE_SPEED_CAP),
    cache_hash_algorithm: 'sha256',
  };
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, Math.floor(concurrency)), items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

class AsyncSemaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly capacity: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire() {
    if (this.active < this.capacity) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiting.push(() => {
      this.active += 1;
      resolve();
    }));
  }

  private release() {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}

const globalFfmpegConcurrency = Math.round(boundedNumber(process.env.FFMPEG_MAX_CONCURRENCY, 1, 1, 8));
const ffmpegSemaphore = new AsyncSemaphore(globalFfmpegConcurrency);
const keyedOperations = new Map<string, Promise<unknown>>();

export function withFfmpegSlot<T>(task: () => Promise<T>) {
  return ffmpegSemaphore.run(task);
}

export function createFfmpegLimiter(concurrency: number) {
  const projectSemaphore = new AsyncSemaphore(Math.max(1, Math.floor(concurrency)));
  return <T>(task: () => Promise<T>) => projectSemaphore.run(() => withFfmpegSlot(task));
}

export async function withKeyedLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = keyedOperations.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  keyedOperations.set(key, current);
  try {
    return await current;
  } finally {
    if (keyedOperations.get(key) === current) keyedOperations.delete(key);
  }
}
