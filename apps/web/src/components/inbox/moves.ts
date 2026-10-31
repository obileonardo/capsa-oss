/* The Inbox as a pipeline: four columns in the order a source travels, and what moving a card between them means.
 * Every move is a real state change with an Undo; moves that would mean nothing are refused, with the reason. */
import { fileCandidates, markNothing, pendingCandidates, reopenSource, requeueSource, saveLinkOnly } from '@/lib/store';
import type { Source } from '@/lib/types';
import { groupOf, plural } from './model';
import { keptIdsFor } from './keep';

export type ColumnKey = 'review' | 'progress' | 'nothing' | 'done';
export const COLUMNS: { key: ColumnKey; title: string }[] = [
  { key: 'review', title: 'Ready to review' },
  { key: 'progress', title: 'Processing' },
  { key: 'nothing', title: 'Nothing to unpack' },
  { key: 'done', title: 'Done' },
];

/** "Needs you" (the prompt may be in a reply, or the source couldn't be read) is work waiting on the user, like a review,
 * so it sits in Ready to review with its own flag rather than a fifth column. */
export const columnOf = (src: Source): ColumnKey => {
  const g = groupOf(src);
  return g === 'needs' ? 'review' : g;
};
export const needsYou = (src: Source) => src.status === 'needs_thread' || src.status === 'failed';

const canReopen = (src: Source) => (src.candidates ?? []).some(c => !(src.keptIds ?? []).includes(c.id));

/** null when the move is allowed; otherwise the short reason it isn't. */
export function refuseMove(src: Source, to: ColumnKey): string | null {
  const from = columnOf(src);
  if (from === to) return 'Already here';
  // Ready to review, Processing and Nothing to unpack trade cards freely; Done is the end of the line (its ⋯ menu can reopen)
  if (to === 'progress') return from === 'done' ? 'Already reviewed' : null;
  if (to === 'review') return canReopen(src) ? null : from === 'progress' ? 'Nothing found to review yet' : 'Nothing left to review';
  if (to === 'nothing') return from === 'done' ? 'Already reviewed' : null;
  return null; // to done: file what's ticked, or keep the link
}

/** Deleting (24 Oct): Ready to review, Processing and Nothing to unpack can be deleted (they go to Deleted); Done never can.
 * null when it can be deleted; otherwise the short reason. Processing asks first, because deleting stops it (askToStop). */
export function refuseDelete(src: Source): string | null {
  return columnOf(src) === 'done' ? 'Done items can’t be deleted' : null;
}
export const askToStop = (src: Source) => columnOf(src) === 'progress';

/** What a dragged card may be dropped on: a column (as Move to…) or the bin. A Done card can be picked up, so the bin can
 * show it won't take it, but it stays in Done: reopening is in its ⋯ menu. */
export function refuseDrop(src: Source, to: ColumnKey | 'bin'): string | null {
  if (to === 'bin') return refuseDelete(src);
  if (columnOf(src) === 'done' && to !== 'done') return refuseMove(src, to) ?? 'Reopen it from its ⋯ menu';
  return refuseMove(src, to);
}

export interface MoveResult { message: string; undo: () => void }

/** Make the move. Returns the toast message and Undo, or null if nothing changed. */
export function moveSource(src: Source, to: ColumnKey): MoveResult | null {
  if (refuseMove(src, to)) return null;
  if (to === 'done') {
    const ids = src.status === 'review' ? keptIdsFor(src) : [];
    if (ids.length) {
      const undo = fileCandidates(src.id, ids);
      if (!undo) return null;
      const skipped = pendingCandidates(src).length - ids.length;
      return { message: `Saved ${ids.length} to Library${skipped ? ` · ${skipped} skipped` : ''}`, undo };
    }
    return { message: 'Kept as a link', undo: saveLinkOnly(src.id) };
  }
  if (to === 'nothing') return { message: 'Marked as nothing to unpack', undo: markNothing(src.id) };
  if (to === 'progress') {
    const undo = requeueSource(src.id);
    return undo ? { message: 'Back in Processing · waiting to be read', undo } : null;
  }
  const undo = reopenSource(src.id);
  if (!undo) return null;
  const n = (src.candidates ?? []).filter(c => !(src.keptIds ?? []).includes(c.id)).length;
  return { message: `Back in Ready to review · ${n} found`, undo };
}
