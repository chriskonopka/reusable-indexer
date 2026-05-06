# Browser Support

All code must work correctly in the following browsers. Do not use APIs, CSS features, or JavaScript syntax that are not supported across this matrix without a polyfill or fallback.

| Platform | Browsers |
|---|---|
| **Windows** | Chrome (latest), Edge (latest) |
| **macOS** | Safari (latest), Chrome (latest), Edge (latest) |

**Rules:**

- Check [MDN compatibility tables](https://developer.mozilla.org/en-US/) or [caniuse.com](https://caniuse.com/) before using any API, CSS property, or JS feature that may not be universally supported.
- Safari is the most restrictive browser in the matrix. Pay particular attention to: CSS features (`color-mix()`, container queries, `:has()`), Web APIs (`crypto.randomUUID`, `ResizeObserver`, `IntersectionObserver`), and ES features. Verify Safari support before use.
- Do not use vendor-prefixed CSS properties unless the unprefixed version is supported across all targets. If a prefix is genuinely required, include both prefixed and unprefixed declarations.
- E2E tests must run against all supported browsers. The Playwright config is the source of truth for which browsers are tested in CI.
- If a polyfill is required, add it explicitly rather than silently relying on a bundler transform — document which browser gap it addresses.
