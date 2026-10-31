/* Inbox and review: pure helpers shared by both screens (grouping, reason lines, labels, seen state). */
import { AtSign, FolderGit2, Newspaper, SquarePlay, StickyNote, type LucideIcon } from '@/components/ui/icons';
import { METHOD_LABEL } from '@/lib/format';
import { pendingCandidates } from '@/lib/store';
import type { Candidate, EvidenceMethod, Source, SourceKind, SourceStatus } from '@/lib/types';

export const KIND_ICON: Record<SourceKind, LucideIcon> = {
  video: SquarePlay, github: FolderGit2, article: Newspaper, x: AtSign, manual: StickyNote,
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type GroupKey = 'review' | 'needs' | 'progress' | 'nothing' | 'done';
export const GROUPS: { key: GroupKey; title: string; hint: string }[] = [
  { key: 'review', title: 'Ready to review', hint: 'Keep what’s useful. The rest is skipped, not deleted.' },
  { key: 'needs', title: 'Needs you', hint: 'Saved, but Capsa couldn’t read everything.' },
  { key: 'progress', title: 'Processing / Queued', hint: 'Saved and waiting to be unpacked.' },
  { key: 'nothing', title: 'Nothing to unpack', hint: 'Saved fine. There was no reusable resource inside.' },
  { key: 'done', title: 'Done', hint: 'Reviewed or kept as a link.' },
];

export function groupOf(src: Source): GroupKey {
  switch (src.status) {
    case 'review': return pendingCandidates(src).length ? 'review' : 'done';
    case 'needs_thread': case 'failed': return 'needs';
    case 'queued': case 'processing': return 'progress';
    case 'nothing': return 'nothing';
    default: return 'done';
  }
}

/** Tag tone per status. Amber is for things that need the user; nothing here is red (a failed read isn't danger). */
export const STATUS_TONE: Record<SourceStatus, string> = {
  review: 'accent', needs_thread: 'warn', failed: 'warn', queued: 'neutral', processing: 'neutral',
  nothing: 'neutral', reviewed: 'ok', bookmark: 'neutral',
};

/** A newly captured source that is waiting for an extraction service v1 doesn't have. */
export const isAwaitingService = (src: Source) => (src.status === 'queued' || src.status === 'processing') && !src.demo;

const METHOD_SHORT: Record<EvidenceMethod, string> = {
  text_span: 'quoted', creator_metadata: 'said by the creator', ai_located: 'found by AI', user_supplied: 'added by you',
};

export function methodCounts(cands: Candidate[]) {
  const m = new Map<EvidenceMethod, number>();
  for (const c of cands) if (c.evidence) m.set(c.evidence.method, (m.get(c.evidence.method) ?? 0) + 1);
  return [...m.entries()];
}

export const NOTHING_REASON: Record<string, { title: string; line: string; body: string }> = {
  gated: {
    title: 'Nothing to unpack: the author gated it',
    line: 'The post asks people to comment to get the content',
    body: 'The post asks for comments to send the content.',
  },
  paste_none: {
    title: 'Kept as a note: nothing to unpack',
    line: 'No prompt, steps, [blanks] or code found on this device',
    body: 'No instructions, steps, [blanks] or code found on this device. To keep it as a prompt, capture it again with Prompt selected.',
  },
  github_none: {
    title: 'Nothing to unpack from GitHub',
    line: 'No README or SKILL.md found on GitHub',
    body: 'No README or SKILL.md, or the repository is private.',
  },
  github_empty: {
    title: 'Nothing to unpack from GitHub',
    line: 'Read from GitHub · no prompt, steps or config found',
    body: 'No prompts, steps, [blanks] or configs in the README or SKILL.md.',
  },
  marked: {
    title: 'Nothing to unpack',
    line: 'Marked as nothing useful',
    body: 'You marked it as nothing useful. What was found is skipped, not deleted.',
  },
  // Track A (25 Oct): files, transcripts and text read from images
  file_none: {
    title: 'Kept as a file: nothing to unpack',
    line: 'No prompt, steps, [blanks] or code found in the file',
    body: 'No instructions, steps, [blanks] or code found in this file on this device.',
  },
  file_textless: {
    title: 'No text in this PDF',
    line: 'The pages have no text layer (a scan?)',
    body: 'Its pages are images without a text layer, so there was nothing to read. Scanned pages aren’t read in this version.',
  },
  transcript_none: {
    title: 'Transcript read: nothing to unpack',
    line: 'No prompt, steps, [blanks] or code in the transcript',
    body: 'The transcript is kept with the source. No instructions, steps, [blanks] or code were found in it on this device.',
  },
  ocr_none: {
    title: 'Text read: nothing to unpack',
    line: 'Text read from the image · no prompt, steps or code',
    body: 'The text was read on this device. No instructions, steps, [blanks] or code were found in it.',
  },
  ocr_empty: {
    title: 'No text found in the image',
    line: 'No text found in the image',
    body: 'No words could be read from this image on this device.',
  },
  opinion: {
    title: 'Nothing to unpack',
    line: 'An opinion piece, with no prompts, tools or steps inside',
    body: 'An opinion piece, with nothing reusable inside.',
  },
};

/** The one-line reason shown under the title in the Inbox ("5 candidates · 2 AI-located"). */
export function reasonLine(src: Source): string {
  switch (src.status) {
    case 'review': {
      const pend = pendingCandidates(src);
      if (!pend.length) return 'Everything here has been decided';
      const ai = pend.filter(c => c.evidence?.method === 'ai_located').length;
      const cautions = pend.filter(c => c.cautions?.length).length;
      return [`${pend.length} found`, ai ? `${ai} found by AI` : '', cautions ? plural(cautions, 'caution') : '', src.extraction === 'on_device' ? 'found on this device' : '']
        .filter(Boolean).join(' · ');
    }
    case 'needs_thread': return 'The prompt may be in the replies. Paste it to keep it';
    case 'failed': return `Couldn’t read: ${src.failReason ?? 'the source couldn’t be accessed'}`;
    case 'nothing': return NOTHING_REASON[src.nothingReason ?? '']?.line ?? 'No reusable resource found inside';
    case 'queued':
    case 'processing':
      if (src.image) return 'Image · text not read yet';
      if (src.kind === 'github' && !src.demo) return src.status === 'processing' ? 'Reading from GitHub…' : 'Saved · reading GitHub links asks first (Settings)';
      return src.demo
        ? (src.queuedOffline ? 'Saved offline · waiting to be unpacked' : 'Waiting to be unpacked')
        : 'Saved · the extraction service isn’t connected in this version';
    case 'reviewed': {
      const { kept, skipped } = reviewCounts(src);
      return `${plural(kept, 'resource')} kept${skipped ? ` · ${skipped} skipped` : ''}`;
    }
    case 'bookmark': return 'Link only, nothing kept';
  }
}

export function reviewCounts(src: Source) {
  const kept = src.keptIds?.length ?? src.kept ?? 0;
  const skipped = src.skippedIds?.length ?? src.skipped ?? 0;
  return { kept, skipped };
}

export const hostOf = (src: Source) => {
  if (src.url) { try { return new URL(src.url).hostname.replace(/^www\./, ''); } catch { /* fall through */ } }
  return src.displayUrl ?? '';
};
/** Author when it is a real name; otherwise the host. "—" and "Unknown" are treated as missing. */
export const byline = (src: Source) => {
  const a = src.author?.trim();
  return a && a !== '—' && a !== 'Unknown' ? a : hostOf(src) || (src.kind === 'manual' ? 'You' : '');
};

export { METHOD_LABEL, METHOD_SHORT };

/* ---------- read state (per browser; a viewer convenience, not library data) ---------- */
const SEEN_KEY = 'capsa-inbox-seen';
export function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
export function markSeen(id: string) {
  try {
    const s = readSeen(); if (s.has(id)) return;
    s.add(id); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-500)));
  } catch { /* private mode: rows simply stay bold */ }
}

/** Badge tone per status (the badge dot); words always say the status. */
export const BADGE_TONE: Record<SourceStatus, string> = {
  review: 'accent', needs_thread: 'warn', failed: 'warn', queued: 'neutral', processing: 'neutral', nothing: 'faint', reviewed: 'ok', bookmark: 'faint',
};
