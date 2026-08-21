export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export function exponentialBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number) {
  const exponential = baseDelayMs * (2 ** Math.max(0, attempt - 1));
  const jitter = Math.round(exponential * 0.15 * Math.random());
  return Math.min(maxDelayMs, exponential + jitter);
}

export async function withExponentialBackoff<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = attempt < options.maxAttempts && (options.shouldRetry?.(error) ?? true);
      if (!retryable) break;
      const delayMs = exponentialBackoffDelay(attempt, options.baseDelayMs, options.maxDelayMs);
      options.onRetry?.(error, attempt, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
