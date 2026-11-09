import React, { useEffect, useRef, useState } from 'react';

export const GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID || '';
export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
// The workspace always requires sign-in, even when OAuth setup is missing.
export const ACCOUNT_MODE = true;
let scriptPromise;

function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { clearTimeout(timer); script.onload = null; script.onerror = null; script.remove(); scriptPromise = null; reject(new Error('Google Sign-In could not load. Check your connection and try again.')); };
    const timer = setTimeout(fail, 15000);
    script.src = 'https://accounts.google.com/gsi/client?hl=en'; script.async = true; script.defer = true;
    script.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return scriptPromise;
}

/** Display claims only. Every API request is authenticated independently by the Worker. */
export function readGoogleCredential(credential) {
  try {
    if (typeof credential !== 'string' || credential.length > 16384) return null;
    const part = credential.split('.')[1];
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0))));
    if (typeof payload.email !== 'string' || !payload.email || payload.email_verified !== true ||
        typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    let picture = '';
    if (typeof payload.picture === 'string' && payload.picture.length <= 2048) {
      try {
        const url = new URL(payload.picture);
        if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
            (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))) picture = url.href;
      } catch { /* A malformed photo must not prevent sign-in. */ }
    }
    return { credential, email: payload.email, expiresAt: payload.exp * 1000,
      name: typeof payload.name === 'string' ? payload.name.trim().slice(0, 100) : '', picture };
  } catch { return null; }
}

export function GoogleSignIn({ onCredential, theme }) {
  const host = useRef(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let active = true;
    setError('');
    setReady(false);
    loadGoogle().then(google => {
      if (!active || !host.current) return;
      google.initialize({ client_id: GOOGLE_CLIENT_ID, callback: result => { if (active) callback.current(result.credential); }, auto_select: false });
      host.current.replaceChildren();
      google.renderButton(host.current, { type: 'standard', theme: theme === 'dark' ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'signin_with', width: Math.min(320, host.current.clientWidth || 260), locale: 'en' });
      setReady(true);
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [theme, attempt]);
  if (!GOOGLE_CLIENT_ID) return <p className="auth-help">Google Sign-In is being configured. Please try again once setup is complete.</p>;
  return <><div className="google-signin" ref={host} />{!ready && !error && <p className="auth-help" role="status">Loading Google Sign-In…</p>}{error && <div className="auth-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}</>;
}
