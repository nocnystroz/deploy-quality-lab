import type { Series, TestProfile } from './types';

const DB_NAME = 'deploy-speed-tester';
const VERSION = 1;
type Store = 'profiles' | 'series';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('series')) {
        const store = db.createObjectStore('series', { keyPath: 'id' });
        store.createIndex('profileId', 'profileId');
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function request<T>(store: Store, mode: IDBTransactionMode, operation: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const req = operation(transaction.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export const db = {
  profiles: {
    list: () => request<TestProfile[]>('profiles', 'readonly', s => s.getAll()),
    put: (profile: TestProfile) => request<IDBValidKey>('profiles', 'readwrite', s => s.put(profile)),
    delete: (id: string) => request<undefined>('profiles', 'readwrite', s => s.delete(id))
  },
  series: {
    list: () => request<Series[]>('series', 'readonly', s => s.getAll()),
    put: (series: Series) => request<IDBValidKey>('series', 'readwrite', s => s.put(series)),
    delete: (id: string) => request<undefined>('series', 'readwrite', s => s.delete(id)),
    clear: () => request<undefined>('series', 'readwrite', s => s.clear()),
    /** Retains the newest series records and their artifacts. */
    prune: async (keep: number) => {
      const all = await request<Series[]>('series', 'readonly', s => s.getAll());
      const expired = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(Math.max(0, keep));
      await Promise.all(expired.map(item => request<undefined>('series', 'readwrite', s => s.delete(item.id))));
      return expired.length;
    }
  }
};
