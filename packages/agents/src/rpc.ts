// A NEAR RPC provider that waits out rate limits. near-api-js retries a 500, 503 or 408 but
// gives up on a 429 at once, and the free public endpoints answer 429 to short bursts (a page
// polling while a move is relayed). Every read and every transaction of the provider goes
// through sendJsonRpc, so retrying there covers both. Resending a signed transaction is safe:
// it has the same hash and nonce, so it can only land once.

import { JsonRpcProvider } from "near-api-js";

type Send = (method: string, params: unknown) => Promise<unknown>;

export function isRateLimited(e: unknown): boolean {
  if ((e as { cause?: unknown } | null)?.cause === 429) return true;
  return /\b429\b|rate limit/i.test(String((e as Error | null)?.message ?? e));
}

/** A JsonRpcProvider that retries rate-limited calls up to `tries` times, doubling the wait. */
export function patientProvider(url: string, opts: { tries?: number; firstWaitMs?: number } = {}): JsonRpcProvider {
  const tries = opts.tries ?? 5;
  const firstWait = opts.firstWaitMs ?? 400;
  const provider = new JsonRpcProvider({ url });
  const send = (provider.sendJsonRpc as unknown as Send).bind(provider);
  const patient: Send = async (method, params) => {
    let wait = firstWait;
    for (let attempt = 1; ; attempt++) {
      try {
        return await send(method, params);
      } catch (e) {
        if (attempt >= tries || !isRateLimited(e)) throw e;
        // jitter, so several waiting callers don't all come back at the same moment
        await new Promise((r) => setTimeout(r, wait * (1 + Math.random() * 0.5)));
        wait *= 2;
      }
    }
  };
  (provider as unknown as { sendJsonRpc: Send }).sendJsonRpc = patient;
  return provider;
}
