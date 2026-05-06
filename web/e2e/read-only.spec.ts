import { test, expect, Page } from '@playwright/test';

// S4 — verifies that the indexer's surface hides every mutating affordance
// when the active collection's accessRole is 'Shared'.
//
// The shared collection has to exist BEFORE the sidebar's list query fires
// — otherwise React Query renders an empty state and a later seed never
// surfaces (page.reload() wipes the in-memory stub state). We use
// page.addInitScript to install a setter trap on window.__stubControls so
// the seed runs the moment installStubFetch() assigns its controls object,
// before React mounts.

const seedSharedBeforeMount = async (page: Page, name: string) => {
  await page.addInitScript((collectionName: string) => {
    let cached: unknown = undefined;
    Object.defineProperty(window, '__stubControls', {
      configurable: true,
      get() {
        return cached;
      },
      set(value) {
        cached = value;
        const ctrl = value as
          | { seedSharedCollection?: (n: string) => string }
          | undefined;
        ctrl?.seedSharedCollection?.(collectionName);
      },
    });
  }, name);
};

test.describe('Read-only mode — S4', () => {
  test.beforeEach(async ({ page }) => {
    // Clean per-test storage.
    await page.goto('/?stub=1');
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('mws-indexer');
    });
  });

  test('hides the share / rename / delete affordances on a shared row in the sidebar', async ({ page }) => {
    await seedSharedBeforeMount(page, 'Read-only matter');
    await page.goto('/?stub=1');

    await expect(page.getByRole('button', { name: 'Read-only matter' })).toBeVisible();
    await expect(page.getByText('Shared', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Rename Read-only matter/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Delete Read-only matter/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Share Read-only matter/ }),
    ).toHaveCount(0);
  });

  test('hides folder mutation affordances and the upload toolbar on a shared collection', async ({ page }) => {
    await seedSharedBeforeMount(page, 'Read-only matter');
    await page.goto('/?stub=1');

    await page.getByRole('button', { name: 'Read-only matter' }).click();

    await expect(page.getByRole('navigation', { name: 'Folders' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create folder at root level' }),
    ).toHaveCount(0);

    // Upload toolbar is not rendered on a shared collection.
    await expect(page.getByRole('button', { name: 'Add files' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add folder' })).toHaveCount(0);
  });

  test('hides per-row + bulk delete affordances in the file list on a shared collection', async ({ page }) => {
    await seedSharedBeforeMount(page, 'Read-only matter');
    await page.goto('/?stub=1');

    await page.getByRole('button', { name: 'Read-only matter' }).click();
    await page.getByRole('button', { name: 'Shared docs' }).click();
    await expect(page.getByText('shared-with-you.pdf')).toBeVisible();

    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Delete shared-with-you\.pdf/ }),
    ).toHaveCount(0);
  });
});
