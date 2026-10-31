'use client';
/* Library results (approved mockup): Arcade-style cards with tinted previews, Linear-style grouped rows, and the
 * details pane beside the list. The whole card opens the item (stretched link); Copy (top left), ⋯ and Bookmark (top right)
 * sit above the link so they stay separately clickable and focusable; pressing them never changes the right panel.
 * Cards and rows can be dragged onto a collection or project in the sidebar, or onto the right panel (dnd.ts, with the
 * pointer drag in components/ui/useCardDrag.ts); the ⋯ menu does the same without a mouse. */
import { Check, Copy, Folder } from '@/components/ui/icons';
import Link from 'next/link';
import { memo, useState, type MouseEvent, type PointerEvent } from 'react';
import { TypeIcon, useCopy } from '@/components/ui';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { TYPE_LABEL } from '@/lib/format';
import { recordUse } from '@/lib/store';
import type { Artifact, Evidence, Source } from '@/lib/types';
import { isEdited, isReviewEdited, matchFields, reuseText } from './lib';
import { EV_ICON, evFull, evShort, longDate, originLabel, savedAgo, shortDate, tintOf } from './look';
import { Dot, Highlight, snippet } from './parts';
import { BookmarkButton, CardMenu } from './Organise';
import Preview from './Preview';
import s from './library.module.css';

export interface Group { id: string; name: string; colour: string; icon?: string }

interface ItemProps {
  a: Artifact; src?: Source; terms: string[]; cols: Group[];
  /** Wide screens: show this item in the right panel (the ⋯ menu's "Open in panel"). */
  onPanel?: (id: string) => void;
  /** Pointer down on the card: may become a drag (useCardDrag). Not called for presses on its buttons. */
  onPress?: (id: string) => (e: PointerEvent<HTMLElement>) => void;
  /** This card is being dragged (its clone follows the pointer) */
  lifted?: boolean;
  /** Narrow screens: a plain click opens the panel as a sheet instead of the full page. Return true to handle it. */
  onOpen?: (id: string) => boolean;
  active?: boolean;
  /** PER-02 (Track B): the card parts to show, comma-separated (Settings › Cards and views). Absent: the default set. */
  fields?: string;
  /** List tree (design review, 25 Oct): the row's type glyph without its colour; the group heading carries the colour. */
  plain?: boolean;
  /** XEV-19: the item's own type name, when it has one. */
  typeName?: string;
}
const DEFAULT_FIELDS = 'meta,type,evidence,collections';
const TRIED_SHORT: Record<string, string> = { tried: 'Tried', worked: 'Worked', didnt: 'Didn’t work' };

export const openHandler = (id: string, onOpen?: (id: string) => boolean) => (e: MouseEvent) => {
  if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  if (onOpen(id)) e.preventDefault();
};

export function useCardCopy(a: Artifact) {
  const copy = useCopy();
  const [copied, setCopied] = useState(false);
  const text = reuseText(a);
  const run = async () => {
    if (!text) return;
    const ok = await copy(text, isEdited(a) ? `Copied your version of “${a.title}”` : `Copied “${a.title}”`);
    if (ok) { recordUse([a.id], 'copy'); setCopied(true); setTimeout(() => setCopied(false), 1100); }
  };
  return { text, copied, run };
}

/** Evidence, method first. Short on screen; the full label ("AI-located · moment 29:08 · confirmed by you") in the
 * tooltip and for screen readers. */
export function Ev({ e, compact, brief, full: showFull }: { e?: Evidence; compact?: boolean; brief?: boolean; full?: boolean }) {
  const Icon = EV_ICON[e?.method ?? 'none'];
  const full = evFull(e);
  return (
    <span className={s.ev} data-ai={e?.method === 'ai_located'} title={full}>
      <Icon aria-hidden />
      {showFull ? <span>{full}</span> : <><span aria-hidden>{evShort(e, compact, brief)}</span><span className="sr-only">Evidence: {full}</span></>}
    </span>
  );
}

/** The type pill. `name`: your own type's name (XEV-19), shown with the built-in type's icon. */
export const TypeLabel = ({ a, name }: { a: Artifact; name?: string }) => (
  <span className={s.lbl} title={name ? `${name}, a kind of ${TYPE_LABEL[a.type]}` : undefined}><TypeIcon type={a.type} />{name ?? TYPE_LABEL[a.type]}</span>
);
export const GroupLabel = ({ g }: { g: Group }) => (
  <span className={s.lbl} title={g.name}><Dot colour={g.colour} /><span className={s.lblText}>{g.name}</span></span>
);

/** Cards don't show the summary, so a search hit outside the title is shown here: in the summary, else in the text. */
function TextHit({ a, terms }: { a: Artifact; terms: string[] }) {
  if (!terms.length) return null;
  const title = a.title.toLowerCase();
  if (terms.every(t => title.includes(t))) return null;
  const purpose = a.purpose ?? '';
  if (purpose && terms.some(t => purpose.toLowerCase().includes(t))) {
    return <p className={s.hit}><span className={s.hitLabel}>Summary</span><span className={`${s.hitText} ${s.hitSans}`}><Highlight text={snippet(purpose, terms, 40)} terms={terms} /></span></p>;
  }
  const text = reuseText(a);
  if (!text || !matchFields(a, terms).inText) return null;
  return <p className={s.hit}><span className={s.hitLabel}>In text</span><span className={s.hitText}><Highlight text={snippet(text, terms)} terms={terms} /></span></p>;
}

export const ArtifactCard = memo(function ArtifactCard({ a, src, terms, cols, onPanel, onPress, lifted, onOpen, active, fields = DEFAULT_FIELDS, typeName }: ItemProps) {
  const { text, copied, run } = useCardCopy(a);
  const show = (k: string) => fields.split(',').includes(k);
  return (
    <li className={s.card} data-id={a.id} data-copied={copied} data-active={!!active} data-bookmarked={!!a.starred || undefined}
      style={lifted ? { opacity: 0.4 } : undefined} onPointerDown={onPress?.(a.id)} onDragStart={e => e.preventDefault()}>
      <div className={s.pv} data-tint={tintOf(a)}>
        {text && (
          <button type="button" className={s.lnk} onClick={run} aria-label={`Copy ${isEdited(a) ? 'your version of ' : ''}${a.title}`} title="Copy">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          </button>
        )}
        <Preview a={a} />
      </div>
      {/* Outside the preview (which clips) so the menu can open over the card below. */}
      <div className={s.tools} data-starred={!!a.starred}>
        <CardMenu a={a} onCopy={text ? run : undefined} onPanel={onPanel ? () => onPanel(a.id) : undefined} />
        <BookmarkButton a={a} className={`${s.tool} ${s.mark}`} />
      </div>
      <h2 className={s.cardTitle}>
        <Link href={`/library/${a.id}`} className={s.stretch} draggable={false} onClick={openHandler(a.id, onOpen)}><Highlight text={a.title} terms={terms} /></Link>
      </h2>
      {show('meta') && <p className={s.meta}>
        Saved <time dateTime={a.savedAt} title={new Date(a.savedAt).toLocaleString('en-GB')}>{savedAgo(a.savedAt)}</time>
        {' · '}{a.image ? 'added by you' : a.boardId ? 'from your board' : originLabel(src)}{isReviewEdited(a) ? ' · edited' : ''}
      </p>}
      <TextHit a={a} terms={terms} />
      {show('note') && a.note && <p className={s.hit}><span className={s.hitLabel}>Note</span><span className={`${s.hitText} ${s.hitSans}`}>{a.note}</span></p>}
      {show('tags') && (a.tags ?? []).length > 0 && <p className={s.meta}>{(a.tags ?? []).map(t => `#${t}`).join('  ')}</p>}
      <div className={s.ft}>
        {show('type') && <TypeLabel a={a} name={typeName} />}
        {show('tried') && a.tried && <span className={s.lbl}>{TRIED_SHORT[a.tried.status]}</span>}
        {show('evidence') && <Ev e={a.evidence} brief />}
        {show('collections') && cols.length > 0 && (
          <span className={s.av}>
            {cols.slice(0, 3).map(c => <span key={c.id} style={{ color: c.colour }} title={c.name} aria-hidden><Folder /></span>)}
            <span className="sr-only">In {cols.map(c => c.name).join(', ')}</span>
          </span>
        )}
      </div>
    </li>
  );
});

export const ArtifactRow = memo(function ArtifactRow({ a, terms, cols, active, onPress, lifted, onOpen, plain }: ItemProps) {
  const hit = terms.length && matchFields(a, terms).inText ? reuseText(a) : null;
  return (
    <li className={s.row} data-active={!!active} data-id={a.id}
      style={lifted ? { opacity: 0.4 } : undefined} onPointerDown={onPress?.(a.id)} onDragStart={e => e.preventDefault()}>
      <span className={s.rowLead}>
        {plain ? <BrandIcon name={a.type} size={16} className={s.rowIcon} /> : <TypeIcon type={a.type} className={s.rowIcon} />}
      </span>
      <Link href={`/library/${a.id}`} className={`${s.rowTitle} ${s.stretch}`} draggable={false} onClick={openHandler(a.id, onOpen)}>
        <Highlight text={a.title} terms={terms} />
      </Link>
      <span className={s.sub}>
        {hit
          ? <><span className={s.hitLabel}>In text </span><Highlight text={snippet(hit, terms, 40)} terms={terms} /></>
          : <Highlight text={a.purpose ?? ''} terms={terms} />}
      </span>
      {cols[0] && <span className={s.rowCol}><GroupLabel g={cols[0]} /></span>}
      <span className={s.rowEv}><Ev e={a.evidence} compact /></span>
      <BookmarkButton a={a} className={s.rowStar} />
      <time className={s.d} dateTime={a.savedAt} title={longDate(a.savedAt)}>{shortDate(a.savedAt)}</time>
    </li>
  );
});
