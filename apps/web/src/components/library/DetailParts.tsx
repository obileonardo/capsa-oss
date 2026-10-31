'use client';
/* Item page sections: evidence (method first) and the vertical history log. */
import {
  Archive, ArrowRight, Clock, ExternalLink, Eraser, FolderPlus, PenLine, Sparkles, Bookmark, Tag, Target, TextQuote, Undo2, UserRound,
  type LucideIcon,
} from '@/components/ui/icons';
import Link from 'next/link';
import { evidenceLabel, relTime } from '@/lib/format';
import type { Artifact, Board, EvidenceMethod, Source } from '@/lib/types';
import d from './detail.module.css';
import { ReadReferenceText } from '@/components/review/SourceImage';
import { has } from '@/lib/features';

const METHOD_ICON: Record<EvidenceMethod, LucideIcon> = { text_span: TextQuote, creator_metadata: UserRound, ai_located: Sparkles, user_supplied: PenLine };
const METHOD_NOTE: Record<EvidenceMethod, string> = {
  text_span: 'These exact words were found in the source.',
  creator_metadata: 'Stated by the creator in a title, chapter or description. Capsa didn’t match it against the content itself.',
  ai_located: 'AI found this moment and transcribed the words. Confirming the moment doesn’t confirm the words.',
  user_supplied: 'You added this text yourself.',
};

/** A quote that is just the item's own text (or its start) is already on the page above; show it once. */
function inText(quote: string, a: Artifact): boolean {
  const norm = (x: string) => x.replace(/[…]|\.\.\.$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const q = norm(quote), texts = [a.exact, a.yours].filter(Boolean).map(x => norm(x!));
  return q.length > 0 && texts.some(x => x.includes(q));
}

/** The source itself, at the evidence's moment for videos. */
function originalUrl(a: Artifact, src?: Source): string | null {
  if (!src?.url) return null;
  const at = a.evidence?.t;
  if (!at || src.kind !== 'video') return src.url;
  const sec = at.split(':').map(Number).reduce((n, x) => n * 60 + (Number.isFinite(x) ? x : 0), 0);
  return `${src.url}${src.url.includes('?') ? '&' : '?'}t=${sec}s`;
}

/** The complete "Where it came from": method, quote, locator and moment, and the links back to the original, its
 * source review, or the board it was saved from. */
export function EvidenceBlock({ a, src, board }: { a: Artifact; src?: Source; board?: Board }) {
  const e = a.evidence;
  const Icon = e ? METHOD_ICON[e.method] : TextQuote;
  const openUrl = originalUrl(a, src);
  const at = e?.t && src?.kind === 'video' ? e.t : null;
  const links = (src || board) && (
    <p className={d.evLinks}>
      {openUrl && <a href={openUrl} target="_blank" rel="noopener noreferrer" className={d.evLink}>{at ? `Open the original at ${at}` : 'Open the original'}<ExternalLink aria-hidden /><span className="sr-only"> (new tab)</span></a>}
      {src && <Link href={`/inbox/${src.id}`} className={d.evLink}>Source review<ArrowRight aria-hidden /></Link>}
      {board && has('playground') && <Link href={`/boards/${board.id}${a.refId ? `?ref=${encodeURIComponent(a.refId)}` : ''}`} className={d.evLink}>{a.refId ? 'Open in its board' : 'Open the board'}<ArrowRight aria-hidden /></Link>}
      {a.refId && <ReadReferenceText refId={a.refId} className={d.evLink} />}
    </p>
  );
  return (
    <section className={d.block} aria-labelledby="ev-h">
      <div className={d.sectionHead}><h2 id="ev-h" className={d.h2}>Where it came from</h2></div>
      {!e ? (
        <div className={d.none}><b>Not recorded</b>{links}</div>
      ) : (
        <div className={d.evCard} data-m={e.method}>
          <p className={d.evMethod}>
            <span className={d.evIcon} aria-hidden><Icon /></span>
            <span className={d.evLabel} title={METHOD_NOTE[e.method]}>{evidenceLabel(e)}</span>
          </p>
          {e.quote && !inText(e.quote, a) && <blockquote className={`quote ${d.evQuote}`}>{e.quote}</blockquote>}
          <dl className={d.evMeta}>
            {/* the label above already names the place or moment when it has one; say each once */}
            {e.locator && !evidenceLabel(e).includes(e.locator) && <div><dt>Where</dt><dd>{e.locator}</dd></div>}
            {e.t && (e.tEnd || !evidenceLabel(e).includes(e.t)) && <div><dt>Moment</dt><dd className="mono">{e.t}{e.tEnd ? `–${e.tEnd}` : ''}</dd></div>}
            {src && <div><dt>Source</dt><dd>{src.title}</dd></div>}
          </dl>
          {links}
        </div>
      )}
    </section>
  );
}

function eventIcon(what: string): LucideIcon {
  const w = what.toLowerCase();
  if (w.includes('kept')) return Archive;
  if (w.includes('confirm')) return Target;
  if (w.includes('domain') || w.includes('type') || w.includes('tag ')) return Tag;
  if (w.includes('discard')) return Eraser;
  if (w.includes('restor')) return Undo2;
  if (w.includes('version') || w.includes('edit') || w.includes('text')) return PenLine;
  if (w.includes('collection') || w.includes('project')) return FolderPlus;
  if (w.includes('starred') || w.includes('bookmark')) return Bookmark;
  return Clock;
}

export function HistoryLog({ a }: { a: Artifact }) {
  const items = [...(a.history ?? [])].sort((x, y) => +new Date(y.when) - +new Date(x.when));
  return (
    <section className={d.block} aria-labelledby="hist-h">
      <div className={d.sectionHead}><h2 id="hist-h" className={d.h2}>History</h2><span className={d.meta}>{items.length} {items.length === 1 ? 'event' : 'events'}</span></div>
      {items.length === 0 ? <p className="hint">No changes recorded.</p> : (
        <ol className={d.log}>
          {items.map((h, i) => {
            const I = eventIcon(h.what);
            return (
              <li key={`${h.when}-${i}`} className={d.logItem} data-first={i === 0}>
                <span className={d.logIcon} aria-hidden><I /></span>
                <span className={d.logWhat}>{h.what}</span>
                <time className={d.logWhen} dateTime={h.when} title={new Date(h.when).toLocaleString('en-GB')}>{relTime(h.when)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
