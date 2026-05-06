import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// S4 — runs @axe-core/playwright across each meaningfully different page
// state. Failures in this suite block the build per web-testing.md.

const createCollection = async (page: Page, name = 'Audit collection') => {
  await page.getByRole('button', { name: 'New collection' }).click();
  const input = page.getByRole('textbox', { name: /Rename/ });
  await input.fill(name);
  await input.press('Enter');
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
};

test.describe('Accessibility — S4 axe sweep', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?stub=1');
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('mws-indexer');
    });
    await page.reload();
  });

  test('has no axe violations on the empty-state landing screen', async ({ page }) => {
    await expect(page.getByText("Click 'New collection' to get started.")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('has no axe violations with an active collection and file list visible', async ({ page }) => {
    await createCollection(page);
    await expect(page.getByRole('navigation', { name: 'Folders' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('has no axe violations with the file-type filter open', async ({ page }) => {
    await createCollection(page);
    // Wait for the file list to populate from the seeded sample documents.
    await expect(page.getByRole('table', { name: 'Documents' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Filter by type' }).focus();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('has no axe violations with the share dialog open', async ({ page }) => {
    await createCollection(page);
    await page.getByRole('button', { name: 'Share Audit collection' }).click();
    await expect(page.getByRole('dialog', { name: /Share Audit collection/ })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('has no axe violations during an upload-in-flight banner state', async ({ page }) => {
    await createCollection(page);
    await page.getByLabel('Add files').setInputFiles({
      name: 'audit.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 audit'),
    });
    const banner = page.getByRole('region', { name: 'Upload progress' });
    await expect(banner).toBeVisible();
    await page.getByRole('button', { name: /View progress/ }).click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
