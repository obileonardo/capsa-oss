'use client';
/* Runs an import in small chunks (IMP-12): progress after each chunk, Pause between chunks, and what's left kept in the
 * import's record, so a paused or interrupted import resumes, also after a reload. GitHub stars fetch one page of 100
 * at a time, only while reading GitHub is switched on in Settings; GitHub's hourly limit pauses the import. */
import { useSyncExternalStore } from 'react';
import { getState, importById, importLinks, importNotes, importPrompts, updateImport } from '@/lib/store';
import type { ImportBatch } from '@/lib/types';
import { fetchStars } from './github';
import type { ImportLink, ImportPrompt, TextFile } from './parse';

const CHUNK: Record<ImportBatch['kind'], number> = { bookmarks: 200, links: 200, github: 100, prompts: 50, notes: 20 };
/** A short rest between chunks, so the page stays responsive and Pause lands between chunks. */
const REST_MS = 60;

const live = new Set<string>();
const subs = new Set<() => void>();
const ping = () => subs.forEach(f => f());
/** Is this import running in this tab now? (A record left 'running' by a closed tab shows as paused.) */
export const useLiveImports = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => [...live].join(','), () => '');
export const isLive = (id: string) => live.has(id);

const rest = () => new Promise(r => setTimeout(r, REST_MS));

/** Start or resume an import. Stops by itself when it's done, paused, stopped or removed. */
export async function runImport(id: string, fetchImpl?: typeof fetch): Promise<void> {
  if (live.has(id)) return;
  const b0 = importById(id);
  if (!b0 || b0.state === 'done' || b0.state === 'stopped') return;
  if (b0.state !== 'running') updateImport(id, { state: 'running', error: undefined });
  live.add(id); ping();
  try {
    for (;;) {
      const b = importById(id);
      if (!b || b.state !== 'running') break;
      let pending = b.pending ?? [];
      if (b.kind === 'github' && !pending.length) {
        const g = b.github;
        if (!g?.more) { finish(id); break; }
        if (!getState().prefs.readGithub) { updateImport(id, { state: 'paused', error: 'Reading GitHub is off in Settings › Capture.' }); break; }
        const r = await fetchStars(g.user, g.nextPage, fetchImpl);
        if (!importById(id) || importById(id)!.state !== 'running') break;
        if (!r.ok) { updateImport(id, { state: 'paused', error: r.reason }); break; }
        pending = r.links;
        updateImport(id, { pending, total: b.total + r.links.length, github: { ...g, nextPage: g.nextPage + 1, more: r.more } });
        if (!r.links.length) { finish(id); break; }
      }
      const cur = importById(id)!;
      const take = pending.slice(0, CHUNK[cur.kind]);
      const left = pending.slice(take.length);
      const r = cur.kind === 'prompts' ? importPrompts(id, take as ImportPrompt[])
        : cur.kind === 'notes' ? importNotes(id, take as TextFile[])
        : importLinks(id, take as ImportLink[]);
      const after = importById(id);
      if (!after) break;
      updateImport(id, { pending: left, done: after.done + take.length, added: after.added + r.added, existing: after.existing + r.existing, skipped: after.skipped + r.skipped });
      if (!left.length && !(cur.kind === 'github' && importById(id)?.github?.more)) { finish(id); break; }
      await rest();
    }
  } finally {
    live.delete(id); ping();
  }
}

function finish(id: string) { updateImport(id, { state: 'done', pending: undefined, finishedAt: new Date().toISOString(), error: undefined }); }

export function pauseImport(id: string) { const b = importById(id); if (b && b.state === 'running') updateImport(id, { state: 'paused' }); }
export function stopImport(id: string) { const b = importById(id); if (b && b.state !== 'done') updateImport(id, { state: 'stopped', pending: undefined, finishedAt: new Date().toISOString() }); }
