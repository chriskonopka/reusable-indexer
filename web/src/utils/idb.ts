// IndexedDB wrapper. Single database (`mws-indexer`), one named store per
// scope (collections, ui, etc.). Stores are created on demand so callers
// only declare the names they need at use time. See
// /docs/architecture/data-model.md §2 and web-persistence.md.

const DB_NAME = 'mws-indexer';

interface DbHandle {
  db: IDBDatabase;
  knownStores: Set<string>;
}

let openRequest: Promise<DbHandle> | null = null;

const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openWithStores = async (storeNames: readonly string[]): Promise<DbHandle> => {
  // Determine the next version number based on whether any new stores need
  // to be created. IndexedDB only allows store creation inside an
  // onupgradeneeded handler, so we re-open with a higher version when a
  // missing store is requested.
  return new Promise<DbHandle>((resolve, reject) => {
    const probe = indexedDB.open(DB_NAME);
    probe.onerror = () => reject(probe.error);
    probe.onsuccess = () => {
      const existing = probe.result;
      const existingStores = new Set<string>();
      for (let i = 0; i < existing.objectStoreNames.length; i += 1) {
        existingStores.add(existing.objectStoreNames.item(i)!);
      }
      const missing = storeNames.filter((name) => !existingStores.has(name));
      if (missing.length === 0) {
        resolve({ db: existing, knownStores: existingStores });
        return;
      }
      const nextVersion = existing.version + 1;
      existing.close();

      const upgrade = indexedDB.open(DB_NAME, nextVersion);
      upgrade.onerror = () => reject(upgrade.error);
      upgrade.onupgradeneeded = () => {
        const upgraded = upgrade.result;
        for (const name of missing) {
          if (!upgraded.objectStoreNames.contains(name)) {
            upgraded.createObjectStore(name);
          }
        }
      };
      upgrade.onsuccess = () => {
        const upgraded = upgrade.result;
        const knownStores = new Set<string>(existingStores);
        for (const name of missing) knownStores.add(name);
        resolve({ db: upgraded, knownStores });
      };
    };
  });
};

const ensureStore = async (storeName: string): Promise<DbHandle> => {
  if (!openRequest) {
    openRequest = openWithStores([storeName]);
    return openRequest;
  }
  const handle = await openRequest;
  if (handle.knownStores.has(storeName)) return handle;
  // Cache miss — re-open with the new store.
  handle.db.close();
  openRequest = openWithStores([...handle.knownStores, storeName]);
  return openRequest;
};

export const openIndexerDb = async (): Promise<IDBDatabase> => {
  if (!openRequest) {
    openRequest = openWithStores([]);
  }
  return (await openRequest).db;
};

export const getValue = async <T>(
  storeName: string,
  key: string,
): Promise<T | undefined> => {
  const { db } = await ensureStore(storeName);
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const value = (await promisify(store.get(key))) as T | undefined;
  return value;
};

export const putValue = async <T>(
  storeName: string,
  key: string,
  value: T,
): Promise<void> => {
  const { db } = await ensureStore(storeName);
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  await promisify(store.put(value, key));
};

export const deleteValue = async (storeName: string, key: string): Promise<void> => {
  const { db } = await ensureStore(storeName);
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  await promisify(store.delete(key));
};

/**
 * Test-only helper. Resets the cached handle so each test starts against the
 * fake-indexeddb instance reset in setupTests.ts.
 */
export const __resetIndexerDbForTests = (): void => {
  openRequest = null;
};
