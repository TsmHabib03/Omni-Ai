/** Optional bridge to the installed Footprint extension. Consent remains per request. */
export function requestExtensionWarning(impact, signal) {
  const requestId = crypto.randomUUID();
  let available = false;
  const onAvailable = event => {
    try { available = JSON.parse(event.detail).requestId === requestId; } catch { /* Ignore unrelated events. */ }
  };
  document.addEventListener('omni-impact:available', onAvailable);
  document.dispatchEvent(new CustomEvent('omni-impact:probe', { detail: JSON.stringify({ requestId }) }));
  document.removeEventListener('omni-impact:available', onAvailable);
  if (!available) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener('omni-impact:decision', onDecision);
      signal.removeEventListener('abort', onAbort);
    };
    const onDecision = event => {
      let decision;
      try { decision = JSON.parse(event.detail); } catch { return; }
      if (decision.requestId !== requestId || typeof decision.proceed !== 'boolean') return;
      cleanup(); resolve(decision.proceed);
    };
    const onAbort = () => {
      cleanup();
      document.dispatchEvent(new CustomEvent('omni-impact:dismiss', { detail: JSON.stringify({ requestId }) }));
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    };
    // An unavailable extension never silently grants consent.
    const timer = setTimeout(() => {
      cleanup();
      document.dispatchEvent(new CustomEvent('omni-impact:dismiss', { detail: JSON.stringify({ requestId }) }));
      resolve(false);
    }, 300000);
    document.addEventListener('omni-impact:decision', onDecision);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    document.dispatchEvent(new CustomEvent('omni-impact:request', { detail: JSON.stringify({ requestId, impact }) }));
  });
}
