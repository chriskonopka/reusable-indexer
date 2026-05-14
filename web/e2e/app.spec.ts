import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Boot-only e2e — proves the dev shell mounts the indexer with the stub host.
// Feature-level flows live in `collections.spec.ts`.

test.describe('Indexer scaffold', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?stub=1');
  });

  test('renders the indexer header and sidebar landmarks', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /Document Collections/i })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Collections' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Active collection' })).toBeVisible();
  });

  test('has no axe violations on the empty-state view', async ({ page }) => {
    await expect(page.getByText("Click 'New collection' to get started.")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });
});
