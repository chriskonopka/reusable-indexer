import { __resetIndexerDbForTests, deleteValue, getValue, openIndexerDb, putValue } from './idb';

describe('idb wrapper', () => {
  beforeEach(() => {
    __resetIndexerDbForTests();
  });

  it('returns undefined for a key that has never been written', async () => {
    const value = await getValue<string>('ui', 'unknown');
    expect(value).toBeUndefined();
  });

  it('round-trips a primitive value through put + get', async () => {
    await putValue('ui', 'sidebar-collapsed', true);
    const value = await getValue<boolean>('ui', 'sidebar-collapsed');
    expect(value).toBe(true);
  });

  it('round-trips a structured value', async () => {
    const fixture = { name: 'Acme matter', accessRole: 'Owner' as const };
    await putValue('collections', 'last-active', fixture);
    expect(await getValue('collections', 'last-active')).toEqual(fixture);
  });

  it('overwrites existing values on subsequent put', async () => {
    await putValue('ui', 'theme', 'light');
    await putValue('ui', 'theme', 'dark');
    expect(await getValue('ui', 'theme')).toBe('dark');
  });

  it('deletes a value', async () => {
    await putValue('ui', 'theme', 'dark');
    await deleteValue('ui', 'theme');
    expect(await getValue('ui', 'theme')).toBeUndefined();
  });

  it('isolates values by store', async () => {
    await putValue('ui', 'last-active', 'A');
    await putValue('collections', 'last-active', 'B');
    expect(await getValue('ui', 'last-active')).toBe('A');
    expect(await getValue('collections', 'last-active')).toBe('B');
  });

  it('opens the database without throwing when no stores are touched', async () => {
    const db = await openIndexerDb();
    expect(db.name).toBe('mws-indexer');
  });

  it('creates stores lazily as new ones are first used', async () => {
    await putValue('alpha', 'k', 1);
    await putValue('beta', 'k', 2);
    expect(await getValue('alpha', 'k')).toBe(1);
    expect(await getValue('beta', 'k')).toBe(2);
  });
});
