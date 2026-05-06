import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// End-to-end tests for the folder tree — slice S2.
// Drives the indexer via the ?stub=1 in-memory shim. The shim seeds a
// "Contracts" folder and two documents when a collection is created.

test.describe('Folder tree — S2 user flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?stub=1');
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('mws-indexer');
    });
    await page.reload();
  });

  const createCollection = async (page: Parameters<typeof test.beforeEach>[0]['page'], name = 'Test Collection') => {
    await page.getByRole('button', { name: 'New collection' }).click();
    const input = page.getByRole('textbox', { name: /Rename/ });
    await input.fill(name);
    await input.press('Enter');
    // exact: true so this matches the row-name button only, not Share/Rename/Delete X.
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  };

  test('shows the folder tree after activating a collection', async ({ page }) => {
    await createCollection(page);
    await expect(page.getByRole('navigation', { name: 'Folders' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All files' })).toBeVisible();
  });

  test('seeded folder "Contracts" is visible in the tree', async ({ page }) => {
    await createCollection(page);
    await expect(page.getByText('Contracts')).toBeVisible();
  });

  test('clicking All files shows all files (no folder filter)', async ({ page }) => {
    await createCollection(page);
    await page.getByRole('button', { name: 'All files' }).click();
    // "All files" item should be marked as current (active).
    await expect(page.getByRole('button', { name: 'All files' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('creates a new root folder', async ({ page }) => {
    await createCollection(page);
    await page.getByRole('button', { name: 'Create folder at root level' }).click();
    const input = page.getByRole('textbox', { name: 'New folder name' });
    await input.fill('Regulations');
    await input.press('Enter');
    await expect(page.getByText('Regulations')).toBeVisible();
  });

  test('renames a folder inline', async ({ page }) => {
    await createCollection(page);
    await expect(page.getByText('Contracts')).toBeVisible();
    await page.getByRole('button', { name: 'Rename Contracts' }).click();
    const input = page.getByRole('textbox', { name: 'Rename Contracts' });
    await input.fill('Agreements');
    await input.press('Enter');
    await expect(page.getByText('Agreements')).toBeVisible();
    await expect(page.getByText('Contracts')).not.toBeVisible();
  });

  test('cancels rename on Escape', async ({ page }) => {
    await createCollection(page);
    await expect(page.getByText('Contracts')).toBeVisible();
    await page.getByRole('button', { name: 'Rename Contracts' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Contracts')).toBeVisible();
  });

  test('deletes a folder via the confirm dialog', async ({ page }) => {
    await createCollection(page);
    await expect(page.getByText('Contracts')).toBeVisible();
    await page.getByRole('button', { name: 'Delete Contracts' }).click();
    const dialog = page.getByRole('dialog', { name: /Delete folder Contracts/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Contracts')).not.toBeVisible();
  });

  test('dismisses the delete dialog on Cancel', async ({ page }) => {
    await createCollection(page);
    await page.getByRole('button', { name: 'Delete Contracts' }).click();
    const dialog = page.getByRole('dialog', { name: /Delete folder Contracts/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Contracts')).toBeVisible();
  });

  test('has no axe violations with the folder tree visible', async ({ page }) => {
    await createCollection(page);
    await expect(page.getByRole('navigation', { name: 'Folders' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('has no axe violations with the delete folder dialog open', async ({ page }) => {
    await createCollection(page);
    await page.getByRole('button', { name: 'Delete Contracts' }).click();
    await expect(
      page.getByRole('dialog', { name: /Delete folder Contracts/ }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });
});
