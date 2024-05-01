import { Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type RetryOptions = {
  retries: number,
  minInterval?: number,
  beforeRetry?: (retries: number) => void,
  onReject?: (reason: any) => void,
}

export async function retry<T>(asyncFunction: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastReason: any;

  for (let retries = 0; retries <= options.retries; retries++) {
    if (retries > 0 && typeof options.beforeRetry === 'function') {
      options.beforeRetry(retries);
    }

    const startTime = Date.now();

    try {
      const result = await asyncFunction();
      return result;
    } catch (reason) {
      lastReason = reason;
      options.onReject?.(reason);
    }

    const duration = Date.now() - startTime;
    if (retries < options.retries && options.minInterval && duration < options.minInterval) {
      await sleep(options.minInterval - duration);
    }
  }

  return Promise.reject(lastReason);
}

export type RefreshOptions = {
  interval: number,
  exponentialInterval?: boolean,
  retryOptions?: RetryOptions,
  afterRefresh?: () => void,
  onError?: (error: any) => void,
}

export type RefreshHandler<T> = {
  get(): Promise<T>,
  stop(): void,
}

export function refresh<T>(asyncFunction: () => Promise<T>, options: RefreshOptions): RefreshHandler<T> {
  let promise: Promise<T>;

  let interval = options.interval;
  let timeout: NodeJS.Timeout;

  const refreshInner = async () => {
    if (options.exponentialInterval) {
      interval *= 2;
    }
    timeout = setTimeout(() => refreshInner().catch(options.onError), interval);

    const result = await retry(asyncFunction, options.retryOptions ?? { retries: 0 });
    promise = Promise.resolve(result);
    options.afterRefresh?.();
    return result;
  }

  promise = refreshInner();

  return {
    get() {
      return promise;
    },
    stop() {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

export function timeout<T>(asyncFunction: () => Promise<T>, ms: number, timeoutError?: Error): Promise<T> {
  return Promise.race([
    asyncFunction(),
    new Promise<never>((_, reject) => setTimeout(() => reject(timeoutError ?? new Error('Promise result timeout')), ms)),
  ])
}

export function readKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))))
}
