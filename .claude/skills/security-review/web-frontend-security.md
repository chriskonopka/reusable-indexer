# Frontend Security Review Checklist

## OWASP Top 10 — React / TypeScript / Node Scope

---

### A01: Broken Access Control

- **Protected routes without auth guards** — routes that display sensitive data or perform privileged actions must check authentication state before rendering.
- **Sensitive data in URL parameters** — tokens, IDs, or PII passed as query parameters are visible in browser history, server logs, and referrer headers.
- **Open redirect vulnerabilities** — user-controlled values used in `window.location`, `navigate()`, or `<a href>` without validation against an allowlist.
- **Client-side-only authorization** — role checks or feature gates implemented only in the frontend without corresponding server-side enforcement.
- **Direct object references** — user-supplied IDs used to fetch resources without verifying the user owns or has access to that resource.

---

### A02: Cryptographic Failures

- **Hardcoded secrets in source code** — API keys, tokens, passwords, or signing keys embedded directly in `.ts`, `.tsx`, `.js`, or `.json` files.
- **Secrets in `.env` committed to git** — `.env` files must be in `.gitignore`. Only `.env.example` (with placeholder values) should be committed.
- **Sensitive data in localStorage or sessionStorage** — tokens, passwords, PII, or session data stored in browser storage accessible to any script on the same origin.
- **HTTP links for sensitive resources** — API endpoints, CDN assets, or external services referenced over `http://` instead of `https://`.
- **Weak or missing encryption** — sensitive data transmitted or stored without proper encryption.

---

### A03: Injection / XSS

- **`dangerouslySetInnerHTML` without sanitization** — any use of `dangerouslySetInnerHTML` must sanitize input with a library like DOMPurify. Flag every occurrence.
- **User-controlled `href` or `src` attributes** — values derived from user input, URL parameters, or external data used in `<a href>`, `<img src>`, `<iframe src>`, or `<script src>` without validation.
- **`eval()` or `Function()` constructor** — dynamic code execution from any source. Flag every occurrence.
- **`document.write()` or `innerHTML`** — direct DOM manipulation that bypasses React's XSS protections.
- **Template literal injection** — user input interpolated into strings that are later parsed as HTML, URLs, or code.
- **URL injection via `javascript:` protocol** — user-controlled strings used in href that could contain `javascript:` URIs.

---

### A04: Insecure Design

- **GET requests for state-changing operations** — mutations (create, update, delete) must use POST/PUT/PATCH/DELETE, never GET.
- **Missing autocomplete attributes on sensitive fields** — password fields should specify `autocomplete="current-password"` or `autocomplete="new-password"`. Credit card fields should use appropriate autocomplete values.
- **Forms using GET method** — forms that submit sensitive data must use POST method.
- **Missing CSRF protections** — state-changing requests to APIs that use cookie-based authentication must include CSRF tokens.
- **Sensitive operations without confirmation** — destructive actions (delete account, revoke access) should require explicit user confirmation.

---

### A05: Security Misconfiguration

- **Source maps in production builds** — webpack `devtool` should be `false` or omitted in production. Source maps expose original source code.
- **Verbose error messages** — stack traces, internal paths, or database details exposed to end users in error boundaries or catch blocks.
- **CORS misconfiguration** — development CORS settings (`Access-Control-Allow-Origin: *`) leaking into production configuration.
- **Missing Content Security Policy** — no CSP meta tag or header to restrict script sources, style sources, and frame ancestors.
- **Debug mode in production** — React DevTools, Redux DevTools, or debug logging enabled in production builds.
- **Exposed development endpoints** — API proxies, mock servers, or test routes accessible in production.

---

### A06: Vulnerable Components

- **npm audit findings** — run `npm audit` and check for known vulnerabilities. Follow severity policy from @.claude/rules/web-dependency-security.md.
- **Outdated dependencies with known CVEs** — dependencies with published security advisories that have available patches.
- **Unvetted `postinstall` scripts** — new dependencies with `postinstall`, `preinstall`, or `install` scripts that could execute arbitrary code during `npm install`.
- **Dependencies from non-official registries** — packages pulled from registries other than the official npm registry without explicit justification.
- **Unpinned dependency versions** — using `*` or overly broad version ranges that could pull in compromised versions.

---

### A07: Authentication

- **Tokens stored in localStorage** — authentication tokens in localStorage are accessible to any JavaScript on the page (XSS risk). Prefer httpOnly cookies.
- **Credentials in client-side code** — usernames, passwords, or API keys hardcoded or derived in frontend code.
- **Missing auth guards on protected routes** — routes that require authentication rendering content before verifying auth state.
- **Token expiry not handled** — no logic to detect expired tokens, refresh them, or redirect to login.
- **Auth state in non-httpOnly cookies** — session tokens or auth data in cookies without the `httpOnly`, `secure`, and `SameSite` flags.

---

### A08: Software and Data Integrity

- **Third-party scripts without integrity hashes** — external scripts loaded via `<script src>` without `integrity` attribute (Subresource Integrity / SRI).
- **Unexpected npm script modifications** — changes to `postinstall`, `preinstall`, `prepare`, or `prebuild` scripts in `package.json` that could execute malicious code.
- **CDN resources without subresource integrity** — CSS, fonts, or JavaScript loaded from CDNs without SRI hashes.
- **Unverified dynamic imports** — `import()` with user-controlled module paths.

---

### A09: Security Logging and Monitoring

- **`console.log` with sensitive data** — logging tokens, passwords, API keys, PII, or session identifiers to the browser console.
- **PII in error reporting** — user data (email, name, address, payment info) included in error payloads sent to App Insights or similar services.
- **Debug logging in production** — verbose logging that could expose internal state, request/response bodies, or system architecture.
- **Missing error boundary logging** — React error boundaries that silently swallow errors without reporting them.

---

### A10: Server-Side Request Forgery (SSRF)

- **User-controlled URLs in fetch/XMLHttpRequest** — URLs derived from user input, query parameters, or external data passed directly to `fetch()`, `axios()`, or `XMLHttpRequest` without validation against an allowlist.
- **Unvalidated redirect URLs** — redirect targets from query parameters or external sources used without domain validation.
- **Proxy endpoints without URL validation** — backend-for-frontend (BFF) or proxy routes that forward user-supplied URLs without restriction.

---

## Advanced Frontend-Specific Checks

- **Redux DevTools in production** — Redux store configured with DevTools enabled in production builds. Use `process.env.NODE_ENV` to conditionally enable.
- **Cross-origin messaging without origin check** — `window.addEventListener('message', ...)` handlers that do not validate `event.origin` before processing data.
- **Prototype pollution** — `Object.assign()` or spread operators (`{...obj}`) applied to user-controlled objects that could inject `__proto__`, `constructor`, or `prototype` properties.
- **WebSocket connections without authentication** — WebSocket connections established without validating auth tokens or session state.
- **Service worker scope** — service workers registered with overly broad scope that could intercept requests from unrelated parts of the application.
- **Cache poisoning** — service worker or HTTP cache strategies that could serve stale or manipulated content without revalidation.
- **Insecure postMessage targets** — `postMessage()` calls using `'*'` as the target origin instead of a specific trusted origin.
- **Client-side data exposure** — sensitive data stored in global variables, window properties, or data attributes accessible via browser DevTools.
