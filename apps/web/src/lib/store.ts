'use client';
/* Capsa web v1: app state.
 * One in-memory state object, persisted to IndexedDB (debounced) and shared through useSyncExternalStore.
 * All mutations go through the actions below so screens never reach into state directly.
 * Rules carried over from the 20 Oct audit: filing is idempotent (AUD-01), nothing is destroyed
 * silently (AUD-02/03), an edit is recorded only if something changed (AUD-04). */
import { useSyncExternalStore } from 'react';
import { db, dbFor, deleteDatabase, selectDatabase, type LibraryDb } from './db';
import {
  APP_PREFS, appPrefs, dbNameFor, DEFAULT_LIBRARY, forgetLibrary, libraries, libraryById, resolveDatabases, savedCurrent, setAppPrefs, setCurrent, shadowKeyFor, updateLibrary,
} from './libraries';
import { DEMO } from './demo-data';
import { demoTrash } from './demo-trash';
import { describeLink, findPieces, lineRange, normalisePaste, type CaptureMode } from './capture/extract';
import { parseGithub, piecesFromFiles, readGithub } from './capture/github';
import { candidateCautions, withCautions } from './capture/cautions';
import { findSensitive, maskSensitive } from './capture/sensitive';
import { canonicalUrl, findSavedLink } from './capture/links';
import { FORMAT_LABEL, parseTranscript, transcriptPieces, type Transcript } from './capture/transcript';
import type { DocPiece, DocSegment } from './capture/documents';
import { piecesFromNotes, type ImportLink, type ImportPrompt, type TextFile } from './imports/parse';
import { fileByRules } from './organise';
import type {
  AppState, Artifact, Board, BoardSection, Candidate, Easel, EmbedProvider, Prefs, Reference, Region, Source, Swatch, TimedNote, TrashEntry, TrashFrom, Use,
} from './types';
import type { ArtifactType, Evidence, ImportBatch } from './types';

export const uid = (p = '') => p + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
export const nowISO = () => new Date().toISOString();

const EMPTY: AppState = {
  v: 1, sources: [], artifacts: [], projects: [], collections: [], boards: [], references: [], easels: [], trash: [],
  prefs: { theme: 'system', reviewView: 'auto' }, seededDemo: false,
};

let state: AppState = EMPTY;
let hydrated = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveError: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function demoState(): AppState {
  const mark = <T extends object>(xs: T[]) => xs.map(x => ({ ...structuredClone(x), demo: true }));
  return {
    ...EMPTY,
    sources: mark(DEMO.sources),
    artifacts: mark(DEMO.artifacts),
    projects: mark(DEMO.projects),
    collections: mark(DEMO.collections),
    trash: demoTrash(),
    seededDemo: true,
  };
}

/* Libraries (25 Oct): the store holds the open library; lib/libraries.ts keeps the list and the app-wide prefs. */
let libId = DEFAULT_LIBRARY;
/** The open library's database. Its loads and saves are bound to it, so they never land in another library. */
let libDb: LibraryDb = dbFor(dbNameFor(DEFAULT_LIBRARY));
/** The open library couldn't be read. Its data may be fine, just unreadable right now, so nothing is written over it
 * (no save, no closing copy, no image sweep) until a library loads cleanly. */
let loadFailed = false;
export const currentLibraryId = () => libId;
/** Synchronous copy written as the page closes; IndexedDB writes started during unload can be abandoned. One per library. */
function readShadow(id: string): AppState | null {
  try { const v = localStorage.getItem(shadowKeyFor(id)); return v ? (JSON.parse(v) as AppState) : null; } catch { return null; }
}
function clearShadow(id: string) { try { localStorage.removeItem(shadowKeyFor(id)); } catch { /* private mode */ } }

/** The app-wide prefs (theme, icon style, shortcuts…) over a library's own. */
function withAppPrefs(p: Prefs): Prefs {
  const app = appPrefs();
  if (!app) return p;
  const out = { ...p };
  for (const k of APP_PREFS) { if (k in app) (out as Record<string, unknown>)[k] = app[k]; else delete (out as Record<string, unknown>)[k]; }
  return out;
}

/** One load per page, however many times it's called (React runs effects twice in development, and a second load
 * finishing after the first would put back the saved state over changes made in between). */
let hydrating: Promise<void> | null = null;
export function hydrate(): Promise<void> { return (hydrating ??= hydrateOnce()); }
async function hydrateOnce(): Promise<void> {
  if (hydrated) return;
  await resolveDatabases().catch(() => { /* storage blocked: the load below reports it */ });
  libId = savedCurrent();
  libDb = dbFor(dbNameFor(libId));
  selectDatabase(libDb.name);
  try {
    state = await loadLibrary(libId, libDb);
    // the first load after libraries arrived: this library's prefs become the app-wide ones
    if (!appPrefs()) setAppPrefs(state.prefs);
    noteCount();
  } catch (e) {
    state = { ...EMPTY, seededDemo: true };
    loadFailed = true;
    saveError = 'This browser blocked local storage, so nothing will be kept after you close the tab.';
  }
  hydrated = true;
  emit();
  // only after a clean load: a library that failed to load must never look like one with no images
  if (!loadFailed) void sweepLibraryImages().catch(() => { /* storage blocked: nothing to sweep */ });
  // Write immediately when the tab is hidden or closed, so the last change within the debounce isn't lost.
  addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
}

/** Reads a library from its database, tidied as every load is. */
async function loadLibrary(id: string, d: LibraryDb): Promise<AppState> {
  let saved = await d.getState<AppState>();
  const shadow = readShadow(id);
  if (shadow && shadow.v === 1 && (shadow._at ?? 0) > (saved?._at ?? 0)) { saved = shadow; await d.putState(shadow); }
  clearShadow(id);
  // A first visit starts empty ("Try with sample data" adds the labelled demo). Existing libraries keep what they have.
  // capsa-first-run=sample (set by the verify suites before the first load) starts the first library with the demo instead.
  const sample = id === DEFAULT_LIBRARY && (() => { try { return localStorage.getItem('capsa-first-run') === 'sample'; } catch { return false; } })();
  let next: AppState = saved && saved.v === 1 ? { ...EMPTY, ...saved, trash: cleanTrash(saved.trash), prefs: cleanPrefs({ ...EMPTY.prefs, ...saved.prefs }) } : sample ? demoState() : { ...EMPTY, seededDemo: true };
  next = { ...next, prefs: withAppPrefs(next.prefs) };
  forgetPixelStyle();
  // Settings › Deleted › "After 30 days": entries deleted more than 30 days ago go on load
  const kept = expireTrash(next);
  const purged = kept.length !== next.trash.length;
  if (purged) next = { ...next, trash: kept };
  if (purged || (saved && JSON.stringify(saved.prefs) !== JSON.stringify(next.prefs) && 'style' in (saved.prefs ?? {}))) await d.putState({ ...next, _at: Date.now() });
  if (!saved) await d.putState(next);
  return next;
}

/** Waits until nothing is waiting to be saved and no save is under way. */
async function settle() {
  while (saveTimer || writing) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await write(); }
    else await writing;
  }
}

/** Switch to another library: what's waiting to be saved is written to this one first, then the other is read. */
let switching: Promise<boolean> | null = null;
export function switchLibrary(id: string): Promise<boolean> {
  return (switching ??= (async () => {
    try {
      if (id === libId || !libraryById(id)) return false;
      await settle();
      const to = dbFor(dbNameFor(id));
      const next = await loadLibrary(id, to); // if this fails, nothing has changed: we stay where we were
      await settle(); // a change made here while the other library loaded is saved here first
      libId = id; libDb = to; selectDatabase(to.name); state = next; saveError = null; loadFailed = false;
      setCurrent(id);
      noteCount();
      emit();
      void sweepLibraryImages().catch(() => { /* storage blocked: nothing to sweep */ });
      return true;
    } catch {
      return false;
    } finally { switching = null; }
  })());
}

/** Deletes a library and everything in it (its database). The open one switches to another library first. */
export async function deleteLibrary(id: string): Promise<boolean> {
  if (libraries().length <= 1 || !libraryById(id)) return false;
  if (id === libId) { const other = libraries().find(l => l.id !== id)!; if (!(await switchLibrary(other.id))) return false; }
  const name = dbNameFor(id); // read before the registry forgets it
  forgetLibrary(id);
  clearShadow(id);
  await deleteDatabase(name);
  return true;
}

/** Keeps the switcher's item count for this library current. */
function noteCount() { const l = libraryById(libId); if (l && l.count !== state.artifacts.length) updateLibrary(libId, { count: state.artifacts.length }); }

function flush(unloading = false) {
  if (unloading && !loadFailed && (saveTimer || writing)) {
    // localStorage is synchronous, so this copy survives even if the IndexedDB write below is cut off
    try { localStorage.setItem(shadowKeyFor(libId), JSON.stringify({ ...state, _at: Date.now() })); } catch { /* too big or private mode */ }
  }
  if (!saveTimer) return;
  clearTimeout(saveTimer); saveTimer = null;
  write();
}

let writing: Promise<void> | null = null;
function write(): Promise<void> {
  if (loadFailed) return Promise.resolve();
  const d = libDb, snapshot = state; // this library's state, to this library's database
  const box: { run?: Promise<void> } = {};
  const run = box.run = (async () => {
    try { await d.putState({ ...snapshot, _at: Date.now() }); saveError = null; noteCount(); }
    catch (e) { saveError = e instanceof DOMException && e.name === 'QuotaExceededError'
      ? 'This device is out of space for Capsa. Back up and remove some references.'
      : 'Couldn’t save to this device. Your last change may not be kept.'; }
    finally { if (writing === box.run) writing = null; }
    emit();
  })();
  writing = run;
  return run;
}

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; write(); }, 250);
}

function set(next: AppState) { state = next; emit(); persist(); }
function patch(fn: (s: AppState) => AppState) { set(fn(state)); }

export function getState() { return state; }
export function useAppState(): { state: AppState; ready: boolean; saveError: string | null } {
  const s = useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => EMPTY,
  );
  return { state: s, ready: hydrated, saveError };
}
export const useHydrated = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => hydrated, () => false);

/* ---------------- selectors ---------------- */
export const sourceById = (s: AppState, id: string) => s.sources.find(x => x.id === id);
export const artifactById = (s: AppState, id: string) => s.artifacts.find(x => x.id === id);
export const boardById = (s: AppState, id: string) => s.boards.find(x => x.id === id);
export const referencesOf = (s: AppState, boardId: string) =>
  s.references.filter(r => r.boardId === boardId).sort((a, b) => a.order - b.order);
/** Candidates still waiting for a decision (not kept, not skipped). */
export const pendingCandidates = (src: Source) =>
  (src.candidates ?? []).filter(c => !(src.keptIds ?? []).includes(c.id) && !(src.skippedIds ?? []).includes(c.id));
export const inboxCount = (s: AppState) => s.sources.filter(x => ['review', 'needs_thread', 'failed', 'queued', 'processing'].includes(x.status) && !isSnoozed(x)).length;
/** REV-08 (Track C): snoozed until a time still to come. After it, the source is back as it was. */
export const isSnoozed = (src: Source, now = Date.now()) => !!src.snoozedUntil && +new Date(src.snoozedUntil) > now;

/* ---------------- review actions ---------------- */
const filing = new Set<string>(); // AUD-01: re-entry guard per source

const updateSource = (id: string, fn: (src: Source) => Source) =>
  patch(s => ({ ...s, sources: s.sources.map(x => (x.id === id ? fn(x) : x)) }));

/** File the chosen candidates as artifacts; the rest become skipped (restorable). Returns an undo function. */
export function fileCandidates(sourceId: string, chosenIds: string[], via: 'review' | 'capture' = 'review'): (() => void) | null {
  if (filing.has(sourceId)) return null;
  const src = sourceById(state, sourceId);
  if (!src) return null;
  filing.add(sourceId);
  try {
    const pending = pendingCandidates(src);
    const chosen = pending.filter(c => chosenIds.includes(c.id));
    const skippedNow = pending.filter(c => !chosenIds.includes(c.id)).map(c => c.id);
    const existing = new Set(state.artifacts.map(a => a.candidateId).filter(Boolean));
    const created: Artifact[] = chosen.filter(c => !existing.has(c.id)).map(c => fileByRules(state, src, candidateToArtifact(src, c, via))); // CUR-08: filing rules
    patch(s => ({
      ...s,
      artifacts: [...created, ...s.artifacts],
      sources: s.sources.map(x => x.id !== sourceId ? x : {
        ...x,
        keptIds: [...new Set([...(x.keptIds ?? []), ...chosen.map(c => c.id)])],
        skippedIds: [...new Set([...(x.skippedIds ?? []), ...skippedNow])],
        status: 'reviewed',
      }),
    }));
    const createdIds = created.map(a => a.id);
    return () => patch(s => ({
      ...s,
      artifacts: s.artifacts.filter(a => !createdIds.includes(a.id)),
      sources: s.sources.map(x => x.id !== sourceId ? x : {
        ...x,
        keptIds: (x.keptIds ?? []).filter(id => !chosen.some(c => c.id === id)),
        skippedIds: (x.skippedIds ?? []).filter(id => !skippedNow.includes(id)),
        status: 'review',
      }),
    }));
  } finally {
    filing.delete(sourceId);
  }
}

function candidateToArtifact(src: Source, c: Candidate, via: 'review' | 'capture' = 'review'): Artifact {
  return {
    id: uid('a-'), candidateId: c.id, type: c.type, title: c.title, purpose: c.purpose, exact: c.exact ?? null,
    evidence: c.evidence, sourceId: src.id, domains: c.domains ?? [], useCases: [],
    // the destination picked in the capture box ("to Library ▾"), if it still exists
    projects: (src.target?.projects ?? []).filter(id => state.projects.some(p => p.id === id)),
    collections: (src.target?.collections ?? []).filter(id => state.collections.some(c => c.id === id)),
    savedAt: nowISO(), review: c.edited ? 'edited' : 'accepted',
    history: [{ when: nowISO(), what: via === 'capture' ? 'Kept when captured' : c.edited ? 'Edited during review, then kept' : 'Kept from review board' }], demo: src.demo,
  };
}

/** Change a candidate during review. Records nothing if the values are unchanged (AUD-04). */
export function updateCandidate(sourceId: string, candidateId: string, change: Partial<Candidate>): boolean {
  const src = sourceById(state, sourceId);
  const c = src?.candidates?.find(x => x.id === candidateId);
  if (!src || !c) return false;
  const changed = Object.entries(change).some(([k, v]) => JSON.stringify((c as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v));
  if (!changed) return false;
  const edited = 'title' in change || 'purpose' in change || 'exact' in change || 'type' in change;
  updateSource(sourceId, x => ({ ...x, candidates: (x.candidates ?? []).map(y => (y.id === candidateId ? { ...y, ...change, edited: y.edited || edited } : y)) }));
  return true;
}

export function confirmMoment(sourceId: string, candidateId: string, t?: string) {
  updateSource(sourceId, x => ({
    ...x,
    candidates: (x.candidates ?? []).map(y => y.id !== candidateId || !y.evidence ? y
      : { ...y, evidence: { ...y.evidence, t: t ?? y.evidence.t, confirmed: true } }),
  }));
}

/** Put skipped candidates back into review (merges; never overwrites, AUD-03). */
export function restoreSkipped(sourceId: string) {
  updateSource(sourceId, x => ({ ...x, skippedIds: [], status: pendingOrAll(x) ? 'review' : x.status }));
}
const pendingOrAll = (x: Source) => (x.candidates ?? []).some(c => !(x.keptIds ?? []).includes(c.id));

/** Keep only the link. Existing candidates are skipped, not deleted, so Undo and Restore work (AUD-02). */
export function saveLinkOnly(sourceId: string): () => void {
  const before = structuredClone(sourceById(state, sourceId));
  updateSource(sourceId, x => ({
    ...x, status: 'bookmark',
    skippedIds: [...new Set([...(x.skippedIds ?? []), ...pendingCandidates(x).map(c => c.id)])],
  }));
  return () => { if (before) updateSource(sourceId, () => before); };
}

/** Mark a source as having nothing worth keeping (Inbox drag to "Nothing"). Pending candidates move to skippedIds, so
 * nothing is deleted. Returns an undo that restores the exact previous source; a no-op when the source has gone. */
export function markNothing(sourceId: string): () => void {
  const before = structuredClone(sourceById(state, sourceId));
  if (!before) return () => {};
  updateSource(sourceId, x => ({
    ...x, status: 'nothing', nothingReason: 'marked',
    skippedIds: [...new Set([...(x.skippedIds ?? []), ...pendingCandidates(x).map(c => c.id)])],
  }));
  return () => updateSource(sourceId, () => before);
}

/** Put a source back into review: skipped candidates come back, kept ones stay in the Library. Returns null (and changes
 * nothing) when no candidate outside keptIds would be left to review, or when the source has gone. */
export function reopenSource(sourceId: string): (() => void) | null {
  const before = structuredClone(sourceById(state, sourceId));
  if (!before) return null;
  const kept = new Set(before.keptIds ?? []);
  if (!(before.candidates ?? []).some(c => !kept.has(c.id))) return null;
  updateSource(sourceId, x => ({ ...x, status: 'review', skippedIds: [] }));
  return () => updateSource(sourceId, () => before);
}

/** Send a source back to Processing to be read again (Inbox drag). Candidates are kept, so a later move to Ready to
 * review brings them back. Returns an undo that restores the exact previous source; null when the source has gone. */
export function requeueSource(sourceId: string): (() => void) | null {
  const before = structuredClone(sourceById(state, sourceId));
  if (!before) return null;
  updateSource(sourceId, x => ({ ...x, status: 'queued' }));
  return () => updateSource(sourceId, () => before);
}

export function captureLink(input: { url?: string; text?: string; note?: string; target?: Source['target']; title?: string }): Source {
  const isUrl = !!input.url;
  let info: ReturnType<typeof describeLink> | null = null;
  try { info = isUrl ? describeLink(input.url!) : null; } catch { /* invalid URLs are rejected by the form */ }
  const src: Source = {
    id: uid('s-'), kind: info?.kind ?? 'manual',
    // a readable title and the site, read from the address only (nothing is fetched)
    title: input.title?.replace(/\s+/g, ' ').trim().slice(0, 200) || (info ? info.title : (input.text ?? '').slice(0, 80) || 'Untitled note'),
    url: input.url, displayUrl: info?.display,
    savedAt: nowISO(), status: 'queued', description: input.note,
    minimalQuote: isUrl ? undefined : input.text, target: input.target,
  };
  patch(s => ({ ...s, sources: [src, ...s.sources] }));
  return src;
}

/** Pasted text, split into candidates on this device by plain rules (no AI, nothing sent anywhere). Each candidate keeps
 * its exact words as evidence. With candidates the source is ready to review; without, it's kept as a note. */
export function capturePaste(raw: string, mode: CaptureMode = 'auto', target?: Source['target']): Source {
  const text = normalisePaste(raw).trim();
  const tr = mode === 'auto' ? parseTranscript(text) : null; // EXT-05: a pasted transcript gives time-linked finds
  if (tr) return captureTranscript(tr, target);
  const pieces = findPieces(text, mode);
  const many = pieces.length > 1;
  const candidates: Candidate[] = pieces.map(p => ({
    id: uid('c-'), type: p.type, title: p.title, exact: p.exact, domains: [], defaultSelected: true,
    evidence: { method: 'text_span', quote: p.exact, segId: 'paste', locator: many ? `from what you pasted, ${lineRange(text, p.start, p.end)}` : 'from what you pasted' },
    note: `Found on this device by simple rules, not AI. ${p.why}`, ...withCautions(p.exact),
  }));
  const first = pieces[0];
  const src: Source = {
    id: uid('s-'), kind: 'manual', author: 'You', url: null, displayUrl: 'Pasted into the capture box', savedAt: nowISO(),
    title: !first ? text.replace(/\s+/g, ' ').slice(0, 80) : many ? `${first.title} and ${pieces.length - 1} more` : first.title,
    access: 'excerpt_user_supplied', status: candidates.length ? 'review' : 'nothing', nothingReason: candidates.length ? undefined : 'paste_none',
    segments: [{ id: 'paste', label: 'What you pasted', text }], candidates, extraction: 'on_device', target,
    minimalQuote: candidates.length ? undefined : text,
  };
  patch(s => ({ ...s, sources: [src, ...s.sources] }));
  return src;
}

/** A note: kept as written, nothing extracted (Capture › Note). */
export function captureNote(text: string, target?: Source['target']): Source {
  const t = normalisePaste(text).trim();
  const src: Source = {
    id: uid('s-'), kind: 'manual', author: 'You', url: null, displayUrl: 'Written in Capture', savedAt: nowISO(),
    title: t.replace(/\s+/g, ' ').slice(0, 80) || 'Untitled note', access: 'excerpt_user_supplied', status: 'nothing', nothingReason: 'note',
    segments: [{ id: 'paste', label: 'Your note', text: t }], candidates: [], extraction: 'on_device', target, minimalQuote: t,
  };
  patch(s => ({ ...s, sources: [src, ...s.sources] }));
  return src;
}

/** Capture text. Exactly one clear prompt goes straight to the Library (and the chosen collection or project); several
 * finds, or none, wait in the Inbox. Returns the source, the kept item if any, and one Undo for the whole capture. */
export function captureText(raw: string, mode: CaptureMode = 'auto', target?: Source['target']): { src: Source; kept?: Artifact; undo: () => void } {
  const src = capturePaste(raw, mode, target);
  const only = src.candidates?.length === 1 ? src.candidates[0] : undefined;
  if (only && only.type === 'prompt') {
    const unfile = fileCandidates(src.id, [only.id], 'capture');
    const kept = state.artifacts.find(a => a.candidateId === only.id);
    return { src, kept, undo: () => { unfile?.(); deleteSource(src.id); } };
  }
  return { src, undo: () => { deleteSource(src.id); } };
}

/** Reads a GitHub link's README / SKILL.md (Stage 2). Only runs when the user switched reading on in Settings and asked
 * for this source; otherwise it refuses without contacting anyone. */
export async function readGithubSource(id: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean; message: string }> {
  const src = sourceById(state, id);
  if (!src || src.kind !== 'github' || !src.url) return { ok: false, message: 'This isn’t a GitHub link.' };
  if (!state.prefs.readGithub) return { ok: false, message: 'Reading public GitHub links is off. Switch it on in Settings first.' };
  const t = parseGithub(src.url);
  if (!t) return { ok: false, message: 'That doesn’t look like a GitHub repository link.' };
  if (src.status === 'processing') return { ok: false, message: 'Already reading this link.' };
  updateSource(id, x => ({ ...x, status: 'processing' }));
  const r = await readGithub(t, fetchImpl);
  if (!r.ok) {
    updateSource(id, x => ({ ...x, status: r.status, failReason: r.status === 'failed' ? r.reason : undefined, nothingReason: r.status === 'nothing' ? 'github_none' : undefined }));
    return { ok: false, message: r.reason };
  }
  const { pieces, capped } = piecesFromFiles(r.files);
  const candidates: Candidate[] = pieces.map(p => ({
    id: uid('c-'), type: p.type, title: p.title, exact: p.exact, domains: [], defaultSelected: true,
    evidence: { method: 'text_span', quote: p.exact, segId: p.segId, locator: p.locator },
    note: `Found on this device by simple rules, not AI, in ${p.file} from GitHub. ${p.why}`, ...withCautions(p.exact),
  }));
  updateSource(id, x => ({
    ...x, author: x.author ?? t.owner, access: 'full_permitted', extraction: 'on_device', failReason: undefined,
    segments: r.files.map((f, i) => ({ id: `gh-${i}`, label: f.path, text: f.text.trim() })),
    candidates, status: candidates.length ? 'review' : 'nothing', nothingReason: candidates.length ? undefined : 'github_empty',
  }));
  return {
    ok: true,
    message: candidates.length
      ? `Read ${r.files.map(f => f.path).join(' and ')} from GitHub · ${candidates.length} found${capped ? ' (the first 15)' : ''}`
      : `Read ${r.files.map(f => f.path).join(' and ')} from GitHub · nothing to unpack`,
  };
}

/** Keep text the user pasted for a source we couldn't read. It's split on this device by the same rules as the capture
 * box: with candidates the source is ready to review (evidence: exact words from what you pasted); without, the text
 * stays attached and waits with the source. Returns how many candidates were found. */
export function attachPastedText(sourceId: string, text: string): number {
  const t = normalisePaste(text).trim();
  const tr = parseTranscript(t); // EXT-05: a transcript attached to a video gives moments
  if (tr) return attachTranscript(sourceId, tr);
  const pieces = findPieces(t);
  const segId = `paste-${Date.now().toString(36)}`;
  const many = pieces.length > 1;
  const found: Candidate[] = pieces.map(p => ({
    id: uid('c-'), type: p.type, title: p.title, exact: p.exact, domains: [], defaultSelected: true,
    evidence: { method: 'text_span', quote: p.exact, segId, locator: many ? `from what you pasted, ${lineRange(t, p.start, p.end)}` : 'from what you pasted' },
    note: `Found on this device by simple rules, not AI, in the text you pasted. ${p.why}`, ...withCautions(p.exact),
  }));
  updateSource(sourceId, x => {
    if (!found.length) return { ...x, pastedText: text, status: x.status === 'failed' || x.status === 'needs_thread' ? 'queued' : x.status };
    const segs = ((x.segments ?? []) as { id: string; label?: string; text: string }[]).filter(g => g && typeof g.text === 'string');
    return {
      ...x, pastedText: text, extraction: 'on_device', status: 'review', failReason: undefined,
      segments: [...segs, { id: segId, label: 'What you pasted', text: t }],
      candidates: [...(x.candidates ?? []), ...found],
    };
  });
  return found.length;
}

/** The user's own note on a source (quick capture's "Why you saved it"). */
export function updateSourceNote(id: string, note: string) { updateSource(id, x => ({ ...x, description: note })); }

/** Removes a source outright, with no trace in Deleted. Only for taking back a capture that was just made (its Undo);
 * a person deleting a source uses trashSource. */
export function deleteSource(id: string): () => void {
  const before = sourceById(state, id);
  patch(s => ({ ...s, sources: s.sources.filter(x => x.id !== id) }));
  return () => { if (before) patch(s => ({ ...s, sources: [before, ...s.sources] })); };
}

/* ---------------- Deleted (24 Oct): nothing a person deletes is destroyed until they delete it forever ---------------- */
/** Moves an Inbox source to Deleted, whole (status, candidates, kept and skipped ids, notes). Returns undo, or null when
 * the source has gone. `column` is the Inbox column it was in, shown on the Deleted page. */
export function trashSource(id: string, column?: string): (() => void) | null {
  const index = state.sources.findIndex(x => x.id === id);
  if (index < 0) return null;
  const item = state.sources[index];
  const entry: TrashEntry = { kind: 'source', item, deletedAt: nowISO(), from: { place: 'inbox', column, index } };
  patch(s => ({ ...s, sources: s.sources.filter(x => x.id !== id), trash: [entry, ...s.trash.filter(t => !(t.kind === 'source' && t.item.id === id))] }));
  return () => { restoreFromTrash('source', id); };
}

/** Moves a Library item to Deleted, whole (collections, projects, tags, history, uses). Returns undo. */
export function deleteArtifact(id: string): () => void {
  const index = state.artifacts.findIndex(a => a.id === id);
  if (index < 0) return () => {};
  const item = state.artifacts[index];
  const entry: TrashEntry = { kind: 'artifact', item, deletedAt: nowISO(), from: { place: 'library', index, ...viaOf(item) } };
  patch(s => ({ ...s, artifacts: s.artifacts.filter(a => a.id !== id), trash: [entry, ...s.trash.filter(t => !(t.kind === 'artifact' && t.item.id === id))] }));
  return () => { restoreFromTrash('artifact', id); };
}

/** Easels (25 Oct): moves an easel to Deleted, whole, with its items. Its images stay in the database until it's deleted
 * forever (the sweep on load). Returns undo, or null when it has gone. */
export function trashEasel(id: string): (() => void) | null {
  const list = state.easels ?? [];
  const index = list.findIndex(x => x.id === id);
  if (index < 0) return null;
  const entry: TrashEntry = { kind: 'easel', item: list[index], deletedAt: nowISO(), from: { place: 'boards', index } };
  patch(s => ({ ...s, easels: (s.easels ?? []).filter(x => x.id !== id), trash: [entry, ...s.trash.filter(t => !(t.kind === 'easel' && t.item.id === id))] }));
  return () => { restoreFromTrash('easel', id); };
}

/** Where a Library item lived besides the Library: the board it was made from, else its first collection (Deleted shows it). */
function viaOf(a: Artifact): { via?: TrashFrom['via'] } {
  const b = a.boardId ? state.boards.find(x => x.id === a.boardId) : undefined;
  if (b) return { via: { kind: 'board', id: b.id, name: b.title } };
  const c = state.collections.find(x => (a.collections ?? []).includes(x.id));
  return c ? { via: { kind: 'collection', id: c.id, name: c.name } } : {};
}

const findTrash = (kind: TrashEntry['kind'], id: string) => state.trash.find(t => t.kind === kind && t.item.id === id);
const withoutTrash = (s: AppState, kind: TrashEntry['kind'], id: string) => s.trash.filter(t => !(t.kind === kind && t.item.id === id));

/** Puts a deleted item back exactly where it was: the same place in the list, the same Inbox column (its status is kept),
 * and every collection, project, tag and history entry. Memberships of a collection or project deleted since are dropped,
 * as deleting a group does for items in the Library. Returns false when it's no longer in Deleted. */
export function restoreFromTrash(kind: TrashEntry['kind'], id: string): boolean {
  const t = findTrash(kind, id);
  if (!t) return false;
  patch(s => restoreInto(s, t));
  return true;
}
function restoreInto(s: AppState, t: TrashEntry): AppState {
  const id = t.item.id;
  const at = <T,>(xs: T[], x: T) => { const ys = [...xs]; ys.splice(Math.min(Math.max(0, t.from.index), ys.length), 0, x); return ys; };
  const trash = withoutTrash(s, t.kind, id);
  if (t.kind === 'source') {
    // a backup merged in since may have brought the same source back; then there's nothing to restore
    return s.sources.some(x => x.id === id) ? { ...s, trash } : { ...s, trash, sources: at(s.sources, t.item) };
  }
  if (t.kind === 'easel') {
    const easels = s.easels ?? [];
    return easels.some(x => x.id === id) ? { ...s, trash } : { ...s, trash, easels: at<Easel>(easels, t.item) };
  }
  if (s.artifacts.some(a => a.id === id)) return { ...s, trash };
  const a = t.item;
  const item: Artifact = {
    ...a,
    ...(a.collections ? { collections: a.collections.filter(g => s.collections.some(c => c.id === g)) } : {}),
    ...(a.projects ? { projects: a.projects.filter(g => s.projects.some(p => p.id === g)) } : {}),
  };
  return { ...s, trash, artifacts: at(s.artifacts, item) };
}
const trashKey = (t: { kind: TrashEntry['kind']; item: { id: string } }) => `${t.kind}:${t.item.id}`;
/** Deleted at scale (design review, 25 Oct): restores many entries in one write, each exactly as restoreFromTrash would.
 * `keys` are "kind:id". Returns how many were restored. */
export function restoreManyFromTrash(keys: string[]): number {
  const want = new Set(keys);
  const ts = state.trash.filter(t => want.has(trashKey(t)));
  // oldest position first, so each lands where it was relative to the ones before it
  ts.sort((a, b) => a.from.index - b.from.index);
  if (ts.length) patch(s => ts.reduce(restoreInto, s));
  return ts.length;
}
/** Deletes many entries from Deleted for good, in one write. Returns undo (puts them back where they were, this session). */
export function purgeManyFromTrash(keys: string[]): () => void {
  const want = new Set(keys);
  const gone = state.trash.flatMap((t, i) => (want.has(trashKey(t)) ? [{ i, t }] : []));
  if (!gone.length) return () => {};
  patch(s => ({ ...s, trash: s.trash.filter(t => !want.has(trashKey(t))) }));
  return () => patch(s => {
    const xs = [...s.trash];
    const have = new Set(xs.map(trashKey));
    for (const { i, t } of gone) if (!have.has(trashKey(t))) xs.splice(Math.min(i, xs.length), 0, t);
    return { ...s, trash: xs };
  });
}

/** Deletes one item from Deleted for good. Returns undo (puts the entry back in Deleted) for the rest of the session. */
export function purgeFromTrash(kind: TrashEntry['kind'], id: string): () => void {
  const i = state.trash.findIndex(t => t.kind === kind && t.item.id === id);
  if (i < 0) return () => {};
  const entry = state.trash[i];
  patch(s => ({ ...s, trash: withoutTrash(s, kind, id) }));
  return () => patch(s => {
    if (s.trash.some(t => t.kind === kind && t.item.id === id)) return s;
    const xs = [...s.trash]; xs.splice(Math.min(i, xs.length), 0, entry); return { ...s, trash: xs };
  });
}

/** Empties Deleted. Nothing comes back. */
export function emptyTrash() { patch(s => ({ ...s, trash: [] })); }

/** Settings › Deleted (24 Oct): with "After 30 days", entries deleted more than 30 days ago are emptied. Pure; 'keep' keeps all. */
export const TRASH_DAYS = 30;
export function expireTrash(s: AppState, now = Date.now()): TrashEntry[] {
  if (s.prefs.trashRetention !== '30d') return s.trash;
  return s.trash.filter(t => { const at = +new Date(t.deletedAt); return !(at && now - at > TRASH_DAYS * 86_400_000); });
}
/** Choose how long Deleted keeps things. Switching to "After 30 days" empties what is already older, at once; returns
 * how many went and an undo that puts them back (and the setting). */
export function setTrashRetention(v: 'keep' | '30d'): { removed: number; undo: () => void } {
  const before = state.prefs.trashRetention;
  const all = state.trash;
  setPrefs({ trashRetention: v });
  const kept = expireTrash(state);
  const gone = all.filter(t => !kept.includes(t));
  if (gone.length) patch(s => ({ ...s, trash: kept }));
  return {
    removed: gone.length,
    undo: () => patch(s => ({
      ...s, prefs: { ...s.prefs, trashRetention: before },
      trash: [...s.trash, ...gone.filter(g => !s.trash.some(t => t.kind === g.kind && t.item.id === g.item.id))].sort((a, b) => +new Date(b.deletedAt) - +new Date(a.deletedAt)),
    })),
  };
}

/* ---------------- library actions ---------------- */
export function updateArtifact(id: string, change: Partial<Artifact>, what?: string): boolean {
  const a = artifactById(state, id);
  if (!a) return false;
  const changed = Object.entries(change).some(([k, v]) => JSON.stringify((a as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v));
  if (!changed) return false;
  // 'Edited by you' only while a different version of yours exists; discarding it returns to the captured state.
  const review = 'yours' in change ? (change.yours != null && change.yours !== a.exact ? 'edited' : a.review === 'edited' ? 'accepted' : a.review) : a.review;
  patch(s => ({
    ...s,
    artifacts: s.artifacts.map(x => x.id !== id ? x : {
      ...x, ...change, review, history: [...(x.history ?? []), { when: nowISO(), what: what ?? 'Edited by you' }],
    }),
  }));
  return true;
}

export function toggleArtifactIn(id: string, field: 'collections' | 'projects', groupId: string) {
  const name = (field === 'collections' ? state.collections : state.projects).find(g => g.id === groupId)?.name ?? '';
  const noun = field === 'collections' ? 'collection' : 'project';
  patch(s => ({
    ...s,
    artifacts: s.artifacts.map(a => {
      if (a.id !== id) return a;
      const cur = a[field] ?? [];
      const on = !cur.includes(groupId);
      return {
        ...a, [field]: on ? [...cur, groupId] : cur.filter(x => x !== groupId),
        history: [...(a.history ?? []), { when: nowISO(), what: `${on ? 'Added to' : 'Removed from'} ${noun} “${name}”` }],
      };
    }),
  }));
}

/* ---------------- stars, tags and uses (build-out Stage 1) ---------------- */
const patchArtifact = (id: string, fn: (a: Artifact) => Artifact) =>
  patch(s => ({ ...s, artifacts: s.artifacts.map(a => (a.id === id ? fn(a) : a)) }));

/** Bookmark or remove the bookmark (stored as `starred`). Returns the new value. */
export function toggleStar(id: string): boolean {
  const a = artifactById(state, id);
  if (!a) return false;
  const on = !a.starred;
  patchArtifact(id, x => ({ ...x, starred: on, history: [...(x.history ?? []), { when: nowISO(), what: on ? 'Bookmarked' : 'Bookmark removed' }] }));
  return on;
}
export const starredArtifacts = (s: AppState) => s.artifacts.filter(a => a.starred);

/** "#Design  ideas " → "Design ideas". Tags keep the case first used; matching ignores case. */
export const cleanTag = (t: string) => t.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** Every tag in use with how many items carry it, most used first. */
export function tagCounts(s: AppState): { tag: string; count: number }[] {
  const m = new Map<string, { tag: string; count: number }>();
  for (const a of s.artifacts) for (const t of a.tags ?? []) {
    const k = t.toLowerCase();
    const cur = m.get(k);
    if (cur) cur.count++; else m.set(k, { tag: t, count: 1 });
  }
  return [...m.values()].sort((x, y) => y.count - x.count || x.tag.localeCompare(y.tag));
}
export const hasTag = (a: Artifact, tag: string) => (a.tags ?? []).some(t => sameTag(t, tag));

/** Adds a tag (no-op if already there). Returns the tag as stored, or null if empty. */
export function addTag(id: string, raw: string): string | null {
  const t0 = cleanTag(raw);
  const a = artifactById(state, id);
  if (!t0 || !a) return null;
  const known = tagCounts(state).find(x => sameTag(x.tag, t0))?.tag ?? (state.prefs.pinnedTags ?? []).find(x => sameTag(x, t0));
  const t = known ?? t0;
  if (hasTag(a, t)) return t;
  patchArtifact(id, x => ({ ...x, tags: [...(x.tags ?? []), t], history: [...(x.history ?? []), { when: nowISO(), what: `Tag added: ${t}` }] }));
  return t;
}
/** Removes a tag. Returns undo (puts it back in the same place). */
export function removeTag(id: string, tag: string): () => void {
  const a = artifactById(state, id);
  const i = (a?.tags ?? []).findIndex(t => sameTag(t, tag));
  if (!a || i < 0) return () => {};
  const was = a.tags![i];
  patchArtifact(id, x => ({ ...x, tags: (x.tags ?? []).filter(t => !sameTag(t, tag)), history: [...(x.history ?? []), { when: nowISO(), what: `Tag removed: ${was}` }] }));
  return () => patchArtifact(id, x => {
    if (hasTag(x, was)) return x;
    const xs = [...(x.tags ?? [])]; xs.splice(i, 0, was);
    return { ...x, tags: xs, history: [...(x.history ?? []), { when: nowISO(), what: `Tag restored: ${was}` }] };
  });
}

/** Pin a tag to the sidebar. Returns the tag as pinned, or null if empty. */
export function pinTag(raw: string): string | null {
  const t0 = cleanTag(raw);
  if (!t0) return null;
  const pins = state.prefs.pinnedTags ?? [];
  const existing = pins.find(x => sameTag(x, t0));
  if (existing) return existing;
  const t = tagCounts(state).find(x => sameTag(x.tag, t0))?.tag ?? t0;
  setPrefs({ pinnedTags: [...pins, t] });
  return t;
}
/** Unpin. Returns undo. */
export function unpinTag(tag: string): () => void {
  const pins = state.prefs.pinnedTags ?? [];
  const i = pins.findIndex(x => sameTag(x, tag));
  if (i < 0) return () => {};
  setPrefs({ pinnedTags: pins.filter((_, j) => j !== i) });
  return () => { const now = state.prefs.pinnedTags ?? []; if (!now.some(x => sameTag(x, tag))) { const xs = [...now]; xs.splice(i, 0, pins[i]); setPrefs({ pinnedTags: xs }); } };
}

/** Settings › Tags (24 Oct): rename a tag on every item that carries it (and its pin). If an item already has the new
 * name, the two merge. Each changed item gets a history entry. Returns how many items changed. */
export function renameTag(from: string, raw: string): number {
  const to = cleanTag(raw);
  if (!to || to === from) return 0;
  const ids = state.artifacts.filter(a => hasTag(a, from)).map(a => a.id);
  const when = nowISO();
  patch(s => ({
    ...s,
    artifacts: s.artifacts.map(a => {
      if (!ids.includes(a.id)) return a;
      const tags: string[] = [];
      for (const t of a.tags ?? []) { const v = sameTag(t, from) ? to : t; if (!tags.some(x => sameTag(x, v))) tags.push(v); }
      return { ...a, tags, history: [...(a.history ?? []), { when, what: `Tag renamed: ${from} → ${to}` }] };
    }),
    prefs: { ...s.prefs, pinnedTags: s.prefs.pinnedTags?.reduce<string[]>((xs, t) => { const v = sameTag(t, from) ? to : t; return xs.some(x => sameTag(x, v)) ? xs : [...xs, v]; }, []) },
  }));
  return ids.length;
}
/** Settings › Tags: remove a tag from every item (and unpin it). Returns how many items changed and an undo that puts
 * the tag back in the same place on each, and the pin. History entries record both. */
export function removeTagEverywhere(tag: string): { count: number; undo: () => void } {
  const was = new Map<string, { i: number; t: string }>();
  for (const a of state.artifacts) { const i = (a.tags ?? []).findIndex(t => sameTag(t, tag)); if (i >= 0) was.set(a.id, { i, t: a.tags![i] }); }
  const pins = state.prefs.pinnedTags ?? [];
  const pinAt = pins.findIndex(x => sameTag(x, tag));
  const when = nowISO();
  patch(s => ({
    ...s,
    artifacts: s.artifacts.map(a => (was.has(a.id) ? { ...a, tags: (a.tags ?? []).filter(t => !sameTag(t, tag)), history: [...(a.history ?? []), { when, what: `Tag removed: ${was.get(a.id)!.t}` }] } : a)),
    prefs: pinAt < 0 ? s.prefs : { ...s.prefs, pinnedTags: (s.prefs.pinnedTags ?? []).filter(x => !sameTag(x, tag)) },
  }));
  return {
    count: was.size,
    undo: () => patch(s => {
      const back = nowISO();
      const now = s.prefs.pinnedTags ?? [];
      const pinnedTags = pinAt >= 0 && !now.some(x => sameTag(x, tag)) ? (() => { const xs = [...now]; xs.splice(pinAt, 0, pins[pinAt]); return xs; })() : s.prefs.pinnedTags;
      return {
        ...s,
        artifacts: s.artifacts.map(a => {
          const w = was.get(a.id);
          if (!w || hasTag(a, w.t)) return a;
          const xs = [...(a.tags ?? [])]; xs.splice(w.i, 0, w.t);
          return { ...a, tags: xs, history: [...(a.history ?? []), { when: back, what: `Tag restored: ${w.t}` }] };
        }),
        prefs: { ...s.prefs, pinnedTags },
      };
    }),
  };
}

/** Record a copy, a prompt-fill copy or an export, so "Used" and "Recently used" are real. Not a history event. */
export function recordUse(ids: string[], kind: Use['kind']) {
  if (!ids.length) return;
  const at = nowISO();
  patch(s => ({ ...s, artifacts: s.artifacts.map(a => (ids.includes(a.id) ? { ...a, uses: [...(a.uses ?? []), { at, kind }] } : a)) }));
}
export const lastUsedAt = (a: Artifact) => (a.uses?.length ? a.uses[a.uses.length - 1].at : undefined);

/* ---------------- Track B, organise (25 Oct): its actions are in lib/organiseStore.ts and write through this ---------------- */
/** Apply a change to the whole state, saved like every other action. For lib/organiseStore.ts only. */
export function mutate(fn: (s: AppState) => AppState) { patch(fn); }

/* ---------------- boards meet the Library (build-out Stage 7) ---------------- */
/** Saves a board's brief to the Library as a prompt, linked back to the board (evidence: "from your board"). Saving
 * again updates the same item, keeping the edit in its history. Returns the item and whether it was new. */
export function saveBriefToLibrary(boardId: string, text: string): { artifact: Artifact; created: boolean } | null {
  const b = boardById(state, boardId);
  if (!b || !text.trim()) return null;
  const title = `Brief: ${b.title || 'Untitled board'}`;
  const evidence = { method: 'user_supplied' as const, locator: `from your board “${b.title || 'Untitled board'}”` };
  const existing = state.artifacts.find(a => a.boardId === boardId && !a.refId);
  if (existing) {
    if (existing.exact === text) return { artifact: existing, created: false };
    patchArtifact(existing.id, x => ({ ...x, title, exact: text, evidence, history: [...(x.history ?? []), { when: nowISO(), what: 'Brief updated from the board · text replaced' }] }));
    return { artifact: artifactById(state, existing.id)!, created: false };
  }
  const a: Artifact = {
    id: uid('a-'), type: 'prompt', title, exact: text, evidence, boardId, domains: ['Design'], useCases: [], collections: [],
    projects: b.projectId ? [b.projectId] : [], savedAt: nowISO(), review: 'user_supplied', demo: b.demo,
    purpose: undefined, history: [{ when: nowISO(), what: 'Saved from a board as a prompt' }],
  };
  patch(s => ({ ...s, artifacts: [a, ...s.artifacts] }));
  return { artifact: a, created: true };
}
/** Keeps a board reference in the Library as a "reference" item that opens back in its board. */
export function saveReferenceToLibrary(refId: string): Artifact | null {
  const r = state.references.find(x => x.id === refId);
  const b = r ? boardById(state, r.boardId) : undefined;
  if (!r || !b) return null;
  const existing = state.artifacts.find(a => a.refId === refId);
  if (existing) return existing;
  // Only your own words and the credit; nothing here is presented as an AI summary.
  const lines = [r.note.trim(), r.creator ? `By ${r.creator}` : '', r.sourceUrl || r.linkUrl || '', ...r.regions.filter(g => g.note.trim()).map((g, i) => `Region ${i + 1}${g.avoid ? ' (avoid)' : ''}: ${g.note.trim()}`)].filter(Boolean);
  const a: Artifact = {
    id: uid('a-'), type: 'reference', title: r.title || `Reference from “${b.title || 'Untitled board'}”`, exact: lines.join('\n') || null,
    evidence: { method: 'user_supplied', locator: `from your board “${b.title || 'Untitled board'}”` }, boardId: b.id, refId,
    domains: ['Design'], useCases: [], collections: [], projects: b.projectId ? [b.projectId] : [], savedAt: nowISO(), review: 'user_supplied',
    history: [{ when: nowISO(), what: 'Saved from a board as a reference' }], demo: r.demo,
  };
  patch(s => ({ ...s, artifacts: [a, ...s.artifacts] }));
  return a;
}

/** A Library reference's original on its board, or its address when that board is gone. Null: it can't go on a board. */
function libraryRefSource(s: AppState, a: Artifact): { ref: Reference } | { url: string } | null {
  if (a.type !== 'reference') return null;
  const ref = a.refId ? s.references.find(r => r.id === a.refId) : undefined;
  if (ref) return { ref };
  const url = (a.sourceId ? s.sources.find(x => x.id === a.sourceId)?.url : null) ?? a.exact?.split('\n').find(l => /^https?:\/\/\S+$/.test(l.trim()))?.trim();
  return url ? { url } : null;
}
/** Library items that can be added to a board, each marked when it's already on that board. */
export function libraryRefsFor(s: AppState, boardId: string): { a: Artifact; thumbKey?: string; on: boolean }[] {
  const here = s.references.filter(r => r.boardId === boardId);
  return s.artifacts.flatMap(a => {
    if (a.image) return [{ a, thumbKey: a.image.thumbKey ?? a.image.key, on: here.some(r => r.libraryId === a.id) }];
    const src = libraryRefSource(s, a);
    if (!src) return [];
    const on = here.some(r => r.libraryId === a.id || r.id === a.refId);
    return [{ a, thumbKey: 'ref' in src ? src.ref.thumbKey ?? (src.ref.imageKey || undefined) : undefined, on }];
  });
}
/** Adds a Library reference to a board as its own copy: image, clip, link, notes, likes and regions (new ids, own files),
 * so deleting either one leaves the other whole. A reference whose board is gone comes back as a link card. */
export async function addLibraryReference(boardId: string, sectionId: string | null, artifactId: string): Promise<Reference | null> {
  const a = state.artifacts.find(x => x.id === artifactId);
  if (a?.image && boardById(state, boardId)) {
    // a Library image goes on the board as its own copy of the file and thumbnail
    const [blob, thumb] = await Promise.all([db.getBlob(a.image.key), a.image.thumbKey ? db.getBlob(a.image.thumbKey) : undefined]);
    if (!blob) return null;
    const [ref] = await addReferences(boardId, sectionId, [{ blob: new Blob([await blob.arrayBuffer()], { type: a.image.mime }), mime: a.image.mime, width: a.image.width, height: a.image.height,
      thumb: thumb ? new Blob([await thumb.arrayBuffer()], { type: thumb.type }) : undefined, title: a.title, palette: a.image.palette }]);
    updateReference(ref.id, { libraryId: a.id });
    return { ...ref, libraryId: a.id };
  }
  const src = a ? libraryRefSource(state, a) : null;
  if (!a || !src || !boardById(state, boardId)) return null;
  if (!('ref' in src)) {
    const ref = addLinkReference(boardId, sectionId, { url: src.url, media: 'link', title: a.title });
    updateReference(ref.id, { libraryId: a.id });
    return { ...ref, libraryId: a.id };
  }
  const o = src.ref;
  const id = uid('r-');
  const keys: Partial<Pick<Reference, 'imageKey' | 'thumbKey'>> = {};
  for (const k of ['imageKey', 'thumbKey'] as const) {
    const from = o[k];
    if (!from) continue;
    const b = await db.getBlob(from);
    if (!b) { if (k === 'imageKey') return null; continue; } // the original's file is gone: nothing to copy
    keys[k] = `${k === 'imageKey' ? 'img' : 'thumb'}:${id}`;
    await db.putBlob(keys[k]!, b);
  }
  const order = Math.max(0, ...state.references.filter(r => r.boardId === boardId).map(r => r.order + 1));
  const ref: Reference = {
    ...o, id, boardId, sectionId, order, capturedAt: nowISO(), libraryId: a.id, demo: undefined,
    imageKey: keys.imageKey ?? '', thumbKey: keys.thumbKey,
    regions: o.regions.map(g => ({ ...g, id: uid('g-') })), notes: o.notes?.map(n => ({ ...n, id: uid('n-') })),
  };
  patch(s => ({
    ...s, references: [...s.references, ref],
    boards: s.boards.map(b => (b.id === boardId ? { ...b, updatedAt: nowISO() } : b)),
  }));
  return ref;
}

/* ---------------- collections and projects as places (build-out Stage 6) ---------------- */
export function updateGroup(field: 'collections' | 'projects', id: string, change: Partial<{ name: string; note: string; icon: string }>) {
  patch(s => ({ ...s, [field]: (s[field] as { id: string }[]).map(g => (g.id === id ? { ...g, ...change } : g)) }));
}
/** Deletes a collection or project. Items stay in the Library (only their membership goes); a project's boards are
 * unlinked. Returns undo, which restores the group, every membership and the board links. */
export function deleteGroup(field: 'collections' | 'projects', id: string): () => void {
  const list = state[field] as { id: string }[];
  const idx = list.findIndex(g => g.id === id);
  const group = list[idx];
  const members = state.artifacts.filter(a => (a[field] ?? []).includes(id)).map(a => a.id);
  const boards = field === 'projects' ? state.boards.filter(b => b.projectId === id).map(b => b.id) : [];
  patch(s => ({
    ...s,
    [field]: (s[field] as { id: string }[]).filter(g => g.id !== id),
    artifacts: s.artifacts.map(a => (members.includes(a.id) ? { ...a, [field]: (a[field] ?? []).filter(x => x !== id) } : a)),
    boards: s.boards.map(b => (boards.includes(b.id) ? { ...b, projectId: undefined } : b)),
  }));
  return () => {
    if (!group) return;
    patch(s => {
      const xs = [...(s[field] as { id: string }[])]; xs.splice(idx, 0, group);
      return {
        ...s, [field]: xs,
        artifacts: s.artifacts.map(a => (members.includes(a.id) && !(a[field] ?? []).includes(id) ? { ...a, [field]: [...(a[field] ?? []), id] } : a)),
        boards: s.boards.map(b => (boards.includes(b.id) ? { ...b, projectId: id } : b)),
      };
    });
  };
}
/** Put a board in a project (or take it out with null). */
export function setBoardProject(boardId: string, projectId: string | null) {
  patch(s => ({ ...s, boards: s.boards.map(b => (b.id === boardId ? { ...b, projectId: projectId ?? undefined, updatedAt: nowISO() } : b)) }));
}

export function createCollection(name: string) { const c = { id: uid('c-'), name }; patch(s => ({ ...s, collections: [...s.collections, c] })); return c; }
export function createProject(name: string, note = '') { const p = { id: uid('p-'), name, note }; patch(s => ({ ...s, projects: [...s.projects, p] })); return p; }

/* ---------------- Taste boards actions ---------------- */
export function createBoard(title = 'Untitled board'): Board {
  const b: Board = { id: uid('b-'), title, note: '', sections: [], createdAt: nowISO(), updatedAt: nowISO() };
  patch(s => ({ ...s, boards: [b, ...s.boards] }));
  return b;
}

export function updateBoard(id: string, change: Partial<Board>) {
  patch(s => ({ ...s, boards: s.boards.map(b => (b.id === id ? { ...b, ...change, updatedAt: nowISO() } : b)) }));
}

/** Deletes a board and all its references and image files. Returns undo (restores within the session). */
export async function deleteBoard(id: string): Promise<() => Promise<void>> {
  const board = boardById(state, id);
  const refs = state.references.filter(r => r.boardId === id);
  const blobs = await collectBlobs(refs);
  patch(s => ({ ...s, boards: s.boards.filter(b => b.id !== id), references: s.references.filter(r => r.boardId !== id) }));
  await Promise.all([...blobs.keys()].map(k => db.deleteBlob(k)));
  return async () => {
    if (!board) return;
    await Promise.all([...blobs].map(([k, b]) => db.putBlob(k, b)));
    patch(s => ({ ...s, boards: [board, ...s.boards], references: [...s.references, ...refs] }));
  };
}

/** Playground (27 Oct, #82): a copy of a board with its sections, references, regions and notes. Each reference gets its
 * own image files, so deleting either board leaves the other whole; demo images (static paths) and embeds stay shared. */
export async function duplicateBoard(id: string, title: string): Promise<Board | null> {
  const src = boardById(state, id);
  if (!src) return null;
  const at = nowISO();
  const secIds = new Map(src.sections.map(x => [x.id, uid('sec-')]));
  const copy: Board = { ...src, id: uid('b-'), title, sections: src.sections.map(x => ({ ...x, id: secIds.get(x.id)! })), demo: undefined, createdAt: at, updatedAt: at };
  const refs: Reference[] = [];
  for (const r of state.references.filter(x => x.boardId === id)) {
    const rid = uid('r-');
    const own = async (k: string | undefined, prefix: string) => {
      if (!k || !k.startsWith(prefix)) return k;
      const b = await db.getBlob(k);
      if (!b) return k;
      await db.putBlob(prefix + rid, new Blob([await b.arrayBuffer()], { type: b.type }));
      return prefix + rid;
    };
    refs.push({ ...r, id: rid, boardId: copy.id, sectionId: r.sectionId ? secIds.get(r.sectionId) ?? null : null, demo: undefined,
      imageKey: (await own(r.imageKey, 'img:')) ?? '', thumbKey: await own(r.thumbKey, 'thumb:') });
  }
  patch(s => ({ ...s, boards: [copy, ...s.boards], references: [...s.references, ...refs] }));
  return copy;
}

export function addSection(boardId: string, title = 'New section'): BoardSection {
  const sec = { id: uid('sec-'), title, note: '' };
  updateBoardSections(boardId, xs => [...xs, sec]);
  return sec;
}
export function updateSection(boardId: string, sectionId: string, change: Partial<BoardSection>) {
  updateBoardSections(boardId, xs => xs.map(x => (x.id === sectionId ? { ...x, ...change } : x)));
}
/** Removes a section; its references move to Unsorted (nothing is deleted). */
export function deleteSection(boardId: string, sectionId: string) {
  updateBoardSections(boardId, xs => xs.filter(x => x.id !== sectionId));
  patch(s => ({ ...s, references: s.references.map(r => (r.boardId === boardId && r.sectionId === sectionId ? { ...r, sectionId: null } : r)) }));
}
function updateBoardSections(boardId: string, fn: (xs: BoardSection[]) => BoardSection[]) {
  patch(s => ({ ...s, boards: s.boards.map(b => (b.id === boardId ? { ...b, sections: fn(b.sections), updatedAt: nowISO() } : b)) }));
}

export interface NewReference {
  blob: Blob; mime: string; width: number; height: number; thumb?: Blob;
  title?: string; sourceUrl?: string; creator?: string; palette?: Swatch[];
  embedded?: Reference['embedded']; demo?: boolean;
}

export async function addReferences(boardId: string, sectionId: string | null, items: NewReference[]): Promise<Reference[]> {
  const start = Math.max(0, ...state.references.filter(r => r.boardId === boardId).map(r => r.order + 1));
  const refs: Reference[] = [];
  for (const [i, it] of items.entries()) {
    const id = uid('r-');
    const imageKey = `img:${id}`, thumbKey = it.thumb ? `thumb:${id}` : undefined;
    await db.putBlob(imageKey, it.blob);
    if (it.thumb && thumbKey) await db.putBlob(thumbKey, it.thumb);
    refs.push({
      id, boardId, sectionId, order: start + i, title: it.title ?? '', sourceUrl: it.sourceUrl ?? '',
      creator: it.creator ?? it.embedded?.creator ?? '', capturedAt: nowISO(), rights: 'unknown',
      embedded: it.embedded, likes: [], note: '', avoid: false, regions: [], palette: it.palette,
      imageKey, thumbKey, mime: it.mime, width: it.width, height: it.height, demo: it.demo,
    });
  }
  patch(s => ({
    ...s, references: [...s.references, ...refs],
    boards: s.boards.map(b => (b.id === boardId ? { ...b, updatedAt: nowISO() } : b)),
  }));
  return refs;
}

export function updateReference(id: string, change: Partial<Reference>) {
  patch(s => ({ ...s, references: s.references.map(r => (r.id === id ? { ...r, ...change } : r)) }));
}

/** Deletes the reference and its image files. Undo restores both. */
export async function deleteReference(id: string): Promise<() => Promise<void>> {
  const ref = state.references.find(r => r.id === id);
  if (!ref) return async () => {};
  const blobs = await collectBlobs([ref]);
  patch(s => ({ ...s, references: s.references.filter(r => r.id !== id) }));
  await Promise.all([...blobs.keys()].map(k => db.deleteBlob(k)));
  return async () => {
    await Promise.all([...blobs].map(([k, b]) => db.putBlob(k, b)));
    patch(s => ({ ...s, references: [...s.references, ref] }));
  };
}

/** Move a reference to a section, optionally before another reference. Renumbers order within the board. */
export function moveReference(id: string, sectionId: string | null, beforeId?: string) {
  patch(s => {
    const ref = s.references.find(r => r.id === id);
    if (!ref) return s;
    const others = s.references.filter(r => r.boardId === ref.boardId && r.id !== id).sort((a, b) => a.order - b.order);
    const at = beforeId ? others.findIndex(r => r.id === beforeId) : -1;
    const moved = { ...ref, sectionId };
    const list = at < 0 ? [...others, moved] : [...others.slice(0, at), moved, ...others.slice(at)];
    const order = new Map(list.map((r, i) => [r.id, i]));
    return { ...s, references: s.references.map(r => (order.has(r.id) ? { ...(r.id === id ? moved : r), order: order.get(r.id)! } : r)) };
  });
}

export function addRegion(refId: string, rect: Pick<Region, 'x' | 'y' | 'w' | 'h'>, avoid = false): Region {
  const reg: Region = { id: uid('g-'), ...rect, likes: [], avoid, note: '' };
  patch(s => ({ ...s, references: s.references.map(r => (r.id === refId ? { ...r, regions: [...r.regions, reg] } : r)) }));
  return reg;
}
export function updateRegion(refId: string, regionId: string, change: Partial<Region>) {
  patch(s => ({
    ...s,
    references: s.references.map(r => r.id !== refId ? r : { ...r, regions: r.regions.map(g => (g.id === regionId ? { ...g, ...change } : g)) }),
  }));
}
export function deleteRegion(refId: string, regionId: string) {
  patch(s => ({ ...s, references: s.references.map(r => (r.id === refId ? { ...r, regions: r.regions.filter(g => g.id !== regionId) } : r)) }));
}

async function collectBlobs(refs: Reference[]) {
  const map = new Map<string, Blob>();
  for (const r of refs) for (const k of [r.imageKey, r.thumbKey]) {
    if (!k) continue;
    const b = await db.getBlob(k);
    if (b) map.set(k, new Blob([await b.arrayBuffer()], { type: b.type })); // own copy in memory, independent of the record
  }
  return map;
}

/* ---------------- notifications (build-out Stage 9) ---------------- */
/** Dismiss a notification at its current version. Returns undo. */
export function dismissNotice(key: string, version: string): () => void {
  const before = state.prefs.dismissed?.[key];
  setPrefs({ dismissed: { ...(state.prefs.dismissed ?? {}), [key]: version } });
  return () => { const d = { ...(state.prefs.dismissed ?? {}) }; if (before === undefined) delete d[key]; else d[key] = before; setPrefs({ dismissed: d }); };
}

/** Mark notifications read at their current versions (opening one, or Mark all read). Returns undo. */
export function markNoticesRead(list: { key: string; version: string }[]): () => void {
  const before = state.prefs.readNotices;
  const next = { ...(before ?? {}) };
  list.forEach(n => { next[n.key] = n.version; });
  if (JSON.stringify(next) !== JSON.stringify(before ?? {})) setPrefs({ readNotices: next });
  return () => setPrefs({ readNotices: before });
}

/* ---------------- Your AI (design review 25 Oct): the AIs added to this library ---------------- */
export function addAi(id: string): boolean {
  if ((state.prefs.ais ?? []).some(x => x.id === id)) return false;
  setPrefs({ ais: [...(state.prefs.ais ?? []), { id, at: nowISO() }] });
  return true;
}
export function removeAi(id: string): () => void {
  const before = state.prefs.ais;
  setPrefs({ ais: (before ?? []).filter(x => x.id !== id) });
  return () => setPrefs({ ais: before });
}

/* ---------------- prefs and data ---------------- */
export function setPrefs(change: Partial<Prefs>) { setAppPrefs(change); patch(s => ({ ...s, prefs: { ...s.prefs, ...change } })); }

/** Remove everything marked demo (sources, artifacts, groups, boards and their images). Returns undo, which puts every
 * record back where it was and the images with it (kept in memory, like deleteBoard's undo). */
export async function clearDemo(): Promise<() => Promise<void>> {
  const demoRefs = state.references.filter(r => r.demo);
  const blobs = await collectBlobs(demoRefs);
  const keys = ['sources', 'artifacts', 'projects', 'collections', 'boards', 'references', 'easels', 'trash'] as const;
  const isDemo = (k: (typeof keys)[number], x: unknown) => (k === 'trash' ? !!(x as TrashEntry).item.demo : !!(x as { demo?: boolean }).demo);
  // what goes, with its position, so undo restores the same order
  const removed = Object.fromEntries(keys.map(k => [k, ((state[k] ?? []) as unknown[]).flatMap((x, i) => (isDemo(k, x) ? [{ i, x }] : []))])) as Record<(typeof keys)[number], { i: number; x: unknown }[]>;
  await Promise.all(demoRefs.flatMap(r => [r.imageKey, r.thumbKey].filter(Boolean).map(k => db.deleteBlob(k!))));
  patch(s => ({ ...s, ...Object.fromEntries(keys.map(k => [k, ((s[k] ?? []) as unknown[]).filter(x => !isDemo(k, x))])) }));
  return async () => {
    await Promise.all([...blobs].map(([k, b]) => db.putBlob(k, b)));
    const idOf = (k: (typeof keys)[number], x: unknown) => (k === 'trash' ? `${(x as TrashEntry).kind}:${(x as TrashEntry).item.id}` : (x as { id: string }).id);
    patch(s => ({
      ...s,
      ...Object.fromEntries(keys.map(k => {
        const xs = [...((s[k] ?? []) as unknown[])];
        const have = new Set(xs.map(x => idOf(k, x)));
        for (const { i, x } of removed[k]) if (!have.has(idOf(k, x))) xs.splice(Math.min(i, xs.length), 0, x);
        return [k, xs];
      })),
    }));
  };
}

/** Restoring a backup replaces this library; the app-wide prefs (theme, icon style, shortcuts…) stay as they are. */
export function replaceState(next: AppState) { set({ ...EMPTY, ...next, v: 1, trash: cleanTrash(next.trash), prefs: withAppPrefs(cleanPrefs({ ...EMPTY.prefs, ...next.prefs })) }); }

/** Deleted arrived on 24 Oct: older libraries and backups have no trash, and anything malformed in it is left out. */
function cleanTrash(t: unknown): TrashEntry[] {
  if (!Array.isArray(t)) return [];
  return t.filter((x): x is TrashEntry => !!x && (x.kind === 'source' || x.kind === 'artifact' || (x.kind === 'easel' && Array.isArray(x.item?.items))) && typeof x.item?.id === 'string'
    && typeof x.deletedAt === 'string' && !!x.from && typeof x.from.index === 'number');
}

/** Prefs from older versions or backups may carry the retired Pixel style settings (style, pixelText, titleStyle).
 * They're dropped on load and on restore, so old backups still restore and nothing turns the old style back on. */
function cleanPrefs(p: Prefs): Prefs {
  const { style: _s, pixelText: _p, titleStyle: _t, ...rest } = p as Prefs & { style?: unknown; pixelText?: unknown; titleStyle?: unknown };
  return rest;
}
function forgetPixelStyle() {
  try { ['capsa-style', 'capsa-pixel-text', 'capsa-gp'].forEach(k => localStorage.removeItem(k)); } catch { /* private mode */ }
  const d = document.documentElement; delete d.dataset.style; delete d.dataset.pixelText; d.style.removeProperty('--gp-display');
}
/** "Try with sample data": adds the labelled demo (Demo data) without touching anything you made; Remove demo data takes it out. */
export async function loadSampleData() {
  const d = demoState();
  patch(s => ({
    ...s,
    sources: [...s.sources, ...d.sources.filter(x => !s.sources.some(y => y.id === x.id))],
    artifacts: [...s.artifacts, ...d.artifacts.filter(x => !s.artifacts.some(y => y.id === x.id))],
    projects: [...s.projects, ...d.projects.filter(x => !s.projects.some(y => y.id === x.id))],
    collections: [...s.collections, ...d.collections.filter(x => !s.collections.some(y => y.id === x.id))],
    trash: [...s.trash, ...d.trash.filter(x => !s.trash.some(y => y.kind === x.kind && y.item.id === x.item.id))]
      .sort((a, b) => +new Date(b.deletedAt) - +new Date(a.deletedAt)),
    seededDemo: true,
  }));
}

/** Delete everything: a truly empty library. seededDemo stays true so the demo is not loaded again on the next visit
 * (it used to write the demo straight back, contradicting the confirmation). Theme and icon style are device settings and stay. */
export async function resetAll() {
  await libDb.clearAll();
  state = { ...EMPTY, prefs: withAppPrefs({ ...EMPTY.prefs, theme: state.prefs.theme, ...(state.prefs.icons ? { icons: state.prefs.icons } : {}) }), seededDemo: true };
  await libDb.putState(state);
  noteCount();
  emit();
}

/* ---------------- motion references (B12, appended) ----------------
 * Clips reuse addReferences (the original bytes go into the blob store unchanged; the poster frame is the thumbnail).
 * Embeds and links have no file: imageKey is '' and nothing is stored but the reference itself. */
export type NewMotionReference = NewReference & Pick<Reference, 'media' | 'durationS' | 'fps' | 'fpsMeasured' | 'posterT'>;

/** Like addReferences, plus the clip fields. Images pass through unchanged. */
export async function addMotionReferences(boardId: string, sectionId: string | null, items: NewMotionReference[]): Promise<Reference[]> {
  const refs = await addReferences(boardId, sectionId, items);
  const extra = new Map(refs.map((r, i) => {
    const it = items[i];
    const x: Partial<Reference> = it.media && it.media !== 'image'
      ? { media: it.media, durationS: it.durationS, fps: it.fps, fpsMeasured: it.fpsMeasured, posterT: it.posterT, notes: [] }
      : {};
    return [r.id, x];
  }));
  if ([...extra.values()].some(x => Object.keys(x).length)) {
    patch(s => ({ ...s, references: s.references.map(r => (extra.has(r.id) ? { ...r, ...extra.get(r.id) } : r)) }));
  }
  return refs.map(r => ({ ...r, ...extra.get(r.id) }));
}

export interface NewLinkReference {
  url: string; media: 'embed' | 'link'; embedUrl?: string; provider?: EmbedProvider; startS?: number; title?: string;
}
/** A reference that is only a link: an official embed (YouTube, Vimeo, Behance) or an "Open original" card. */
export function addLinkReference(boardId: string, sectionId: string | null, it: NewLinkReference): Reference {
  const order = Math.max(0, ...state.references.filter(r => r.boardId === boardId).map(r => r.order + 1));
  const ref: Reference = {
    id: uid('r-'), boardId, sectionId, order, title: it.title ?? '', sourceUrl: it.url, creator: '', capturedAt: nowISO(), rights: 'unknown',
    likes: [], note: '', avoid: false, regions: [], imageKey: '', mime: 'text/uri-list', width: 16, height: 9,
    media: it.media, linkUrl: it.url, embedUrl: it.embedUrl, provider: it.provider, startS: it.startS,
  };
  patch(s => ({
    ...s, references: [...s.references, ref],
    boards: s.boards.map(b => (b.id === boardId ? { ...b, updatedAt: nowISO() } : b)),
  }));
  return ref;
}

/** A region marked on a paused frame of a clip; `t` is the frame's time in seconds. */
export function addFrameRegion(refId: string, rect: Pick<Region, 'x' | 'y' | 'w' | 'h'>, t: number, avoid = false, sig?: string): Region {
  const reg: Region = { id: uid('g-'), ...rect, likes: [], avoid, note: '', t: +t.toFixed(4), sig };
  patch(s => ({ ...s, references: s.references.map(r => (r.id === refId ? { ...r, regions: [...r.regions, reg] } : r)) }));
  return reg;
}

const sortNotes = (xs: TimedNote[]) => [...xs].sort((a, b) => a.t - b.t);
export function addTimedNote(refId: string, t: number, text: string): TimedNote {
  const n: TimedNote = { id: uid('n-'), t: +Math.max(0, t).toFixed(3), text };
  patch(s => ({ ...s, references: s.references.map(r => (r.id === refId ? { ...r, notes: sortNotes([...(r.notes ?? []), n]) } : r)) }));
  return n;
}
export function updateTimedNote(refId: string, noteId: string, change: Partial<Omit<TimedNote, 'id'>>) {
  patch(s => ({
    ...s,
    references: s.references.map(r => r.id !== refId ? r : { ...r, notes: sortNotes((r.notes ?? []).map(n => (n.id === noteId ? { ...n, ...change } : n))) }),
  }));
}
/** Removes a timed note. Returns undo. */
export function deleteTimedNote(refId: string, noteId: string): () => void {
  const note = state.references.find(r => r.id === refId)?.notes?.find(n => n.id === noteId);
  patch(s => ({ ...s, references: s.references.map(r => (r.id === refId ? { ...r, notes: (r.notes ?? []).filter(n => n.id !== noteId) } : r)) }));
  return () => { if (note) patch(s => ({ ...s, references: s.references.map(r => (r.id === refId ? { ...r, notes: sortNotes([...(r.notes ?? []), note]) } : r)) })); };
}

/* ================= Track C (25 Oct): review, extraction quality and reuse. Appended; nothing above changes. ================= */
type Seg = { id: string; label?: string; text: string };
const segsOf = (src: Source) => ((src.segments ?? []) as Seg[]).filter(g => g && typeof g.text === 'string');
const isPending = (src: Source, id: string) => !(src.keptIds ?? []).includes(id) && !(src.skippedIds ?? []).includes(id);
/** The locator with its line part brought up to date ("from what you pasted, lines 3–9"); unchanged when it has none. */
const relocate = (loc: string | undefined, seg: Seg, a: number, b: number) => {
  const lines = lineRange(seg.text, a, b);
  if (!loc) return lines;
  return /lines? \d+(?:–\d+)?$/.test(loc) ? loc.replace(/lines? \d+(?:–\d+)?$/, lines) : loc;
};
const firstLine = (t: string) => { const one = t.replace(/\s+/g, ' ').trim(); return one.length <= 64 ? one : one.slice(0, 63).replace(/\s+\S*$/, '') + '…'; };

/** REV-04: merge a candidate with another one still in review (the two halves of one prompt). When both quotes are in the
 * same stored text, the merged exact words run from the first to the end of the second, verbatim from the source.
 * Otherwise the two texts are joined and the evidence stays the first one's. Returns undo, or the reason it can't. */
export function mergeCandidates(sourceId: string, firstId: string, secondId: string): { undo: () => void; merged: Candidate } | string {
  const before = sourceById(state, sourceId);
  if (!before) return 'This source has gone';
  const cs = before.candidates ?? [];
  const i = cs.findIndex(c => c.id === firstId), j = cs.findIndex(c => c.id === secondId);
  if (i < 0 || j < 0 || i === j) return 'Nothing to merge with';
  if (!isPending(before, firstId) || !isPending(before, secondId)) return 'Only finds still in review can be merged';
  const a = cs[Math.min(i, j)], b = cs[Math.max(i, j)];
  const qa = a.evidence?.quote, qb = b.evidence?.quote;
  const seg = a.evidence?.segId && a.evidence.segId === b.evidence?.segId ? segsOf(before).find(g => g.id === a.evidence!.segId) : undefined;
  let exact: string | null = null, evidence = a.evidence, verbatim = false;
  if (seg && qa && qb) {
    const ia = seg.text.indexOf(qa);
    const ib0 = seg.text.indexOf(qb, Math.max(0, ia));
    const ib = ib0 >= 0 ? ib0 : seg.text.indexOf(qb);
    if (ia >= 0 && ib >= 0) {
      const s0 = Math.min(ia, ib), e0 = Math.max(ia + qa.length, ib + qb.length);
      exact = seg.text.slice(s0, e0); verbatim = true;
      evidence = { ...a.evidence!, quote: exact, locator: relocate(a.evidence!.locator, seg, s0, e0) };
    }
  }
  if (exact === null) exact = [a.exact, b.exact].filter(Boolean).join('\n\n') || null;
  const merged: Candidate = {
    id: uid('c-'), type: a.type, title: a.title, purpose: a.purpose, exact, evidence,
    domains: [...new Set([...(a.domains ?? []), ...(b.domains ?? [])])], defaultSelected: true, edited: true, mergedFrom: [a, b],
    note: verbatim ? 'Merged by you from 2 finds. The exact words run from the first to the end of the second.' : 'Merged by you from 2 finds. The evidence shown is the first one’s.',
    ...withCautions(exact),
  };
  const snapshot = structuredClone(before);
  updateSource(sourceId, x => ({ ...x, candidates: (x.candidates ?? []).flatMap(c => (c.id === a.id ? [merged] : c.id === b.id ? [] : [c])) }));
  return { merged, undo: () => updateSource(sourceId, () => snapshot) };
}

/** REV-04: put a merged candidate back as the finds it was made from. Returns undo, or null if it wasn't merged. */
export function unmergeCandidate(sourceId: string, id: string): (() => void) | null {
  const before = sourceById(state, sourceId);
  const c = before?.candidates?.find(x => x.id === id);
  if (!before || !c?.mergedFrom?.length || !isPending(before, id)) return null;
  const snapshot = structuredClone(before);
  updateSource(sourceId, x => ({ ...x, candidates: (x.candidates ?? []).flatMap(y => (y.id === id ? c.mergedFrom! : [y])) }));
  return () => updateSource(sourceId, () => snapshot);
}

/** REV-04: split a candidate's exact words in two at a character offset (a line start). Each part keeps verbatim
 * evidence when the original's quote was its exact words. Returns undo, or the reason it can't. */
export function splitCandidate(sourceId: string, id: string, at: number): { undo: () => void; ids: [string, string] } | string {
  const before = sourceById(state, sourceId);
  const c = before?.candidates?.find(x => x.id === id);
  if (!before || !c) return 'This find has gone';
  if (!isPending(before, id)) return 'Only finds still in review can be split';
  const t = c.exact ?? '';
  const p1 = t.slice(0, at).replace(/\s+$/, ''), lead = t.slice(at).match(/^\s*/)![0].length, p2 = t.slice(at + lead).replace(/\s+$/, '');
  if (!p1.trim() || !p2.trim()) return 'Both parts need some text';
  const seg = c.evidence?.segId ? segsOf(before).find(g => g.id === c.evidence!.segId) : undefined;
  const verbatim = !!c.evidence?.quote && c.evidence.quote === t;
  const base = verbatim && seg ? seg.text.indexOf(t) : -1;
  const ev = (part: string, off: number) => !verbatim ? c.evidence
    : { ...c.evidence!, quote: part, locator: base >= 0 && seg ? relocate(c.evidence!.locator, seg, base + off, base + off + part.length) : c.evidence!.locator };
  const mk = (part: string, off: number, title: string): Candidate => ({
    id: uid('c-'), type: c.type, title, purpose: undefined, exact: part, evidence: ev(part, off), domains: c.domains ?? [], defaultSelected: true, edited: true,
    note: 'Split by you from one find.', ...withCautions(part),
  });
  const one = mk(p1, 0, c.title), two = mk(p2, at + lead, firstLine(p2));
  const snapshot = structuredClone(before);
  updateSource(sourceId, x => ({ ...x, candidates: (x.candidates ?? []).flatMap(y => (y.id === id ? [one, two] : [y])) }));
  return { ids: [one.id, two.id], undo: () => updateSource(sourceId, () => snapshot) };
}

/** REV-09: an optional reason for skipping a find (null clears it). Kept on this device only. */
export function setSkipReason(sourceId: string, candidateId: string, reason: string | null) {
  updateSource(sourceId, x => {
    const r = { ...(x.skipReasons ?? {}) };
    if (reason) r[candidateId] = reason; else delete r[candidateId];
    return { ...x, skipReasons: r };
  });
}

/** REV-08: review later. Returns undo (puts the previous snooze back). */
export function snoozeSource(id: string, until: Date): (() => void) | null {
  const before = sourceById(state, id);
  if (!before) return null;
  const was = before.snoozedUntil;
  updateSource(id, x => ({ ...x, snoozedUntil: until.toISOString() }));
  return () => updateSource(id, x => ({ ...x, snoozedUntil: was }));
}
/** REV-08: back now, before the chosen time. Returns undo. */
export function wakeSource(id: string): (() => void) | null {
  const before = sourceById(state, id);
  if (!before?.snoozedUntil) return null;
  const was = before.snoozedUntil;
  updateSource(id, x => ({ ...x, snoozedUntil: undefined }));
  return () => updateSource(id, x => ({ ...x, snoozedUntil: was }));
}

/** XEV-15: secrets and personal data in a source's stored text and its finds, worked out on this device. */
export const sensitiveIn = (src: Source) => {
  // finds' words are usually slices of the stored text: count those once
  const segs = segsOf(src).map(g => g.text);
  const extra = (src.candidates ?? []).map(c => c.exact ?? '').filter(t => t && !segs.some(g => g.includes(t)));
  return findSensitive([...segs, ...extra].join('\n'));
};
/** XEV-15: mask them everywhere the source keeps text (stored text, finds' exact words, quotes, titles), with the same
 * placeholders, so every quote stays a verbatim slice of the masked text. Returns how many were masked, and undo. */
export function maskSource(sourceId: string): { count: number; undo: () => void } | null {
  const before = sourceById(state, sourceId);
  if (!before) return null;
  const count = sensitiveIn(before).length;
  if (!count) return { count: 0, undo: () => {} };
  const m = (t: string) => maskSensitive(t);
  const snapshot = structuredClone(before);
  updateSource(sourceId, x => ({
    ...x, title: m(x.title),
    segments: segsOf(x).map(g => ({ ...g, text: m(g.text) })),
    pastedText: x.pastedText ? m(x.pastedText) : x.pastedText, minimalQuote: x.minimalQuote ? m(x.minimalQuote) : x.minimalQuote,
    candidates: (x.candidates ?? []).map(c => {
      const exact = c.exact ? m(c.exact) : c.exact;
      const keep = (c.cautions ?? []).filter(k => k.kind !== 'secret' && k.kind !== 'personal');
      const fresh = candidateCautions(exact).filter(k => k.kind === 'secret' || k.kind === 'personal');
      return {
        ...c, title: m(c.title), exact, evidence: c.evidence ? { ...c.evidence, quote: c.evidence.quote ? m(c.evidence.quote) : c.evidence.quote } : c.evidence,
        cautions: keep.length + fresh.length ? [...keep, ...fresh] : undefined,
      };
    }),
  }));
  return { count, undo: () => updateSource(sourceId, () => snapshot) };
}

/** PRV-02: "Don't send to AI" on an item or a collection. Nothing is sent to AI today; the flag waits for when it is.
 * Returns undo. */
export function setNoAi(kind: 'artifact' | 'collection', id: string, on: boolean): () => void {
  if (kind === 'artifact') {
    const was = !!artifactById(state, id)?.noAi;
    const put = (v: boolean) => patchArtifact(id, x => ({ ...x, noAi: v || undefined, history: [...(x.history ?? []), { when: nowISO(), what: v ? 'Marked Don’t send to AI' : 'Don’t send to AI removed' }] }));
    put(on);
    return () => put(was);
  }
  const was = !!state.collections.find(c => c.id === id)?.noAi;
  const put = (v: boolean) => patch(s => ({ ...s, collections: s.collections.map(c => (c.id === id ? { ...c, noAi: v || undefined } : c)) }));
  put(on);
  return () => put(was);
}
/** Whether an item is kept out of AI: its own flag, or a collection it's in. */
export const keptFromAi = (s: AppState, a: Artifact) => !!a.noAi || (a.collections ?? []).some(id => s.collections.find(c => c.id === id)?.noAi);
/* ---------------- capture and imports (Track A, 25 Oct; appended) ----------------
 * Duplicate links (CAP-04), bulk paste (CPT-16), files (CAP-06), transcripts (EXT-05), images in the Inbox and their text
 * (CAP-10, part), and imports (IMP-01, 05, 07, 08, 10, 12). Everything runs on this device. */

/** CAP-04: the saved source with the same address in canonical form (scheme, www, trailing slash and trackers ignored). */
export const savedLinkFor = (url: string): Source | undefined => findSavedLink(state.sources, url) as Source | undefined;

/** CPT-16: several links at once, each saved as its own source with its own status, in the order pasted. One Undo for all. */
export function captureLinks(urls: string[], target?: Source['target']): { sources: Source[]; undo: () => void } {
  const sources = [...urls].reverse().map(url => captureLink({ url, target })).reverse();
  const ids = new Set(sources.map(x => x.id));
  return { sources, undo: () => patch(s => ({ ...s, sources: s.sources.filter(x => !ids.has(x.id)) })) };
}

const span = (t: string, tEnd?: string) => (tEnd ? `${t}–${tEnd}` : t);
const transcriptEnd = (tr: Transcript) => Math.max(...tr.cues.map(c => c.end ?? c.start));
function transcriptCandidates(tr: Transcript, segId: string, where: string): Candidate[] {
  return transcriptPieces(tr).map(p => ({
    id: uid('c-'), type: p.type, title: p.title, exact: p.exact, domains: [], defaultSelected: true,
    evidence: { method: 'text_span', quote: p.exact, segId, t: p.t, tEnd: p.tEnd, locator: `from ${where}, ${span(p.t, p.tEnd)}` },
    note: `Found on this device by simple rules, not AI, in ${where}. ${p.why}`,
  }));
}

/** EXT-05: a pasted transcript. The stored text is the words alone; each find keeps the time of the cues it came from. */
function captureTranscript(tr: Transcript, target?: Source['target']): Source {
  const candidates = transcriptCandidates(tr, 'paste', 'the transcript you pasted');
  const first = candidates[0];
  const src: Source = {
    id: uid('s-'), kind: 'manual', author: 'You', url: null, displayUrl: 'Pasted into the capture box', savedAt: nowISO(),
    title: first ? (candidates.length > 1 ? `${first.title} and ${candidates.length - 1} more` : first.title) : `Transcript (${FORMAT_LABEL[tr.format]})`,
    access: 'excerpt_user_supplied', status: candidates.length ? 'review' : 'nothing', nothingReason: candidates.length ? undefined : 'transcript_none',
    segments: [{ id: 'paste', label: 'Transcript you pasted', text: tr.text }], candidates, extraction: 'on_device', target,
    transcript: { format: tr.format, cues: tr.cues.length, endS: transcriptEnd(tr) },
  };
  patch(s => ({ ...s, sources: [src, ...s.sources] }));
  return src;
}

/** EXT-05: a transcript pasted for a source (a video we can't read): its finds become moments of that source. */
function attachTranscript(sourceId: string, tr: Transcript): number {
  const segId = `tr-${Date.now().toString(36)}`;
  const found = transcriptCandidates(tr, segId, 'the transcript you pasted');
  updateSource(sourceId, x => {
    const segs = ((x.segments ?? []) as { id: string; label?: string; text: string }[]).filter(g => g && typeof g.text === 'string');
    return {
      ...x, extraction: 'on_device', transcript: { format: tr.format, cues: tr.cues.length, endS: transcriptEnd(tr) },
      segments: [...segs, { id: segId, label: 'Transcript you pasted', text: tr.text }],
      candidates: [...(x.candidates ?? []), ...found],
      ...(found.length ? { status: 'review' as const, failReason: undefined } : { status: 'nothing' as const, nothingReason: 'transcript_none' }),
    };
  });
  return found.length;
}

/** CAP-06: a Markdown, text, transcript or PDF file, split on this device. Finds keep their lines or page as evidence. */
export function captureDocument(d: {
  name: string; kind: NonNullable<Source['file']>['kind']; size: number; pages?: number; textless?: number;
  pieces: DocPiece[]; segments: DocSegment[];
}, target?: Source['target']): Source {
  const candidates: Candidate[] = d.pieces.map(p => ({
    id: uid('c-'), type: p.type, title: p.title, exact: p.exact, domains: [], defaultSelected: true,
    evidence: { method: 'text_span', quote: p.exact, segId: p.segId, locator: p.locator, ...(p.t ? { t: p.t, tEnd: p.tEnd } : {}) },
    note: `Found on this device by simple rules, not AI, in ${d.name}. ${p.why}`,
  }));
  const none = !candidates.length;
  const src: Source = {
    id: uid('s-'), kind: 'manual', author: 'You', url: null, displayUrl: d.name, savedAt: nowISO(), title: d.name,
    access: 'excerpt_user_supplied', status: none ? 'nothing' : 'review',
    nothingReason: none ? (d.kind === 'pdf' && !d.segments.length ? 'file_textless' : 'file_none') : undefined,
    segments: d.segments, candidates, extraction: 'on_device', target,
    file: { name: d.name, kind: d.kind, size: d.size, ...(d.pages ? { pages: d.pages, textless: d.textless ?? 0 } : {}) },
  };
  patch(s => ({ ...s, sources: [src, ...s.sources] }));
  return src;
}

/** CAP-10 (part): an image kept in the Inbox, so its text can be read on this device. The file goes in IndexedDB. */
export async function captureImage(file: Blob, name: string, note?: string, target?: Source['target']): Promise<Source> {
  const id = uid('s-');
  const key = `img:${id}`;
  await db.putBlob(key, file);
  const src: Source = {
    id, kind: 'manual', author: 'You', url: null, displayUrl: 'Image you captured', savedAt: nowISO(), title: name || 'Image',
    status: 'queued', description: note?.trim() || undefined, target, image: { key, mime: file.type || 'image/png', name: name || undefined },
  };
  patch(s => ({ ...s, sources: [src, ...s.sources] }));
  return src;
}

/** A board reference's image as a new Inbox source (its own copy of the file), to read its text. Null without an image. */
export async function imageSourceFromReference(refId: string): Promise<Source | null> {
  const r = state.references.find(x => x.id === refId);
  if (!r?.imageKey || (r.media && r.media !== 'image')) return null;
  const b = await db.getBlob(r.imageKey);
  if (!b) return null;
  return captureImage(new Blob([await b.arrayBuffer()], { type: b.type || r.mime }), r.title || 'Image from a board');
}

/* ---------------- Library images (25 Oct): an image kept straight in the Library as a Reference ---------------- */
export const LIB_IMG = 'limg:';
export const LIB_THUMB = 'lthumb:';

/** The item already holding these exact bytes, if any. */
export const libraryImageByHash = (hash: string) => state.artifacts.find(a => a.image?.hash === hash);

/** Capture bar attachments (27 Oct, #88): images attached to the bar, kept on Send with the text typed beside them.
 * One item per image (an item holds one image), all sharing the text: as the prompt (`exact`) when the chosen type is a
 * prompt, as your note otherwise. The capture is recorded in the Inbox as one reviewed source whose candidates are
 * already kept, like a single clear prompt; the items land in the Library and the chosen collection or project. One
 * Undo removes the items, the source and the files. */
export interface ImageCaptureInput {
  file: Blob; hash: string; name?: string; title: string;
  prep: { width: number; height: number; thumb?: Blob; palette?: Swatch[] };
}
export async function captureImageItems(images: ImageCaptureInput[], o: {
  type: ArtifactType; customType?: string; text?: string; target?: Source['target'];
}): Promise<{ src: Source; kept: Artifact[]; undo: () => void }> {
  const text = normalisePaste(o.text ?? '').trim();
  const asPrompt = o.type === 'prompt';
  const srcId = uid('s-');
  const now = nowISO();
  const keys: string[] = [];
  const made: { a: Artifact; c: Candidate }[] = [];
  try {
    for (const im of images) {
      const id = uid('a-'), cid = uid('c-');
      const key = LIB_IMG + id, thumbKey = im.prep.thumb ? LIB_THUMB + id : undefined;
      await db.putBlob(key, im.file); keys.push(key);
      if (im.prep.thumb && thumbKey) { await db.putBlob(thumbKey, im.prep.thumb); keys.push(thumbKey); }
      const evidence: Evidence = { method: 'user_supplied', locator: im.name ?? 'pasted image' };
      const c: Candidate = { id: cid, type: o.type, title: im.title, exact: asPrompt && text ? text : null, evidence, domains: [], defaultSelected: true };
      made.push({ c, a: {
        id, candidateId: cid, sourceId: srcId, type: o.type, customType: o.customType, title: im.title, exact: c.exact, evidence,
        note: !asPrompt && text ? text : undefined, domains: [], useCases: [],
        collections: (o.target?.collections ?? []).filter(x => state.collections.some(g => g.id === x)),
        projects: (o.target?.projects ?? []).filter(x => state.projects.some(g => g.id === x)),
        savedAt: now, review: 'user_supplied', history: [{ when: now, what: 'Captured as an image' }],
        image: { key, thumbKey, mime: im.file.type || 'image/png', width: im.prep.width, height: im.prep.height, name: im.name, hash: im.hash, palette: im.prep.palette },
      } });
    }
  } catch (e) {
    keys.forEach(k => void db.deleteBlob(k));
    throw e;
  }
  const first = made[0].a;
  const src: Source = {
    id: srcId, kind: 'manual', author: 'You', url: null, displayUrl: 'Image you captured', savedAt: now,
    title: made.length > 1 ? `${first.title} and ${made.length - 1} more` : first.title, access: 'excerpt_user_supplied',
    status: 'reviewed', extraction: 'on_device', target: o.target, candidates: made.map(m => m.c), keptIds: made.map(m => m.c.id), skippedIds: [],
    segments: text ? [{ id: 'paste', label: asPrompt ? 'Your prompt' : 'Your notes', text }] : [],
  };
  const kept = made.map(m => fileByRules(state, src, m.a)); // CUR-08: filing rules, as for any capture
  patch(s => ({ ...s, artifacts: [...kept, ...s.artifacts], sources: [src, ...s.sources] }));
  const ids = new Set(kept.map(a => a.id));
  return { src, kept, undo: () => {
    patch(s => ({ ...s, artifacts: s.artifacts.filter(x => !ids.has(x.id)), sources: s.sources.filter(x => x.id !== srcId) }));
    keys.forEach(k => void db.deleteBlob(k));
  } };
}

/** A Library item's image: its own, or the board image it was saved from. Null for items without one. */
export function itemImageOf(s: AppState, a: Artifact): { key: string; thumbKey?: string; mime: string; width: number; height: number } | null {
  if (a.image) return a.image;
  const r = a.refId ? s.references.find(x => x.id === a.refId) : undefined;
  return r?.imageKey && (!r.media || r.media === 'image') ? { key: r.imageKey, thumbKey: r.thumbKey, mime: r.mime, width: r.width, height: r.height } : null;
}

/** A Library image as a new Inbox source (its own copy of the file), to read its text. Null without an image. */
export async function imageSourceFromArtifact(id: string): Promise<Source | null> {
  const a = state.artifacts.find(x => x.id === id);
  const img = a ? itemImageOf(state, a) : null;
  const b = img ? await db.getBlob(img.key) : undefined;
  if (!a || !b) return null;
  return captureImage(new Blob([await b.arrayBuffer()], { type: b.type || img!.mime }), a.title || 'Image from the Library');
}

/** Easels (25 Oct): an easel image's blob key. */
export const EASEL_IMG = 'eimg:';
/** Every easel image key in use: on easels, and on easels in Deleted (so a restore still has its images). */
export function easelImageKeys(s: AppState): string[] {
  const all = [...(s.easels ?? []), ...s.trash.flatMap(t => (t.kind === 'easel' ? [t.item] : []))];
  return all.flatMap(e => e.items.flatMap(i => (i.kind === 'image' && i.key ? [i.key] : [])));
}

/** Library and easel image files that no item, easel or Deleted entry still uses: what "Delete forever", emptying Deleted,
 * the 30-day rule and removing an image from an easel leave behind. Swept on load rather than at once, so Undo within the
 * session still has the file. */
export async function sweepLibraryImages(): Promise<number> {
  // the open library, as loaded: its state and its own database, taken together (never after a failed load)
  if (loadFailed) return 0;
  const d = libDb, st = state;
  const used = new Set<string>(easelImageKeys(st));
  for (const a of [...st.artifacts, ...st.trash.flatMap(t => (t.kind === 'artifact' ? [t.item] : []))]) {
    if (a.image) { used.add(a.image.key); if (a.image.thumbKey) used.add(a.image.thumbKey); }
  }
  const keys = ((await d.allBlobKeys()) ?? []).map(String).filter(k => (k.startsWith(LIB_IMG) || k.startsWith(LIB_THUMB) || k.startsWith(EASEL_IMG)) && !used.has(k));
  await Promise.all(keys.map(k => d.deleteBlob(k)));
  return keys.length;
}

/** The text read from a source's image: split by the capture box's rules. Evidence says it was read from the image, and
 * how sure the reader was. Returns how many were found. */
export function attachImageText(sourceId: string, text: string, confidence: number): number {
  const t = normalisePaste(text).trim();
  const pieces = t ? findPieces(t) : [];
  const many = pieces.length > 1;
  const found: Candidate[] = pieces.map(p => ({
    id: uid('c-'), type: p.type, title: p.title, exact: p.exact, domains: [], defaultSelected: true,
    evidence: { method: 'text_span', quote: p.exact, segId: 'ocr', locator: many ? `from the image, ${lineRange(t, p.start, p.end)}` : 'from the image', ocr: { confidence } },
    note: `Read from the image on this device (${confidence}% sure), then found by simple rules, not AI. Check the words against the image. ${p.why}`,
  }));
  updateSource(sourceId, x => ({
    ...x, extraction: 'on_device', image: x.image && { ...x.image, read: { at: nowISO(), confidence } },
    segments: t ? [{ id: 'ocr', label: 'Text read from the image', text: t }] : [],
    candidates: found, keptIds: [], skippedIds: [],
    status: found.length ? 'review' : 'nothing', nothingReason: found.length ? undefined : t ? 'ocr_none' : 'ocr_empty',
  }));
  return found.length;
}

/* ---------- imports (IMP-12: small chunks, progress, pause, and links kept off the Inbox board) ---------- */
export const importById = (id: string) => (state.imports ?? []).find(b => b.id === id);

export function createImport(b: Pick<ImportBatch, 'kind' | 'name' | 'total'> & Partial<Pick<ImportBatch, 'service' | 'dest' | 'pending' | 'github'>>): ImportBatch {
  const batch: ImportBatch = { id: uid('imp-'), startedAt: nowISO(), state: 'running', done: 0, added: 0, existing: 0, skipped: 0, ...b };
  patch(s => ({ ...s, imports: [batch, ...(s.imports ?? [])] }));
  return batch;
}
export function updateImport(id: string, change: Partial<ImportBatch>) {
  patch(s => ({ ...s, imports: (s.imports ?? []).map(b => (b.id === id ? { ...b, ...change } : b)) }));
}

const cleanImportTitle = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 200);
const uniq = (xs: (string | undefined)[]) => [...new Set(xs.map(x => x?.trim()).filter((x): x is string => !!x))];

/** Links: each saved as a link only ("Link only", off the Inbox board), at the end of the list so they don't jump ahead of
 * what you saved yourself. A link already saved (canonical address) is counted, not saved twice. */
export function importLinks(id: string, links: ImportLink[]): { added: number; existing: number; skipped: number } {
  const have = new Set(state.sources.map(x => (x.url ? canonicalUrl(x.url) : null)).filter(Boolean));
  const made: Source[] = [];
  let existing = 0, skipped = 0;
  for (const l of links) {
    const c = canonicalUrl(l.url);
    if (!c) { skipped++; continue; }
    if (have.has(c)) { existing++; continue; }
    have.add(c);
    let info: ReturnType<typeof describeLink>;
    try { info = describeLink(l.url); } catch { skipped++; continue; }
    made.push({
      id: uid('s-'), kind: info.kind, title: cleanImportTitle(l.title) || info.title, url: l.url, displayUrl: info.display, savedAt: nowISO(),
      status: 'bookmark', importId: id, labels: uniq([l.folder, ...(l.tags ?? []), ...(l.labels ?? [])]).slice(0, 12),
      description: l.note?.slice(0, 2000) || undefined, author: info.kind === 'github' ? l.title.split('/')[0] : undefined,
    });
  }
  if (made.length) patch(s => ({ ...s, sources: [...s.sources, ...made] }));
  return { added: made.length, existing, skipped };
}

const MAX_IMPORT_CANDIDATES = 50;
type ImportSeg = { id: string; label: string; text: string };
/** Inbox imports fill one source at a time, up to 50 finds each, so a big import is a few cards to review. */
function fillInbox(id: string, cands: Candidate[], segs: ImportSeg[]) {
  let rest = cands;
  while (rest.length) {
    const b = importById(id);
    if (!b) return;
    let open = b.openSourceId ? sourceById(state, b.openSourceId) : undefined;
    if (!open || open.status !== 'review' || (open.candidates?.length ?? 0) >= MAX_IMPORT_CANDIDATES) {
      const n = state.sources.filter(x => x.importId === id).length + 1;
      const fresh: Source = {
        id: uid('s-'), kind: 'manual', author: 'You', url: null, displayUrl: b.name, savedAt: nowISO(), title: n > 1 ? `${b.name} (${n})` : b.name,
        access: 'excerpt_user_supplied', status: 'review', segments: [], candidates: [], extraction: 'on_device', importId: id,
      };
      patch(s => ({ ...s, sources: [fresh, ...s.sources], imports: (s.imports ?? []).map(x => (x.id === id ? { ...x, openSourceId: fresh.id } : x)) }));
      open = fresh;
    }
    const room = MAX_IMPORT_CANDIDATES - (open.candidates?.length ?? 0);
    const take = rest.slice(0, room);
    const segIds = new Set(take.map(c => c.evidence?.segId));
    updateSource(open.id, x => {
      const have = (x.segments ?? []) as ImportSeg[];
      const add = segs.filter(g => segIds.has(g.id) && !have.some(h => h.id === g.id));
      return { ...x, segments: [...have, ...add], candidates: [...(x.candidates ?? []), ...take] };
    });
    rest = rest.slice(room);
  }
}

/** Library imports go on top of the Library in file order (after the ones this import already added). */
function addToLibrary(id: string, made: Artifact[]) {
  if (!made.length) return;
  patch(s => {
    let at = 0;
    s.artifacts.forEach((a, i) => { if (a.importId === id) at = i + 1; });
    const xs = [...s.artifacts]; xs.splice(at, 0, ...made);
    return { ...s, artifacts: xs };
  });
}
const textKnown = () => new Set([
  ...state.artifacts.map(a => a.exact?.trim()),
  ...state.sources.flatMap(x => (x.candidates ?? []).map(c => c.exact?.trim())),
].filter((x): x is string => !!x));

/** IMP-08: prompts, into the Library (evidence "You added", with the file and row) or into the Inbox to review. A prompt
 * whose exact text is already kept or waiting in review is counted, not added twice. */
export function importPrompts(id: string, prompts: ImportPrompt[]): { added: number; existing: number; skipped: number } {
  const b = importById(id);
  if (!b) return { added: 0, existing: 0, skipped: 0 };
  const known = textKnown();
  const fresh = prompts.filter(p => { const k = p.text.trim(); if (known.has(k)) return false; known.add(k); return true; });
  const when = nowISO();
  if ((b.dest ?? 'library') === 'library') {
    addToLibrary(id, fresh.map(p => ({
      id: uid('a-'), type: p.template ? 'template' : 'prompt', title: p.title, exact: p.text,
      evidence: { method: 'user_supplied', locator: p.where }, domains: [], useCases: [], tags: p.tags, collections: [], projects: [],
      savedAt: when, review: 'user_supplied', history: [{ when, what: `Imported from ${b.name}` }], importId: id,
    } satisfies Artifact)));
  } else {
    const segs: ImportSeg[] = [];
    const cands: Candidate[] = fresh.map(p => {
      const segId = `imp-${uid()}`;
      segs.push({ id: segId, label: p.where, text: p.text });
      return {
        id: uid('c-'), type: p.template ? 'template' : 'prompt', title: p.title, exact: p.text, domains: [], defaultSelected: true,
        evidence: { method: 'user_supplied', quote: p.text, segId, locator: p.where }, note: `From your import of ${b.name}.`,
      };
    });
    fillInbox(id, cands, segs);
  }
  return { added: fresh.length, existing: prompts.length - fresh.length, skipped: 0 };
}

/** IMP-10: notes. Each note is split by the capture box's rules; what's found keeps the note's path and lines. Notes with
 * nothing to unpack are counted as skipped, not kept. */
export function importNotes(id: string, files: TextFile[]): { added: number; existing: number; skipped: number } {
  const b = importById(id);
  if (!b) return { added: 0, existing: 0, skipped: 0 };
  const { pieces, empty } = piecesFromNotes(files);
  const known = textKnown();
  const fresh = pieces.filter(p => { const k = p.exact.trim(); if (known.has(k)) return false; known.add(k); return true; });
  const when = nowISO();
  if ((b.dest ?? 'inbox') === 'library') {
    addToLibrary(id, fresh.map(p => ({
      id: uid('a-'), type: p.type, title: p.title, exact: p.exact, evidence: { method: 'user_supplied', quote: p.exact, locator: p.locator },
      domains: [], useCases: [], collections: [], projects: [], savedAt: when, review: 'user_supplied',
      history: [{ when, what: `Imported from your notes (${b.name})` }], importId: id,
    } satisfies Artifact)));
  } else {
    const segOf = new Map<string, ImportSeg>();
    const cands: Candidate[] = fresh.map(p => {
      let g = segOf.get(p.path);
      if (!g) { g = { id: `note-${uid()}`, label: p.path, text: p.fileText }; segOf.set(p.path, g); }
      return {
        id: uid('c-'), type: p.type, title: p.title, exact: p.exact, domains: [], defaultSelected: true,
        evidence: { method: 'user_supplied', quote: p.exact, segId: g.id, locator: p.locator },
        note: `Found in your note by simple rules on this device, not AI. ${p.why}`,
      };
    });
    fillInbox(id, cands, [...segOf.values()]);
  }
  // notes, not pieces: a note is "already here" when everything found in it is already kept or in review
  const withFinds = new Set(pieces.map(p => p.path)), withFresh = new Set(fresh.map(p => p.path));
  return { added: withFresh.size, existing: withFinds.size - withFresh.size, skipped: empty };
}

/** Triage: imported links sent to the Inbox (Processing, where a GitHub link can be read). Returns undo. */
export function sendImportedToInbox(ids: string[]): () => void {
  const set = new Set(ids);
  const before = new Map(state.sources.filter(x => set.has(x.id)).map(x => [x.id, x.status]));
  patch(s => ({ ...s, sources: s.sources.map(x => (set.has(x.id) && x.status === 'bookmark' ? { ...x, status: 'queued' } : x)) }));
  return () => patch(s => ({ ...s, sources: s.sources.map(x => (before.has(x.id) ? { ...x, status: before.get(x.id)! } : x)) }));
}

/** Triage: sources moved to Deleted in one go (restorable there, each to its place). Returns undo. */
export function trashSources(ids: string[]): () => void {
  const set = new Set(ids);
  const when = nowISO();
  const entries: TrashEntry[] = state.sources.flatMap((item, index) => (set.has(item.id) ? [{ kind: 'source' as const, item, deletedAt: when, from: { place: 'inbox' as const, index } }] : []));
  patch(s => ({ ...s, sources: s.sources.filter(x => !set.has(x.id)), trash: [...entries, ...s.trash.filter(t => !(t.kind === 'source' && set.has(t.item.id)))] }));
  return () => entries.forEach(e => restoreFromTrash('source', e.item.id));
}

/** Takes an import back: its record, its links still saved as links only, its Inbox sources nothing was kept from, and its
 * Library items not changed since. Anything you've worked on stays. Returns how many items went and an undo. */
export function removeImport(id: string): { removed: number; undo: () => void } {
  const goneSources = state.sources.flatMap((x, i) => (x.importId === id && (x.status === 'bookmark' || (x.status === 'review' && !(x.keptIds ?? []).length)) ? [{ i, x }] : []));
  const goneArtifacts = state.artifacts.flatMap((a, i) => (a.importId === id && (a.history?.length ?? 0) <= 1 && !a.yours && !a.uses?.length ? [{ i, x: a }] : []));
  const batchAt = (state.imports ?? []).findIndex(b => b.id === id);
  const batch = importById(id);
  const sIds = new Set(goneSources.map(g => g.x.id)), aIds = new Set(goneArtifacts.map(g => g.x.id));
  patch(s => ({ ...s, imports: (s.imports ?? []).filter(b => b.id !== id), sources: s.sources.filter(x => !sIds.has(x.id)), artifacts: s.artifacts.filter(a => !aIds.has(a.id)) }));
  const putBack = <T extends { id: string }>(xs: T[], gone: { i: number; x: T }[]) => {
    const ys = [...xs]; const have = new Set(ys.map(y => y.id));
    for (const { i, x } of gone) if (!have.has(x.id)) ys.splice(Math.min(i, ys.length), 0, x);
    return ys;
  };
  const removed = goneArtifacts.length + goneSources.reduce((n, g) => n + (g.x.status === 'bookmark' ? 1 : g.x.candidates?.length ?? 0), 0);
  return {
    removed,
    undo: () => patch(s => {
      const imports = [...(s.imports ?? [])];
      if (batch && !imports.some(b => b.id === id)) imports.splice(Math.max(0, batchAt), 0, { ...batch, state: batch.state === 'running' ? 'paused' : batch.state });
      return { ...s, sources: putBack(s.sources, goneSources), artifacts: putBack(s.artifacts, goneArtifacts), imports };
    }),
  };
}
