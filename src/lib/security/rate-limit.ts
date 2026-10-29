type Bucket = { count: number; resetAt: number };
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number; available: boolean };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000), available: true };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)), available: true };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000), available: true };
}

export async function consumeProductionRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const requireDistributed = process.env.NODE_ENV === 'production' || process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT === 'true';
  if (!url || !token) {
    if (requireDistributed) return { allowed: false, retryAfterSeconds: 60, available: false };
    return consumeRateLimit(key, limit, windowSeconds * 1000);
  }

  try {
    const script = "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; local ttl = redis.call('TTL', KEYS[1]); return {count, ttl}";
    const response = await fetch(`${url}/eval`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([script, [`casaio:ratelimit:${key}`], [String(windowSeconds)]]),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw new Error('Rate-limit provider rejected request');
    const payload = await response.json() as { result?: unknown; error?: unknown };
    if (payload.error || !Array.isArray(payload.result) || payload.result.length !== 2) throw new Error('Invalid rate-limit provider response');
    const count = Number(payload.result[0]);
    const ttl = Number(payload.result[1]);
    if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(ttl) || ttl <= 0) throw new Error('Invalid rate-limit provider response');
    return { allowed: count <= limit, retryAfterSeconds: windowSeconds, available: true };
  } catch {
    if (requireDistributed) return { allowed: false, retryAfterSeconds: 60, available: false };
    return consumeRateLimit(key, limit, windowSeconds * 1000);
  }
}

export function getClientAddress(request: Request): string {
  // Only trust the first forwarded address when the deployment's proxy strips
  // and rewrites this header. Otherwise fall back to a shared bucket.
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded && forwarded.length <= 64 ? forwarded : 'unknown-proxy';
}
