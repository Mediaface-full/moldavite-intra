type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (bucket.count >= maxAttempts) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

// Periodic cleanup to prevent unbounded memory growth.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets.entries()) {
      if (b.resetAt < now) buckets.delete(key);
    }
  }, 60_000).unref?.();
}

/**
 * Klientská IP za reverzní proxy.
 *
 * SECURITY (audit 10. 9. 2026): dřív se brala PRVNÍ hodnota X-Forwarded-For.
 * DSM nginx nastavuje `X-Forwarded-For $proxy_add_x_forwarded_for`, což
 * hodnotu od klienta NEPŘEPISUJE, ale PŘIDÁVÁ svou na konec. Útočník tedy
 * poslal `X-Forwarded-For: 1.2.3.4` a rate limit loginu klíčoval na 1.2.3.4
 * → neomezený brute-force jen rotací hlavičky. Důvěryhodná je jen POSLEDNÍ
 * hodnota (tu přidala naše proxy). Login má navíc per-účet limit, který na
 * IP nezávisí vůbec.
 */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
