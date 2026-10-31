'use client';
/* Libraries (design review 25 Oct, item 1): separate libraries for separate fields, switched like Arc's spaces.
 * - Each library is its own IndexedDB database (lib/db.ts), named in the registry. Libraries saved before the rename to
 *   Capsa keep their old database, read in place (lib/legacy.ts): a registry from then (v 1) is read with the old names,
 *   and with no registry at all the first library uses the old database if this browser has one (resolveDatabases).
 * - This registry sits outside every library, in localStorage: names, icons, colours, order, item counts, which one
 *   opens next, and the app-wide preferences (theme, icon style, shortcuts…), which every library shares.
 * - Free: FREE_LIBRARY_LIMIT libraries. Pro (not built yet) would lift it; a third shows the Pro sheet. */
import { useSyncExternalStore } from 'react';
import { DEFAULT_DB } from './db';
import { databaseExists, legacyDbName } from './legacy';
import type { Prefs } from './types';

/** Free plan: this many libraries. The one place the limit lives. */
export const FREE_LIBRARY_LIMIT = 2;
/** Pro's price in US dollars a month. Null hides every price in the app until Pro launches (Elvis, 28 Oct); set it then. */
export const PRO_PRICE_MONTHLY: number | null = null;

export const DEFAULT_LIBRARY = 'main';
export const LIB_COLORS = ['graphite', 'blue', 'teal', 'green', 'amber', 'violet', 'pink', 'brown'] as const;
export type LibColor = (typeof LIB_COLORS)[number];

export interface LibraryMeta {
  id: string;
  name: string;
  /** a GROUP_ICONS name or 'library' */
  icon: string;
  color: LibColor;
  createdAt: string;
  /** Library items, kept up to date by the store as it saves, so the switcher can show counts without opening each one. */
  count?: number;
  /** Its IndexedDB database. Unset only on the first library of a registry that resolveDatabases hasn't settled yet. */
  db?: string;
}
/** v 1: written before the rename (every library's database has the old name). v 2: each library names its database. */
interface Registry { v: 2; current: string; libs: LibraryMeta[]; app?: Partial<Prefs> }

const KEY = 'capsa-libraries';
/** Preferences that belong to the app, not to one library: they stay the same whichever library is open. */
export const APP_PREFS = ['theme', 'icons', 'look', 'keys', 'whatsNewSeen', 'readGithub', 'avatar', 'profileName', 'profileRole', 'profileCompany', 'avatarAlive'] as const satisfies readonly (keyof Prefs)[];
export type AppPrefs = Pick<Prefs, (typeof APP_PREFS)[number]>;

const first = (): LibraryMeta => ({ id: DEFAULT_LIBRARY, name: 'Your library', icon: 'library', color: 'graphite', createdAt: new Date(0).toISOString() });

function read(): Registry {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (Omit<Registry, 'v'> & { v: 1 | 2 }) | null;
    if (r && (r.v === 1 || r.v === 2) && Array.isArray(r.libs) && r.libs.length) {
      const libs = r.libs.filter(l => l && typeof l.id === 'string' && typeof l.name === 'string')
        .map(l => ({ ...l, color: (LIB_COLORS as readonly string[]).includes(l.color) ? l.color : 'graphite', icon: l.icon || 'library',
          ...(r.v === 1 ? { db: legacyDbName(l.id, l.id === DEFAULT_LIBRARY) } : {}) }));
      if (libs.length) return { ...r, v: 2, libs, current: libs.some(l => l.id === r.current) ? r.current : libs[0].id };
    }
  } catch { /* private mode or damaged: start from the default */ }
  return { v: 2, current: DEFAULT_LIBRARY, libs: [first()] };
}
function write(r: Registry) {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* private mode: this tab still works, nothing is remembered */ }
  cached = null;
  subs.forEach(f => f());
}

let cached: Registry | null = null;
const subs = new Set<() => void>();
const reg = () => (cached ??= read());
if (typeof window !== 'undefined') addEventListener('storage', e => { if (e.key === KEY) { cached = null; subs.forEach(f => f()); } });

export const subscribeLibraries = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const libraries = (): LibraryMeta[] => reg().libs;
/** The library that opens on the next load (the one this tab last switched to). */
export const savedCurrent = (): string => reg().current;
export const libraryById = (id: string) => reg().libs.find(l => l.id === id);
const newDbName = (id: string) => (id === DEFAULT_LIBRARY ? DEFAULT_DB : `${DEFAULT_DB}--${id}`);
/** A library's database: the one the registry names, else the new-install name. */
export const dbNameFor = (id: string) => libraryById(id)?.db ?? newDbName(id);

/** Settles the first library's database once, before the store opens it: with no registry from before (and none
 * naming it), the old database is used if this browser has one, so a library saved before the rename opens intact. */
export async function resolveDatabases(): Promise<void> {
  const unset = reg().libs.filter(l => !l.db);
  const old = unset.some(l => l.id === DEFAULT_LIBRARY) && (await databaseExists(legacyDbName(DEFAULT_LIBRARY, true)));
  const now = reg(); // re-read: another write may have landed while the probe ran
  let stored: { v?: number } | null = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* private mode or damaged */ }
  // written back once, so the stored registry names every database from now on (and a v 1 registry becomes v 2)
  if (unset.length || stored?.v !== 2) write({ ...now, libs: now.libs.map(l => (l.db ? l : { ...l, db: l.id === DEFAULT_LIBRARY && old ? legacyDbName(l.id, true) : newDbName(l.id) })) });
}
export const shadowKeyFor = (id: string) => (id === DEFAULT_LIBRARY ? 'capsa-state-shadow' : `capsa-state-shadow--${id}`);
export const canAddLibrary = () => reg().libs.length < FREE_LIBRARY_LIMIT;

export function setCurrent(id: string) { const r = reg(); if (r.current !== id && r.libs.some(l => l.id === id)) write({ ...r, current: id }); }

export function addLibrary(name: string, icon: string, color: LibColor): LibraryMeta | null {
  const r = reg();
  if (r.libs.length >= FREE_LIBRARY_LIMIT) return null;
  const id = `l-${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8)}`;
  const meta: LibraryMeta = { id, name: name.trim().slice(0, 40) || 'New library', icon, color, createdAt: new Date().toISOString(), count: 0, db: newDbName(id) };
  write({ ...r, libs: [...r.libs, meta] });
  return meta;
}

export function updateLibrary(id: string, change: Partial<Pick<LibraryMeta, 'name' | 'icon' | 'color' | 'count'>>) {
  const r = reg();
  const cur = r.libs.find(l => l.id === id);
  if (!cur) return;
  const next = { ...cur, ...change, ...(change.name !== undefined ? { name: change.name.trim().slice(0, 40) || cur.name } : {}) };
  if (JSON.stringify(next) === JSON.stringify(cur)) return;
  write({ ...r, libs: r.libs.map(l => (l.id === id ? next : l)) });
}

/** Takes a library out of the registry (its database is deleted by the store). The last library can't go. */
export function forgetLibrary(id: string): boolean {
  const r = reg();
  if (r.libs.length <= 1 || !r.libs.some(l => l.id === id)) return false;
  const libs = r.libs.filter(l => l.id !== id);
  write({ ...r, libs, current: r.current === id ? libs[0].id : r.current });
  return true;
}

export function moveLibrary(id: string, by: -1 | 1) {
  const r = reg();
  const i = r.libs.findIndex(l => l.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= r.libs.length) return;
  const libs = [...r.libs]; [libs[i], libs[j]] = [libs[j], libs[i]];
  write({ ...r, libs });
}

/** App-wide preferences, if any were saved yet (the first load after this update seeds them from the library). */
export const appPrefs = (): Partial<AppPrefs> | undefined => reg().app;
export function setAppPrefs(change: Partial<Prefs>) {
  const pick = Object.fromEntries(APP_PREFS.filter(k => k in change).map(k => [k, change[k]])) as Partial<AppPrefs>;
  if (!Object.keys(pick).length) return;
  const r = reg();
  const app = { ...(r.app ?? {}), ...pick };
  if (JSON.stringify(app) !== JSON.stringify(r.app ?? {})) write({ ...r, app });
}

const SERVER: LibraryMeta[] = [first()];
/** The libraries, for React (re-renders when one is added, renamed or removed, here or in another tab). */
export const useLibraries = () => useSyncExternalStore(subscribeLibraries, libraries, () => SERVER);
