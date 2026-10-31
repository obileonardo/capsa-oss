'use client';
/* The source beside the candidates: an Elicit-style evidence card ("Evidence 2 of 5", [ and ]) above the stored text,
 * with each quote highlighted where it occurs. Videos show chapters with timestamps (Grain) and the moments. */
import { ChevronLeft, ChevronRight, ExternalLink, Play, SquarePlay } from '@/components/ui/icons';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { EvidenceTag, TypeTag } from '@/components/ui';
import { prefersReducedMotion } from '@/components/inbox/useMedia';
import type { Candidate, Source } from '@/lib/types';
import { momentRange } from './CandidateCard';
import { SourceImage } from './SourceImage';
import { stamp } from '@/lib/capture/transcript';
import s from './review.module.css';

interface Seg { id: string; label?: string; text: string }
interface Hit { i: number; j: number; cid: string }

export const toSec = (t?: string) => {
  if (!t) return 0;
  return t.split(':').map(Number).reduce((acc, n) => acc * 60 + (Number.isFinite(n) ? n : 0), 0);
};

/** The evidence card's quote. Long quotes scroll inside the card, so then it takes focus and the keyboard can scroll it
 * (axe scrollable-region-focusable); a quote that fits stays out of the tab order. */
function CardQuote({ method, text }: { method?: string; text: string }) {
  const ref = useRef<HTMLQuoteElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return <blockquote ref={ref} className={s.evCardQuote} data-method={method} tabIndex={scrolls ? 0 : undefined}>{text}</blockquote>;
}

export function segmentsOf(src: Source): Seg[] {
  const segs = ((src.segments ?? []) as unknown[]).filter((x): x is Seg =>
    !!x && typeof x === 'object' && typeof (x as Seg).id === 'string' && typeof (x as Seg).text === 'string');
  if (!segs.length && src.minimalQuote) return [{ id: '__quote', label: 'Stored quote', text: src.minimalQuote }];
  return segs;
}

function findHits(text: string, cands: Candidate[], applies: (c: Candidate) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const c of cands) {
    const q = c.evidence?.quote;
    if (!q || !applies(c)) continue;
    const i = text.indexOf(q);
    if (i >= 0) hits.push({ i, j: i + q.length, cid: c.id });
  }
  hits.sort((a, b) => a.i - b.i);
  return hits.filter((h, k) => k === 0 || h.i >= hits[k - 1].j); // overlapping quotes: the first one wins
}

function Highlighted({ text, hits, activeId, onActivate }: { text: string; hits: Hit[]; activeId?: string; onActivate: (cid: string) => void }) {
  const out: ReactNode[] = [];
  let pos = 0;
  hits.forEach((h, k) => {
    if (h.i > pos) out.push(text.slice(pos, h.i));
    out.push(
      <mark key={k} className={s.hl} data-evid={h.cid} data-active={h.cid === activeId || undefined} onClick={() => onActivate(h.cid)}>
        {text.slice(h.i, h.j)}
      </mark>,
    );
    pos = h.j;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

export default function SourcePane({ src, cands, activeId, onActivate, stepper, scrollRef }: {
  src: Source; cands: Candidate[]; activeId?: string; onActivate: (cid: string) => void;
  stepper?: { index: number; total: number; prev: () => void; next: () => void };
  scrollRef?: RefObject<HTMLElement | null>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const segs = useMemo(() => segmentsOf(src), [src]);
  const active = cands.find(c => c.id === activeId);

  const segHits = useMemo(() => segs.map(g => findHits(g.text, cands, c => c.evidence?.segId === g.id || g.id === '__quote')), [segs, cands]);
  const descHits = useMemo(() => src.description ? findHits(src.description, cands, c => c.evidence?.method === 'creator_metadata') : [], [src.description, cands]);
  const foundIds = useMemo(() => new Set([...segHits.flat(), ...descHits].map(h => h.cid)), [segHits, descHits]);

  // Bring the active passage into view inside the pane, below the sticky evidence card.
  useEffect(() => {
    const sc = scrollRef?.current, el = root.current?.querySelector<HTMLElement>(`[data-evid="${CSS.escape(activeId ?? '')}"]`);
    if (!sc || !el) return;
    const scR = sc.getBoundingClientRect(), r = el.getBoundingClientRect();
    const top = (card.current?.getBoundingClientRect().bottom ?? scR.top) + 8;
    if (r.top >= top && r.bottom <= scR.bottom - 8) return;
    sc.scrollTo({ top: sc.scrollTop + (r.top - top) - 48, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [activeId, scrollRef]);

  const isVideo = src.kind === 'video';
  const found = active ? foundIds.has(active.id) : false;

  return (
    <div className={s.pane} ref={root}>
      {active && (
        <div className={s.evCard} ref={card} aria-label="Where it came from" role="region">
          <div className={s.evCardTop}>
            <span className={s.evCount}>{stepper ? <>Where it came from · <b>{stepper.index + 1}</b> of {stepper.total}</> : 'Where it came from'}</span>
            {stepper && (
              <span className={s.evNav}>
                <button type="button" className="btn sm" onClick={stepper.prev} disabled={stepper.index === 0} aria-keyshortcuts="[">
                  <ChevronLeft aria-hidden />Previous <kbd className="kbd" aria-hidden>[</kbd>
                </button>
                <button type="button" className="btn sm" onClick={stepper.next} disabled={stepper.index >= stepper.total - 1} aria-keyshortcuts="]">
                  Next <kbd className="kbd" aria-hidden>]</kbd><ChevronRight aria-hidden />
                </button>
              </span>
            )}
          </div>
          <p className={s.evFor}><TypeTag type={active.type} /><span>{active.title}</span></p>
          <p className={s.evMeta}><EvidenceTag evidence={active.evidence} />{active.evidence?.method === 'creator_metadata' && active.evidence.t && active.evidence.locator && <span className={s.locator}>{active.evidence.locator}</span>}</p>
          {active.evidence?.quote && (
            <CardQuote method={active.evidence.method} text={active.evidence.quote} />
          )}
          <p className={s.evWhere}>
            {active.evidence?.method === 'ai_located'
              ? (isVideo ? `Found by AI at ${momentRange(active)}. No transcript is stored, so the wording isn’t checked.` : 'Found by AI. The wording isn’t checked against the source.')
              : found ? 'Highlighted below where it appears in the stored text.'
              : active.evidence?.t ? `Stated by the creator at ${active.evidence.t}. Shown in the chapters below.`
              : 'This passage isn’t in the stored text, so it’s shown as captured.'}
          </p>
        </div>
      )}

      {isVideo ? (
        <VideoPane src={src} cands={cands} activeId={activeId} onActivate={onActivate} descHits={descHits} active={active} />
      ) : (
        <div className={s.text}>
          {src.image && <SourceImage src={src} />}
          {segs.length === 0 && <p className={s.paneEmpty}>No text from this source is stored.</p>}
          {segs.map((g, k) => (
            <section key={g.id} className={s.seg} aria-label={g.label ?? `Part ${k + 1}`}>
              {g.label && <h4 className={s.segLabel}>{g.label}</h4>}
              <div className={src.kind === 'github' ? s.segCode : s.segText}>
                <Highlighted text={g.text} hits={segHits[k]} activeId={activeId} onActivate={onActivate} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoPane({ src, cands, activeId, onActivate, descHits, active }: {
  src: Source; cands: Candidate[]; activeId?: string; onActivate: (cid: string) => void; descHits: Hit[]; active?: Candidate;
}) {
  const chapters = src.chapters ?? [];
  const moments = cands.filter(c => c.evidence?.t).sort((a, b) => toSec(a.evidence!.t) - toSec(b.evidence!.t));
  const dur = src.durationS || toSec(src.duration) || src.transcript?.endS || Math.max(1, ...chapters.map(c => toSec(c.t)), ...moments.map(c => toSec(c.evidence!.t))) * 1.05;
  const at = active?.evidence?.t;
  const openAt = src.url && at ? `${src.url}${src.url.includes('?') ? '&' : '?'}t=${toSec(at)}s` : src.url;
  const chapterOf = (t: string) => {
    let k = -1;
    chapters.forEach((ch, i) => { if (toSec(ch.t) <= toSec(t)) k = i; });
    return k;
  };
  const marker = (c: Candidate) => c.evidence!.method === 'creator_metadata' ? 'Stated by the creator' : c.evidence!.method === 'text_span' ? 'From the transcript you pasted' : c.evidence!.confirmed ? 'Found by AI, confirmed by you' : 'Found by AI, unconfirmed';
  // EXT-05: a transcript you pasted is shown with its finds highlighted, like any stored text
  const transcripts = segmentsOf(src).filter(g => g.id.startsWith('tr-'));
  const trHits = transcripts.map(g => findHits(g.text, cands, c => c.evidence?.segId === g.id));

  return (
    <div className={s.video}>
      <div className={s.player}>
        <SquarePlay aria-hidden />
        <p><b>The video player isn’t embedded in this version.</b> Capsa never downloads the video.</p>
        {openAt && (
          <a href={openAt} target="_blank" rel="noopener noreferrer" className="btn sm">
            {at ? <>Open the original at <span className="mono">{at}</span></> : 'Open the original'}<ExternalLink aria-hidden />
            <span className="sr-only"> (new tab)</span>
          </a>
        )}
      </div>

      {moments.length > 0 && (
        <div className={s.timeline}>
          <div className={s.track} aria-hidden>
            {chapters.map(ch => <span key={ch.t} className={s.tick} style={{ left: `${(toSec(ch.t) / dur) * 100}%` }} />)}
          </div>
          {moments.map(c => (
            <button key={c.id} type="button" className={s.marker} data-method={c.evidence!.method} data-confirmed={c.evidence!.confirmed || undefined}
              data-active={c.id === activeId || undefined} style={{ left: `${(toSec(c.evidence!.t) / dur) * 100}%` }}
              onClick={() => onActivate(c.id)} aria-label={`${c.evidence!.t}: ${c.title}. ${marker(c)}`} title={`${c.evidence!.t} · ${c.title}`} />
          ))}
          <div className={s.scale}><span className="mono">00:00</span><span className={s.legend}><i data-k="creator" /> Said by the creator <i data-k="ai" /> Found by AI{moments.some(c => c.evidence!.method === 'text_span') && <><i data-k="transcript" /> Your transcript</>}</span><span className="mono">{src.duration ?? (src.transcript?.endS ? stamp(src.transcript.endS) : '')}</span></div>
        </div>
      )}

      {chapters.length > 0 && (
        <section className={s.chapters} aria-labelledby="chap-h">
          <h4 id="chap-h" className={s.segLabel}>Chapters <span>· from the creator</span></h4>
          <ol>
            {chapters.map((ch, i) => {
              const here = moments.filter(c => chapterOf(c.evidence!.t!) === i);
              return (
                <li key={ch.t}>
                  <div className={s.chapRow}><span className={s.chapTitle}>{ch.title}</span><span className={`mono ${s.chapT}`}>{ch.t}</span></div>
                  {here.length > 0 && (
                    <div className={s.chips}>
                      {here.map(c => (
                        <button key={c.id} type="button" className={s.chip} data-evid={c.id} data-method={c.evidence!.method}
                          data-active={c.id === activeId || undefined} aria-pressed={c.id === activeId} onClick={() => onActivate(c.id)}>
                          <Play aria-hidden /><span className="mono">{c.evidence!.t}</span><span className={s.chipTitle}>{c.title}</span>
                          <span className={s.chipMethod}>{c.evidence!.method === 'ai_located' ? (c.evidence!.confirmed ? 'AI · confirmed' : 'Found by AI') : c.evidence!.method === 'text_span' ? 'Transcript' : 'Creator'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {moments.filter(c => chapterOf(c.evidence!.t!) < 0).length > 0 && <p className={s.paneEmpty}>Some moments fall before the first chapter.</p>}
        </section>
      )}

      {transcripts.map((g, k) => (
        <section key={g.id} className={s.seg} aria-label="Transcript you pasted">
          <h4 className={s.segLabel}>Transcript <span>· you pasted</span></h4>
          <div className={s.segText}><Highlighted text={g.text} hits={trHits[k]} activeId={activeId} onActivate={onActivate} /></div>
        </section>
      ))}

      {src.description && (
        <section className={s.seg} aria-labelledby="desc-h">
          <h4 id="desc-h" className={s.segLabel}>Description <span>· the creator’s words</span></h4>
          <div className={s.segText}><Highlighted text={src.description} hits={descHits} activeId={activeId} onActivate={onActivate} /></div>
        </section>
      )}
    </div>
  );
}
