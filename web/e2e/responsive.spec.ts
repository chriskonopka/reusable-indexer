import { test, expect, Page } from '@playwright/test';

// S4 — verifies the responsive cut: desktop sidebar+main pane, tablet
// collapsible sidebar, mobile single-pane stack with hamburger entry.
// Breakpoints are declared in RootShell.module.css; this spec drives the
// indexer at viewport sizes on either side of each breakpoint and asserts
// the visible affordances match.
//
// Mobile breakpoint (max-width: 720px) reveals the hamburger and turns the
// sidebar into a slide-in overlay. Above the breakpoint the hamburger is
// hidden and the sidebar lives in flow.

const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 900, height: 1024 };
const MOBILE = { width: 375, height: 812 };

const createCollection = async (page: Page, name = 'Responsive collection') => {
  await page.getByRole('button', { name: 'New collection' }).click();
  const input = page.getByRole('textbox', { name: /Rename/ });
  await input.fill(name);
  await input.press('Enter');
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
};

test.describe('Responsive layout — S4', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?stub=1');
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('mws-indexer');
    });
    await page.reload();
  });

  test('hides the hamburger and shows the sidebar inline at desktop width', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const hamburger = page.getByRole('button', { name: /collections menu/ });
    await expect(hamburger).toBeHidden();
    await expect(page.getByRole('complementary', { name: 'Collections' })).toBeVisible();
  });

  test('hides the hamburger at tablet width but keeps the sidebar inline', async ({ page }) => {
    await page.setViewportSize(TABLET);
    const hamburger = page.getByRole('button', { name: /collections menu/ });
    await expect(hamburger).toBeHidden();
    await expect(page.getByRole('complementary', { name: 'Collections' })).toBeVisible();
  });

  test('shows the hamburger at mobile width and toggles the sidebar overlay', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const open = page.getByRole('button', { name: 'Open collections menu' });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute('aria-expanded', 'false');

    await open.click();
    const close = page.getByRole('button', { name: 'Close collections menu' });
    // Both the hamburger (now in close-state) and the backdrop carry the
    // close-action label — the open trigger has flipped its label.
    await expect(close.first()).toHaveAttribute('aria-expanded', 'true');
  });

  test('Escape closes the mobile sidebar overlay', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.getByRole('button', { name: 'Open collections menu' }).click();
    await expect(
      page.getByRole('button', { name: 'Close collections menu' }).first(),
    ).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Open collections menu' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  test('selecting a collection on mobile auto-dismisses the overlay', async ({ page }) => {
    // Create the collection at desktop, then drop the viewport to mobile in
    // the same page session so the in-memory stub state survives. Reloading
    // would reset installStubFetch() and wipe the collection.
    await page.setViewportSize(DESKTOP);
    await createCollection(page);

    await page.setViewportSize(MOBILE);

    await page.getByRole('button', { name: 'Open collections menu' }).click();
    await expect(
      page.getByRole('button', { name: 'Close collections menu' }),
    ).toHaveAttribute('aria-expanded', 'true');

    await page.getByRole('button', { name: 'Responsive collection', exact: true }).click();

    await expect(
      page.getByRole('button', { name: 'Open collections menu' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });
});
