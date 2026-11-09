export function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    // Google Sign-In opens a popup; same-origin would break that flow.
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'none'",
  };
}

export function documentCsp(nonce, { https = true } = {}) {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://accounts.google.com/gsi/`,
    "script-src-attr 'none'",
    // GIS also injects its button stylesheet inline. Permit only the inspected
    // stylesheet by hash; arbitrary inline style elements still require a nonce.
    `style-src 'nonce-${nonce}' 'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=' https://accounts.google.com/gsi/style https://fonts.googleapis.com`,
    // React uses style properties for responsive geometry; this does not allow scripts.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    // HTTPS CDN downloads and inline raster downloads need these connect schemes.
    "connect-src 'self' https: data:",
    'frame-src https://accounts.google.com/gsi/',
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
