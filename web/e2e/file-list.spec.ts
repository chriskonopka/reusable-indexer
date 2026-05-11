import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// End-to-end tests for the file list — slice S2.
// The ?stub=1 shim seeds "sample-contract.pdf" (in Contracts folder) and
// "overview.pdf" (at root/all-files level) when a collection is created.

test.describe('File list — S2 user flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?stub=1');
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('mws-indexer');
    });
    await page.reload();
  });

  const createAndActivate = async (page: Parameters<typeof test.beforeEach>[0]['page']) => {
    await page.getByRole('button', { name: 'New collection' }).click();
    const input = page.getByRole('textbox', { name: /Rename/ });
    await input.fill('My Collection');
    await input.press('Enter');
    // exact: true so this matches the row-name button only, not Share/Rename/Delete.
    await expect(page.getByRole('button', { name: 'My Collection', exact: true })).toBeVisible();
    // Wait for the folder tree to load.
    await expect(page.getByRole('navigation', { name: 'Folders' })).toBeVisible();
  };

  test('shows the document table when All files is active', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    // The stub seeds "overview.pdf" at root level.
    await expect(page.getByText('overview.pdf')).toBeVisible();
  });

  test('shows folder contents when a folder is selected', async ({ page }) => {
    await createAndActivate(page);
    // Click the Contracts folder.
    await page.getByRole('button', { name: 'Contracts', exact: true }).click();
    // The stub seeds "sample-contract.pdf" inside the Contracts folder.
    await expect(page.getByText('sample-contract.pdf')).toBeVisible();
  });

  test('shows a Ready status badge on seeded documents', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    // Status badge for Ready documents.
    const readyBadges = page.getByText('Ready');
    await expect(readyBadges.first()).toBeVisible();
  });

  test('clicking a Ready document opens the properties panel', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    await page.getByRole('row', { name: /overview\.pdf/ }).click();
    await expect(
      page.getByRole('complementary', { name: 'Document properties' }),
    ).toBeVisible();
  });

  test('emits document/selected event when a document is clicked', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    await page.getByRole('row', { name: /overview\.pdf/ }).click();

    const events = await page.evaluate(
      () => (window as { __indexerEvents?: unknown[] }).__indexerEvents ?? [],
    );
    const docSelectedEvents = (events as Array<{ type: string }>).filter(
      (event) => event.type === 'document/selected',
    );
    expect(docSelectedEvents.length).toBeGreaterThanOrEqual(1);
  });

  test('closes the properties panel via the close button', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    await page.getByRole('row', { name: /overview\.pdf/ }).click();
    await expect(
      page.getByRole('complementary', { name: 'Document properties' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close document properties' }).click();
    await expect(
      page.getByRole('complementary', { name: 'Document properties' }),
    ).not.toBeVisible();
  });

  test('deletes a document via the row delete button and confirm dialog', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    await page.getByRole('button', { name: 'Delete overview.pdf' }).click();
    const dialog = page.getByRole('dialog', { name: /Delete document overview\.pdf/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('overview.pdf')).not.toBeVisible();
  });

  test('has no axe violations on the file list with documents', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('has no axe violations with the properties panel open', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    await page.getByRole('row', { name: /overview\.pdf/ }).click();
    await expect(
      page.getByRole('complementary', { name: 'Document properties' }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('has no axe violations with the delete document dialog open', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    await page.getByRole('button', { name: 'Delete overview.pdf' }).click();
    await expect(
      page.getByRole('dialog', { name: /Delete document overview\.pdf/ }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  // ── Toolbar / sort / filter / bulk-select ──

  test('renders the toolbar (search + type filter) on the file list', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Document filters' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Filter by name' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Filter by type' })).toBeVisible();
  });

  test('filters files by name via the debounced search input', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Filter by name' }).fill('no-such-file');
    await expect(page.getByText('No files match')).toBeVisible();
    await expect(page.getByText('overview.pdf')).not.toBeVisible();
  });

  test('selects rows and bulk-deletes via the toolbar', async ({ page }) => {
    await createAndActivate(page);
    await page.getByRole('button', { name: 'All files' }).click();
    await expect(page.getByText('overview.pdf')).toBeVisible();

    await page.getByRole('checkbox', { name: 'Select overview.pdf' }).check();
    await expect(page.getByText('1 document selected')).toBeVisible();

    await page.getByRole('button', { name: /Delete 1 selected/ }).click();
    const dialog = page.getByRole('dialog', { name: /Delete document overview\.pdf/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText('overview.pdf')).not.toBeVisible();
  });
});
