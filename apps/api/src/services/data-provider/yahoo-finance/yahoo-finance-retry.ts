/**
 * Detects if an error is a transient network error (timeout, unreachable, fetch failed).
 * Used to decide whether to retry Yahoo Finance requests in deployed environments (e.g. Railway).
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as { code?: string; message?: string; cause?: unknown };
  const code = err.code ?? (err.cause as { code?: string })?.code;
  const message = err.message ?? '';
  if (code === 'ETIMEDOUT' || code === 'ENETUNREACH') {
    return true;
  }
  if (message.includes('fetch failed')) {
    return true;
  }
  const errors = (error as { errors?: Array<{ code?: string }> }).errors;
  if (Array.isArray(errors)) {
    return errors.some(
      (e) => e?.code === 'ETIMEDOUT' || e?.code === 'ENETUNREACH'
    );
  }
  return false;
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Runs an async function and retries on transient network errors with exponential backoff.
 */
export async function withRetryOnNetworkError<T>(
  fn: () => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS - 1 && isNetworkError(error)) {
        const waitMs = RETRY_DELAY_MS * Math.pow(2, attempt);
        await delay(waitMs);
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}
