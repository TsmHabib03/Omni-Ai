import { ratePolicy } from './gateway.js';

export function admitAccount(storage, env, clock = Date.now) {
  const { limit, windowMs } = ratePolicy(env);
  return storage.transaction(async tx => {
    const now = clock();
    const saved = await tx.get('window');
    let attempts = saved?.attempts ?? [];
    // Preserve usage from the former fixed-window implementation during rollout.
    if (saved && !saved.attempts && saved.count > 0 && saved.resetAt > now) {
      attempts = Array.from({ length: saved.count }, () => saved.resetAt - windowMs);
    }
    attempts = attempts.filter(time => time > now - windowMs);
    if (attempts.length >= limit) {
      const resetAt = attempts[0] + windowMs;
      return { allowed: false, remaining: 0, resetAt, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
    }
    attempts.push(now);
    await tx.put('window', { attempts, expiresAt: attempts.at(-1) + windowMs });
    await tx.setAlarm(attempts.at(-1) + windowMs);
    return { allowed: true, remaining: limit - attempts.length, resetAt: attempts[0] + windowMs, retryAfter: 0 };
  });
}

export function expireAccount(storage, clock = Date.now) {
  return storage.transaction(async tx => {
    const state = await tx.get('window');
    const cleanupAt = state?.expiresAt ?? state?.resetAt;
    if (!state || cleanupAt <= clock()) { await tx.delete('window'); await tx.deleteAlarm(); }
    else await tx.setAlarm(cleanupAt);
  });
}
