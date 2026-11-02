import type { RunReport, SavedAnswer } from '../shared/types';
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('formpilot-local', 2);
    request.onupgradeneeded = () => {
      for (const name of ['answers', 'reports'])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      database = undefined;
      reject(new Error('Could not open local history.'));
    };
    request.onblocked = () => {
      database = undefined;
      reject(new Error('Close other FormPilot pages and try again.'));
    };
  }));
}
async function transaction<T>(
  name: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(name, mode);
    const req = operation(tx.objectStore(name));
    let result: T;
    req.onsuccess = () => {
      result = req.result;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(new Error('Could not update local history.'));
    tx.onabort = () => reject(new Error('Local history operation was cancelled.'));
  });
}
function store<T extends { id: string }>(name: string) {
  return {
    list: () => transaction(name, 'readonly', (s) => s.getAll()) as Promise<T[]>,
    save: (value: T) => transaction(name, 'readwrite', (s) => s.put(value)),
    remove: (id: string) => transaction(name, 'readwrite', (s) => s.delete(id)),
    clear: () => transaction(name, 'readwrite', (s) => s.clear()),
  };
}
export const memory = store<SavedAnswer>('answers');
export const reports = store<RunReport>('reports');
