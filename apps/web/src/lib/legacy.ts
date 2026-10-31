/* Names from before the rename to Capsa (29 Oct 2026, issue #113). The app was called LibraryKit until then; nothing a
 * person saved under the old names is left behind:
 * - localStorage and sessionStorage: every key under the old prefix moves to the new one on each page load, before
 *   anything reads it (KEYS_SCRIPT runs first in app/layout.tsx). A key already under the new name wins.
 * - IndexedDB: a library saved before the rename keeps its database and is read in place. lib/libraries.ts records each
 *   library's database; registries from before the rename (v 1) and a first library with no registry get the old names.
 * - Backups made before the rename still restore (lib/backup.ts reads any library.json with a manifest), and the MCP
 *   server and the CLI still read the old library file name and format id (packages/capsa-mcp/library.mjs).
 * This is the one place in the app the old names live. */

/** The first library's database before the rename; other libraries were `${LEGACY_DB}--<id>`. */
export const LEGACY_DB = 'librarykit-web';
export const legacyDbName = (id: string, first: boolean) => (first ? LEGACY_DB : `${LEGACY_DB}--${id}`);

const OLD_PREFIX = 'lk-';
const NEW_PREFIX = 'capsa-';

/** Moves old-prefix keys to the new prefix in both storages. Inline in the page head (no imports), so it is a string. */
export const KEYS_SCRIPT = `try{[localStorage,sessionStorage].forEach(function(S){var o='${OLD_PREFIX}',n='${NEW_PREFIX}',a=[],i,k;for(i=0;i<S.length;i++){k=S.key(i);if(k&&k.indexOf(o)===0)a.push(k)}a.forEach(function(k){try{var t=n+k.slice(o.length);if(S.getItem(t)===null)S.setItem(t,S.getItem(k));S.removeItem(k)}catch(e){}})})}catch(e){}`;

/** Whether a database exists, without creating it: databases() where the browser has it, else an open that is
 * aborted if it would create one (an aborted first upgrade leaves no database behind). */
export async function databaseExists(name: string): Promise<boolean> {
  try {
    if (typeof indexedDB.databases === 'function') return (await indexedDB.databases()).some(d => d.name === name);
  } catch { /* fall through to the probe */ }
  return new Promise<boolean>(resolve => {
    let fresh = false;
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(name); } catch { resolve(false); return; }
    req.onupgradeneeded = e => { if (e.oldVersion === 0) { fresh = true; req.transaction?.abort(); } };
    req.onsuccess = () => { req.result.close(); resolve(!fresh); };
    req.onerror = () => resolve(false);
    req.onblocked = () => resolve(true); // open elsewhere with another version: it exists
  });
}
