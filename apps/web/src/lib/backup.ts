'use client';
/* Backup = one .zip with library.json (the whole state) and every image file. Restore merges or replaces.
 * Libraries (25 Oct): a backup is of the open library, named after it; restoring goes into the open library, whichever
 * library the backup was made from (older backups, made before libraries, restore the same way). */
import { db } from './db';
import { libraryById } from './libraries';
import { currentLibraryId, easelImageKeys, getState, replaceState, setPrefs, nowISO } from './store';
import type { AppState, Organise, TrashEntry } from './types';
import { unzip, zip, type ZipEntry } from './zip';

const safe = (k: string) => k.replace(/[^a-zA-Z0-9._-]/g, '_');
const slugOf = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'library';

/** The open library's name, as it appears in backup file names. */
export const libraryName = () => libraryById(currentLibraryId())?.name ?? 'Your library';
/** capsa-backup-<library>-<date>.zip */
export const backupFileName = (date = new Date()) => `capsa-backup-${slugOf(libraryName())}-${date.toISOString().slice(0, 10)}.zip`;

export async function makeBackup(): Promise<Blob> {
  const state = getState();
  const enc = new TextEncoder();
  // images: board references, and (Track A, 25 Oct) images kept in the Inbox to read their text
  const libImages = [...state.artifacts, ...state.trash.flatMap(t => (t.kind === 'artifact' ? [t.item] : []))].flatMap(a => [a.image?.key, a.image?.thumbKey]);
  // easels (25 Oct): their images, and those of easels in Deleted
  const keys = [...new Set([...state.references.flatMap(r => [r.imageKey, r.thumbKey]), ...state.sources.map(x => x.image?.key), ...libImages, ...easelImageKeys(state)])].filter((k): k is string => !!k);
  const files: ZipEntry[] = [];
  const blobIndex: Record<string, { name: string; type: string }> = {};
  for (const k of keys) {
    const b = await db.getBlob(k);
    if (!b) continue;
    const name = `blobs/${safe(k)}`;
    blobIndex[k] = { name, type: b.type };
    files.push({ name, data: new Uint8Array(await b.arrayBuffer()) });
  }
  const manifest = { app: 'Capsa web', format: 1, createdAt: nowISO(), library: libraryName(), counts: { sources: state.sources.length, artifacts: state.artifacts.length, boards: state.boards.length, references: state.references.length, easels: (state.easels ?? []).length, deleted: state.trash.length }, blobIndex };
  files.unshift(
    { name: 'library.json', data: enc.encode(JSON.stringify(state)) },
    { name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) },
  );
  setPrefs({ lastBackupAt: nowISO() });
  return zip(files);
}

export async function restoreBackup(file: Blob, mode: 'merge' | 'replace'): Promise<{ added: number }> {
  const entries = await unzip(file);
  const get = (n: string) => entries.find(e => e.name === n);
  const lib = get('library.json'), man = get('manifest.json');
  if (!lib || !man) throw new Error('This file isn’t a Capsa backup (library.json is missing).');
  const dec = new TextDecoder();
  const incoming = JSON.parse(dec.decode(lib.data)) as AppState;
  const cur0 = getState();
  // blobIndex values are { name, type } (older backups: just the name, so the type is unknown)
  const manifest = JSON.parse(dec.decode(man.data)) as { blobIndex: Record<string, string | { name: string; type: string }> };
  for (const [key, v] of Object.entries(manifest.blobIndex ?? {})) {
    const { name, type } = typeof v === 'string' ? { name: v, type: '' } : v;
    const e = get(name);
    if (e) await db.putBlob(key, new Blob([e.data as BlobPart], { type }));
  }
  // Stage 1 fields (starred, tags, uses, pinned tags) are optional, so older backups replace cleanly without them.
  // The GitHub reading switch is consent given on this device, so a backup never turns it on or off.
  if (mode === 'replace') { replaceState({ ...incoming, prefs: { ...incoming.prefs, readGithub: cur0.prefs.readGithub } }); return { added: incoming.references.length + incoming.artifacts.length + (incoming.easels?.length ?? 0) }; }
  const cur = getState();
  const mergeById = <T extends { id: string }>(a: T[], b: T[]) => { const ids = new Set(a.map(x => x.id)); const add = b.filter(x => !ids.has(x.id)); return { list: [...a, ...add], added: add.length }; };
  const parts = {
    sources: mergeById(cur.sources, incoming.sources ?? []), artifacts: mergeById(cur.artifacts, incoming.artifacts ?? []),
    projects: mergeById(cur.projects, incoming.projects ?? []), collections: mergeById(cur.collections, incoming.collections ?? []),
    boards: mergeById(cur.boards, incoming.boards ?? []), references: mergeById(cur.references, incoming.references ?? []),
    // easels (25 Oct), merged by id like boards; backups from before have none
    easels: mergeById(cur.easels ?? [], Array.isArray(incoming.easels) ? incoming.easels.filter(e => e && typeof e.id === 'string' && Array.isArray(e.items)) : []),
  };
  // Pinned tags (Stage 1) are merged too; backups made before tags existed simply have none.
  const pins = [...(cur.prefs.pinnedTags ?? [])];
  for (const t of incoming.prefs?.pinnedTags ?? []) if (!pins.some(p => p.toLowerCase() === t.toLowerCase())) pins.push(t);
  // Deleted (24 Oct): entries the device doesn't have yet are added, unless that item is live here (backups before 24 Oct have none)
  const live = (t: TrashEntry) => (t.kind === 'source' ? parts.sources.list : t.kind === 'easel' ? parts.easels.list : parts.artifacts.list).some(x => x.id === t.item.id);
  const inTrash = (t: TrashEntry) => cur.trash.some(x => x.kind === t.kind && x.item.id === t.item.id);
  const moreTrash = (Array.isArray(incoming.trash) ? incoming.trash : []).filter(t => t?.item && !live(t) && !inTrash(t));
  // Imports (Track A, 25 Oct): records the device doesn't have are added (backups before 25 Oct have none)
  const imports = [...(cur.imports ?? []), ...(Array.isArray(incoming.imports) ? incoming.imports : []).filter(b => b?.id && !(cur.imports ?? []).some(x => x.id === b.id)).map(b => (b.state === 'running' ? { ...b, state: 'paused' as const } : b))];
  // Track B (25 Oct): smart collections, saved searches, filing rules, domains and dismissals merge in; backups before them have none
  const organise = mergeOrganise(cur.organise, incoming.organise);
  replaceState({ ...cur, ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.list])), trash: [...cur.trash, ...moreTrash], prefs: { ...cur.prefs, pinnedTags: pins }, ...(imports.length ? { imports } : {}), ...(organise ? { organise } : {}) } as AppState);
  return { added: Object.values(parts).reduce((a, v) => a + v.added, 0) };
}

/** Merges a backup's organise data into this device's: records by id, lists without repeats; this device's last project stays. */
function mergeOrganise(cur?: Organise, inc?: Organise): Organise | undefined {
  if (!inc || typeof inc !== 'object') return cur;
  const byId = <T extends { id: string }>(a?: T[], b?: unknown) => [...(a ?? []), ...(Array.isArray(b) ? (b as T[]) : []).filter(x => x && typeof x.id === 'string' && !(a ?? []).some(y => y.id === x.id))];
  const strs = (a?: string[], b?: unknown) => [...new Set([...(a ?? []), ...(Array.isArray(b) ? b.filter((x): x is string => typeof x === 'string') : [])])];
  const c = cur ?? {};
  return {
    ...c,
    smart: byId(c.smart, inc.smart), searches: byId(c.searches, inc.searches), rules: byId(c.rules, inc.rules), types: byId(c.types, inc.types),
    domains: strs(c.domains, inc.domains), notDupes: strs(c.notDupes, inc.notDupes), keep: strs(c.keep, inc.keep),
  };
}
