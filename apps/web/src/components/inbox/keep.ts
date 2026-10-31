/* What the user has ticked to keep, per source, shared by the Inbox's review panel and its drag and drop
 * (dropping a card on Done files exactly what the panel shows as ticked). Lives for the session, like the panel did. */
import { useSyncExternalStore } from 'react';
import { pendingCandidates } from '@/lib/store';
import type { Candidate, Source } from '@/lib/types';

/** Default keep: everything except AI-located moments nobody has confirmed (same rule as the review board). */
export const keptByDefault = (c: Candidate) => c.defaultSelected !== false && (c.evidence?.method !== 'ai_located' || !!c.evidence.confirmed);

let choices: Record<string, Record<string, boolean>> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function setKeep(sourceId: string, candidateId: string, on: boolean) {
  choices = { ...choices, [sourceId]: { ...(choices[sourceId] ?? {}), [candidateId]: on } };
  emit();
}

export function useKeep(sourceId: string): Record<string, boolean> {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => choices[sourceId] ?? EMPTY,
    () => EMPTY,
  );
}
const EMPTY: Record<string, boolean> = {};

export const isKept = (sourceId: string, c: Candidate) => choices[sourceId]?.[c.id] ?? keptByDefault(c);

/** The pending candidates the user would keep right now. */
export const keptIdsFor = (src: Source) => pendingCandidates(src).filter(c => isKept(src.id, c)).map(c => c.id);
