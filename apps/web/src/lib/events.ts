/* Activity (sidebar plan item 5, 25 Oct): what happened in this library, built only from what the library already
 * records. Nothing here is invented or stored; it is read from the current library's state each time.
 *   Library items: when each was saved (savedAt) and every entry in its history.
 *   Inbox sources: when each was captured (savedAt) and, for an image, when its text was read.
 *   Boards: when each was started (createdAt) and last changed (updatedAt).
 *   Deleted: when each entry was deleted (deletedAt), with where it came from. */
import { has } from './features';
import type { AppState, Artifact, Board, Easel, Source, TrashEntry } from '@/lib/types';

export type Area = 'library' | 'inbox' | 'boards' | 'deleted';
export interface ActEvent { at: string; what: string }
export type Subject =
  | { kind: 'artifact'; item: Artifact }
  | { kind: 'source'; item: Source }
  | { kind: 'board'; item: Board }
  | { kind: 'easel'; item: Easel }
  | { kind: 'deleted'; entry: TrashEntry };
/** One thing that something happened to, with every event recorded for it. */
export interface Thing { key: string; area: Area; title: string; href: string; subject: Subject; events: ActEvent[] }

const valid = (iso?: string): iso is string => !!iso && !Number.isNaN(+new Date(iso));
/** A history entry written when the item was saved ("Kept from review board") already says how it was saved. */
const sameMoment = (a: string, b: string) => Math.abs(+new Date(a) - +new Date(b)) < 60_000;

export function things(s: AppState): Thing[] {
  const out: Thing[] = [];
  for (const x of s.artifacts) {
    const history = (x.history ?? []).filter(h => valid(h.when) && h.what).map(h => ({ at: h.when, what: h.what }));
    const saved = valid(x.savedAt) && !history.some(h => sameMoment(h.at, x.savedAt)) ? [{ at: x.savedAt, what: x.importId ? 'Imported' : 'Saved' }] : [];
    out.push({ key: `a:${x.id}`, area: 'library', title: x.title || 'Untitled', href: `/library/${x.id}`, subject: { kind: 'artifact', item: x }, events: [...saved, ...history] });
  }
  for (const x of s.sources) {
    const events: ActEvent[] = [];
    if (valid(x.savedAt)) events.push({ at: x.savedAt, what: x.importId ? 'Imported' : 'Captured' });
    const read = x.image?.read?.at;
    if (valid(read)) events.push({ at: read, what: 'Text read from the image' });
    out.push({ key: `s:${x.id}`, area: 'inbox', title: x.title || 'Untitled', href: `/inbox/${x.id}`, subject: { kind: 'source', item: x }, events });
  }
  // boards and easels only where the Playground is (lib/features.ts): elsewhere their pages don't exist
  for (const b of has('playground') ? s.boards : []) {
    const events: ActEvent[] = [];
    if (valid(b.createdAt)) events.push({ at: b.createdAt, what: 'Board started' });
    if (valid(b.updatedAt) && !(valid(b.createdAt) && sameMoment(b.updatedAt, b.createdAt))) events.push({ at: b.updatedAt, what: 'Board changed' });
    out.push({ key: `b:${b.id}`, area: 'boards', title: b.title || 'Untitled board', href: `/boards/${b.id}`, subject: { kind: 'board', item: b }, events });
  }
  for (const x of has('playground') ? s.easels ?? [] : []) {
    const events: ActEvent[] = [];
    if (valid(x.createdAt)) events.push({ at: x.createdAt, what: 'Easel started' });
    if (valid(x.updatedAt) && !(valid(x.createdAt) && sameMoment(x.updatedAt, x.createdAt))) events.push({ at: x.updatedAt, what: 'Easel changed' });
    out.push({ key: `e:${x.id}`, area: 'boards', title: x.title || 'Untitled easel', href: `/easels/${x.id}`, subject: { kind: 'easel', item: x }, events });
  }
  for (const t of s.trash ?? []) {
    out.push({ key: `t:${t.kind}:${t.item.id}`, area: 'deleted', title: t.item.title || 'Untitled', href: '/deleted', subject: { kind: 'deleted', entry: t },
      events: valid(t.deletedAt) ? [{ at: t.deletedAt, what: 'Deleted' }] : [] });
  }
  return out;
}

/** A calendar day in this browser's time zone, as YYYY-MM-DD (safe across clock changes, unlike counting milliseconds). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function dayLabel(key: string, now = new Date()): string {
  if (key === dayKey(now)) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (key === dayKey(y)) return 'Yesterday';
  const [yy, mm, dd] = key.split('-').map(Number);
  const d = new Date(yy, mm - 1, dd);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...(yy !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export interface Day { key: string; things: Thing[]; count: number }

/** Days newest first; on each day, each thing once with that day's events (newest first), things by their newest event. */
export function byDay(list: Thing[]): Day[] {
  const days = new Map<string, Map<string, Thing>>();
  for (const t of list) {
    for (const e of t.events) {
      const k = dayKey(new Date(e.at));
      const day = days.get(k) ?? new Map<string, Thing>();
      const node = day.get(t.key) ?? { ...t, events: [] };
      node.events.push(e);
      day.set(t.key, node);
      days.set(k, day);
    }
  }
  const newest = (x: ActEvent, y: ActEvent) => +new Date(y.at) - +new Date(x.at);
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, m]) => {
    const ts = [...m.values()].map(t => ({ ...t, events: t.events.sort(newest) })).sort((a, b) => newest(a.events[0], b.events[0]));
    return { key, things: ts, count: ts.reduce((n, t) => n + t.events.length, 0) };
  });
}
