# Testing

Testing is mandatory. All new features and bug fixes must include tests.

## Jest + React Testing Library

- Test behavior, not implementation — query by role, label, and text, not by class or test ID unless unavoidable.
- Prefer `userEvent` over `fireEvent` for simulating user interactions.
- Aim for meaningful coverage, not 100% line coverage for its own sake — focus on critical paths and edge cases.
- Mock only at the boundary (API calls, third-party modules) — do not over-mock.
- Shared test fixtures must be module-level constants defined before the `describe` block, not inside individual `it` callbacks.
- jsdom is missing several browser APIs. Add all polyfills and stubs to `src/setupTests.ts` — do not patch globals inline inside individual test files.

## Coverage

- Minimum **80%** for branches, functions, lines, and statements. Raise the threshold as the project matures; never lower it.
- Coverage config lives in `jest.config.ts`. Run locally with `npm run test:coverage`.

## jest-axe

- **Every component test must include an axe accessibility assertion.** A failing axe assertion blocks merging.
- Logic-only hooks (no rendered DOM output) cannot be passed to `axe` — include a comment explaining why no axe assertion is present.

## Playwright

- **E2E tests are required for every critical user flow** — all primary CRUD operations, any multi-step flow, and data persistence (verify state survives a page reload).
- Tests live in `e2e/` at the project root, split by concern: `<feature>.spec.ts` for user flows, `accessibility.spec.ts` for axe checks.
- Use `getByRole`, `getByLabel`, and `getByText` locators — avoid CSS selectors and `data-testid` where possible.
- Each test must be independent. Reset `localStorage` in `beforeEach` using the `goto + evaluate(clear) + reload` pattern — **not** `addInitScript` (it re-runs on every subsequent reload, breaking persistence tests):
  ```ts
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });
  ```
- **Run `@axe-core/playwright` on every key page/state** in a dedicated `accessibility.spec.ts`. A violation fails the build.
- In CI, set `forbidOnly: !!process.env.CI` and `retries: 2` in the Playwright config.
