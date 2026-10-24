// Minimal in-memory fixed-window rate limiter (no dependencies).
// Keyed by req.ip. Fine for a single process; use a shared store
// (e.g. Redis) if you run several instances.
//
// Behind a reverse proxy (Render, nginx...) set TRUST_PROXY in the
// environment so that req.ip is the real client address.

function createRateLimiter({ windowMs, max, message = 'too many requests, try again later', now = Date.now } = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('rateLimit: windowMs must be > 0');
  if (!Number.isFinite(max) || max <= 0) throw new Error('rateLimit: max must be > 0');

  const hits = new Map(); // key -> { count, resetAt }

  const sweep = setInterval(() => {
    const t = now();
    for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
  }, Math.min(windowMs, 60 * 1000));
  if (typeof sweep.unref === 'function') sweep.unref();

  function middleware(req, res, next) {
    const key = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const t = now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ ok: false, error: message });
    }
    next();
  }

  middleware.stop = () => clearInterval(sweep);
  return middleware;
}

module.exports = { createRateLimiter };
