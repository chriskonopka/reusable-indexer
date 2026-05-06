import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// End-to-end flow for slice S1. Drives the indexer against the in-memory
// fetch shim activated by `?stub=1`. Asserts:
//   - create + auto-rename + manual rename + delete
//   - share dialog (lookup + grant + revoke)
//   - host receives the documented IndexerEvents
//
// Each test starts on a clean page so the in-memory stub state resets.

test.describe('Collections — S1 user flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?stub=1');
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('mws-indexer');
    });
    await page.reload();
  });

  test('creates, renames, and deletes a collection', async ({ page }) => {
    await expect(page.getByText("Click 'New collection' to get started.")).toBeVisible();

    await page.getByRole('button', { name: 'New collection' }).click();
    await expect(page.getByRole('button', { name: 'New collection' }).first()).toBeVisible();

    // Inline-rename input is focused on create — type a new name and press Enter.
    const renameInput = page.getByRole('textbox', { name: /Rename/ });
    await expect(renameInput).toBeFocused();
    await renameInput.fill('Acme matter');
    await renameInput.press('Enter');

    await expect(page.getByRole('button', { name: 'Acme matter', exact: true })).toBeVisible();
    // After activating a collection the folder tree is now visible.
    await expect(page.getByRole('navigation', { name: 'Folders' })).toBeVisible();

    // Delete via the row's icon button + confirm dialog.
    await page.getByRole('button', { name: 'Delete Acme matter' }).click();
    const dialog = page.getByRole('dialog', { name: /Delete Acme matter/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText("Click 'New collection' to get started.")).toBeVisible();
  });

  test('emits collection/activated and collection/list-changed via the host contract', async ({ page }) => {
    await page.getByRole('button', { name: 'New collection' }).click();
    const renameInput = page.getByRole('textbox', { name: /Rename/ });
    await renameInput.fill('Telemetry test');
    await renameInput.press('Enter');

    await expect(page.getByRole('button', { name: 'Telemetry test', exact: true })).toBeVisible();

    const events = await page.evaluate(() =>
      (window as { __indexerEvents?: unknown[] }).__indexerEvents ?? [],
    );
    const types = (events as Array<{ type: string }>).map((event) => event.type);

    expect(types).toContain('collection/list-changed');
    expect(types).toContain('collection/activated');
  });

  test('opens the share dialog and grants a viewer', async ({ page }) => {
    await page.getByRole('button', { name: 'New collection' }).click();
    const renameInput = page.getByRole('textbox', { name: /Rename/ });
    await renameInput.fill('Shared work');
    await renameInput.press('Enter');

    await page.getByRole('button', { name: 'Share Shared work' }).click();
    const dialog = page.getByRole('dialog', { name: /Share Shared work/ });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Email').fill('viewer@example.com');
    await expect(dialog.getByText(/Found: viewer/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Add viewer' }).click();
    // exact: true so this matches the granted-viewer entry only,
    // not "Found: viewer" / "Add viewer" / "Current viewers".
    await expect(dialog.getByText('viewer', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(dialog.getByText('No viewers yet.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('has no axe violations after creating a collection', async ({ page }) => {
    await page.getByRole('button', { name: 'New collection' }).click();
    const renameInput = page.getByRole('textbox', { name: /Rename/ });
    await renameInput.fill('Audit');
    await renameInput.press('Enter');

    await expect(page.getByRole('button', { name: 'Audit', exact: true })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });
});
