/* Tiny IndexedDB wrapper. Everything stays in this browser on this device (v1 has no server).
 * Libraries (25 Oct): each library is its own database. lib/libraries.ts names each one and says which is in use; a
 * library saved before the rename to Capsa keeps its old database (lib/legacy.ts). */
interface StoredBytes { t: string; d: ArrayBuffer }

/** The first library's database on a new install; other libraries are `${DEFAULT_DB}--<id>`. */
export const DEFAULT_DB = 'capsa-web';
const DB_VERSION = 1;

/** The database this tab reads and writes now (lib/store.ts switches it). */
let dbName = DEFAULT_DB;
/** Open connections by name. A switch leaves the old one open, so a write already under way still lands where it began. */
const conns = new Map<string, Promise<IDBDatabase>>();

/** Make another library's database the open one (lib/store.ts, at the moment it swaps the state). */
export function selectDatabase(name: string) { dbName = name; }
export const currentDatabase = () => dbName;

/** Deletes a library's database (closing this tab's connection to it first). */
export async function deleteDatabase(name: string): Promise<void> {
  const c = conns.get(name);
  conns.delete(name);
  if (c) { try { (await c).close(); } catch { /* never opened */ } }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // another tab still has it open; the browser deletes it once that tab lets go
  });
}

function open(name: string): Promise<IDBDatabase> {
  const have = conns.get(name);
  if (have) return have;
  const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); conns.delete(name); }; resolve(db); };
    req.onerror = () => { conns.delete(name); reject(req.error); };
    req.onblocked = () => { conns.delete(name); reject(new Error('The database is open in another tab with an older version.')); };
  });
  conns.set(name, dbPromise);
  return dbPromise;
}

function run<T>(name: string, store: 'state' | 'blobs', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open(name).then(db => new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  }));
}

/** One library's database. The store binds its loads and saves to the library they belong to, so a save that was
 * waiting when you switched still lands in the library it came from, never in the one you switched to. */
export function dbFor(name: string) {
  return {
    name,
    getState: <T>() => run<T>(name, 'state', 'readonly', s => s.get('app') as IDBRequest<T>),
    putState: (value: unknown) => run(name, 'state', 'readwrite', s => { s.put(value, 'app'); }),
    // Images are stored as raw bytes plus their type, not as Blob values: Safari Private windows refuse Blobs,
    // and Safari invalidates a Blob read back from a record once that record is deleted (breaking Undo).
    getBlob: async (key: string): Promise<Blob | undefined> => {
      const v = await run<StoredBytes | Blob>(name, 'blobs', 'readonly', s => s.get(key) as IDBRequest<StoredBytes | Blob>);
      if (!v) return undefined;
      return v instanceof Blob ? v : new Blob([v.d], { type: v.t });
    },
    putBlob: async (key: string, blob: Blob) => {
      const value: StoredBytes = { t: blob.type, d: await blob.arrayBuffer() }; // read before the transaction opens
      return run(name, 'blobs', 'readwrite', s => { s.put(value, key); });
    },
    deleteBlob: (key: string) => run(name, 'blobs', 'readwrite', s => { s.delete(key); }),
    allBlobKeys: () => run<IDBValidKey[]>(name, 'blobs', 'readonly', s => s.getAllKeys()),
    clearAll: () => Promise.all([run(name, 'state', 'readwrite', s => { s.clear(); }), run(name, 'blobs', 'readwrite', s => { s.clear(); })]),
  };
}
export type LibraryDb = ReturnType<typeof dbFor>;

/** The open library's database (images, boards and backups use this; it follows a switch). */
export const db: Omit<LibraryDb, 'name'> = {
  getState: <T>() => dbFor(dbName).getState<T>(),
  putState: (value: unknown) => dbFor(dbName).putState(value),
  getBlob: (key: string) => dbFor(dbName).getBlob(key),
  putBlob: (key: string, blob: Blob) => dbFor(dbName).putBlob(key, blob),
  deleteBlob: (key: string) => dbFor(dbName).deleteBlob(key),
  allBlobKeys: () => dbFor(dbName).allBlobKeys(),
  clearAll: () => dbFor(dbName).clearAll(),
};

export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch { return null; }
}
