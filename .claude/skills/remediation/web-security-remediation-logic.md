# Frontend Security Remediation Logic

## Auto-Fixable Issues (Apply + Ask Approval)

### Obvious Fixes (one-liner)

- **console.log with sensitive data** — remove or redact tokens, passwords, PII
- **Missing rel="noopener noreferrer"** — add to all `<a target="_blank">`
- **Source maps in production** — set webpack `devtool: false` in production config
- **Autocomplete on sensitive fields** — add appropriate `autocomplete` attribute
- **Redux DevTools in production** — set `devTools: process.env.NODE_ENV !== 'production'`
- **eval() or Function()** — remove entirely. Use safe parser if dynamic evaluation truly required. Flag every occurrence

### Non-Obvious Fixes (with pattern)

**dangerouslySetInnerHTML without sanitization:**
```tsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```
Install `dompurify` + `@types/dompurify` if missing.

**Hardcoded secrets → env vars:**
```tsx
const API_KEY = process.env.REACT_APP_API_KEY;
```
Move value to `.env` (in `.gitignore`), add placeholder to `.env.example`. Flag for credential rotation if already committed.

**javascript: URI — protocol allowlist:**
```tsx
const isSafeUrl = (url: string) => {
  try { return ['http:', 'https:'].includes(new URL(url, window.location.origin).protocol); }
  catch { return false; }
};
```

**postMessage without origin check:**
```tsx
window.addEventListener('message', (event) => {
  if (event.origin !== TRUSTED_ORIGIN) return;
  handleData(event.data);
});
```

## Manual Issues (Report + Suggest Approach)

- **Token storage migration** — move from localStorage to httpOnly cookies. Requires backend Set-Cookie with httpOnly/Secure/SameSite flags. **Add CSRF protection when switching to cookie-based auth**
- **Auth guard** — create ProtectedRoute wrapper with auth check, redirect, loading state
- **CSP configuration** — recommended starting policy: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.yourapp.com;` — test with `Content-Security-Policy-Report-Only` first
- **CORS** — configure on backend, remove `Access-Control-Allow-Origin: *` from production
- **Dependency vulnerabilities** — `npm audit fix`, evaluate advisories, use `overrides` for transitive deps, document accepted risk
- **Third-party script SRI** — add `integrity` + `crossorigin="anonymous"` to external script tags
