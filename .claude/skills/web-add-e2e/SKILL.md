---
name: web-add-e2e
description: Add Playwright E2E tests for a critical user flow or feature
---

# Add E2E Tests

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `web-testing.md` — E2E test conventions, Playwright configuration, and what flows must be covered
- `web-accessibility.md` — accessibility assertions to include in E2E flows

---

Add Playwright end-to-end tests for a user flow the user specifies (e.g. "adding and completing a todo", "filtering todos", "dark mode persistence").

## Steps

1. Read `playwright.config.ts` and any existing files in `e2e/` to understand conventions.
2. Determine which spec file the new tests belong in:
   - Feature/flow tests → `e2e/<feature>.spec.ts` (e.g. `e2e/todo-app.spec.ts`)
   - Accessibility checks → `e2e/accessibility.spec.ts`
   - If neither file exists yet, create it.
3. Write the tests following the rules below.
4. Run `npm run test:e2e` and fix any failures before finishing.

## Spec file template

```ts
import { test, expect } from '@playwright/test';

test.describe('Feature description', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('does something meaningful', async ({ page }) => {
    // arrange
    // act
    // assert
  });
});
```

## Accessibility spec template (e2e/accessibility.spec.ts)

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('home page has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(200); // allow CSS transitions to settle
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
```

## Rules

- Use `getByRole`, `getByLabel`, and `getByText` locators — avoid CSS selectors and `data-testid`.
- Each test must be independent: reset `localStorage` in `beforeEach` via `evaluate` + `reload`.
- Persistence tests must verify state survives a full page reload.
- Add `waitForTimeout(200)` before axe scans to let CSS transitions finish.
- Scope ambiguous locators (e.g. filter buttons) to their parent region/nav to avoid false matches.
- Do not add `test.only` — CI enforces `forbidOnly: !!process.env.CI`.
- After tests pass, confirm the count in the run summary matches expectation.
