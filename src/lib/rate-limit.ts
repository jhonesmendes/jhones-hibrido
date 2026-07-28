/**
 * Limitação de taxa in-process por chave (IP) com janela deslizante
 * (FR-062). Suficiente para o monolito de uma instância; sem Redis
 * (Constituição II).
 */

type Bucket = number[]; // timestamps (ms) das tentativas

const globalForRl = globalThis as unknown as {
  __voceroRateLimit?: Map<string, Bucket>;
};

function store(): Map<string, Bucket> {
  if (!globalForRl.__voceroRateLimit) {
    globalForRl.__voceroRateLimit = new Map();
  }
  return globalForRl.__voceroRateLimit;
}

export type RateLimitResult = { allowed: boolean; remaining: number };

export function checkRateLimit(
  key: string,
  opts: { windowMs: number; max: number },
  now: number = Date.now()
): RateLimitResult {
  const buckets = store();
  const cutoff = now - opts.windowMs;
  const bucket = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (bucket.length >= opts.max) {
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0 };
  }
  bucket.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: opts.max - bucket.length };
}

/** Apenas para testes. */
export function resetRateLimit(): void {
  store().clear();
}

/** 10 tentativas / 10 minutos por IP em login e registro (FR-062). */
export const AUTH_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 10 };
