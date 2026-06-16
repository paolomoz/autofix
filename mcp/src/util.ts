/** Run `fn`, retrying up to `n` extra times on throw (bounded retry for agent parse/validation). */
export async function withRetry<T>(fn: () => Promise<T>, n = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= n; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
