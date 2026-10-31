'use client';
/* The Library's right-hand panel (shell direction "1 + 3"): a quick look at the selected item, docked in the shell's right
 * slot on wide screens and a sheet on narrow ones. Rebuilt 27 Oct (Elvis: "some more details, but not in four cards...
 * This screen needs to look better than this"): one surface, top to bottom, the way inspectors read (Linear's Properties,
 * fal's Details, OpenAI's file panel, Finder's Get Info; taste board, Inspector tab):
 *   - the item's own words on its colour, at a fixed, modest height (it used to fill three quarters of the column);
 *   - its title, then Copy, Open and Bookmark on one line;
 *   - Details: quiet labels on the left, values on the right, no boxes: type, where it came from, collection and project,
 *     tags, when it was saved, how often it was used, related items; then your note.
 * With nothing selected it keeps the same frame: the drop zone where the preview goes, then the library at a glance as the
 * same rows (each a way in). ItemFacts is the item page's side area. */
import { Bookmark, BookmarkFilled, Check, ChevronDown, Clock, Copy, ExternalLink, Folder, Link as LinkIcon, SquareDashedMousePointer, X, type LucideIcon } from '@/components/ui/icons';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TYPE_ICON, TypeIcon, typeColour, useCopy } from '@/components/ui';
import { relTime, TYPE_LABEL } from '@/lib/format';
import { currentLibraryId, inboxCount, itemImageOf, recordUse, toggleStar, useAppState } from '@/lib/store';
import { useLibraries } from '@/lib/libraries';
import type { Artifact, Source } from '@/lib/types';
import { isEdited, reuseText } from './lib';
import { longDate, projectColour, savedAgo, tintOf } from './look';
import { FileTile } from './Organise';
import { copyImage, PanelImage } from './ItemImage';
import { Ev, type Group } from './Results';
import { Dot, KIND_ICON } from './parts';
import { customTypeOf, LINK_IN, LINK_OUT, TRIED_LABEL } from '@/lib/organise';
import TypeTile from '@/slots.gen/TypeTile'; // Organise's type tile (release 3, lib/features.ts)
import { has } from '@/lib/features';
import s from './library.module.css';

/** "a post on x.com", "a video on youtube.com", "pasted by you". */
function fromPhrase(src?: Source): string {
  if (!src) return 'from an unknown source';
  if (src.kind === 'manual') return /^pasted/i.test(src.displayUrl ?? '') ? 'pasted by you' : 'added by you';
  let host = src.displayUrl ?? '';
  if (src.url) { try { host = new URL(src.url).hostname.replace(/^www\./, ''); } catch { /* keep displayUrl */ } }
  const what = { video: 'a video', github: 'a repository', article: 'an article', x: 'a post' }[src.kind];
  return host ? `from ${what} on ${host}` : `from ${what}`;
}

function copyLabel(a: Artifact): string {
  if (isEdited(a)) return 'Copy your version';
  return a.type === 'prompt' ? 'Copy prompt' : a.type === 'template' ? 'Copy template' : 'Copy text';
}

/* Detail tiles: plain 20 px icons in ink, no frame or colour behind them. */
function TileBody({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return <><Icon aria-hidden className={s.i3} /><span className={s.tileText}><small>{label}</small><b>{children}</b></span></>;
}
function Tile(p: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return <div className={s.tile3}><TileBody {...p} /></div>;
}

/** The item's type as a plain fact, in a build without Organise (whose TypeTile makes it changeable, with custom types). */
function TypeFact({ a }: { a: Artifact }) {
  const Glyph = TYPE_ICON[a.type];
  return (
    <div className={s.tile3}>
      <Glyph aria-hidden className={s.i3} style={{ color: typeColour(a.type) }} />
      <span className={s.tileText}><small>Type</small><b>{TYPE_LABEL[a.type]}</b></span>
    </div>
  );
}

/** "Copied 4 times", "Used 3 times" (copies, prompt fills and exports), or "Not yet". Recorded on this device. */
export function usedText(a: Artifact): { text: string; detail: string } {
  const uses = a.uses ?? [];
  if (!uses.length) return { text: 'Not yet', detail: 'Copies, prompt fills and exports are counted here' };
  const n = uses.length, times = n === 1 ? 'once' : `${n} times`;
  const by = (k: string) => uses.filter(u => u.kind === k).length;
  const c = by('copy'), f = by('fill'), e = by('export');
  const text = c === n ? `Copied ${times}` : f === n ? `Filled ${times}` : e === n ? `Exported ${times}` : `Used ${times}`;
  const parts = [c && `${c} ${c === 1 ? 'copy' : 'copies'}`, f && `${f} prompt ${f === 1 ? 'fill' : 'fills'}`, e && `${e} ${e === 1 ? 'export' : 'exports'}`].filter(Boolean);
  return { text, detail: `${parts.join(', ')} · last ${relTime(uses[n - 1].at)}` };
}

/** The panel with nothing in it: a drop zone. Dashed frame; it lights up while a card is being dragged. */
export function EmptyPanel({ title = 'Drop an item here' }: { title?: string }) {
  return (
    <div className={s.dropZone}>
      <span className={s.dropIcon} aria-hidden><SquareDashedMousePointer /></span>
      <p className={s.dropTitle}>{title}</p>
    </div>
  );
}

/** One line of the details: a quiet label, then its value. */
function Prop({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className={s.prop} title={title}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
const None = ({ children = 'None' }: { children?: string }) => <span className={s.propNone}>{children}</span>;

/** Where it came from: the site as a link to the original (with its kind's glyph and how the words were found), a board,
 * or you. */
function SourceValue({ a, src }: { a: Artifact; src?: Source }) {
  const { state } = useAppState();
  if (a.image) return <span className={s.propText}>Added by you</span>;
  if (a.boardId) {
    const board = state.boards.find(b => b.id === a.boardId);
    if (board && !has('playground')) return <span className={s.propText}>{board.title || 'Untitled board'}</span>;
    return board ? <Link className={s.propLink} href={`/boards/${board.id}`}>{board.title || 'Untitled board'}</Link> : <None>Board deleted</None>;
  }
  if (!src) return <None>Unknown</None>;
  const Icon = KIND_ICON[src.kind];
  if (src.kind === 'manual') return <span className={s.propText}><Icon aria-hidden className={s.propIcon} />{/^pasted/i.test(src.displayUrl ?? '') ? 'Pasted by you' : 'Added by you'}</span>;
  let host = src.displayUrl ?? '';
  if (src.url) { try { host = new URL(src.url).hostname.replace(/^www\./, ''); } catch { /* keep displayUrl */ } }
  return (
    <span className={s.propWrap}>
      {src.url && host
        ? <a className={s.propLink} href={src.url} target="_blank" rel="noopener noreferrer" title={src.url}><Icon aria-hidden className={s.propIcon} /><span className={s.propEllip}>{host}</span><ExternalLink aria-hidden className={s.propOut} /><span className="sr-only"> (opens in a new tab)</span></a>
        : <span className={s.propText}><Icon aria-hidden className={s.propIcon} />{host || 'Unknown'}</span>}
      {a.evidence && <span className={s.propAside}><Ev e={a.evidence} brief /></span>}
    </span>
  );
}

/** Items linked to this one, either way round (CUR-12): each opens in the panel, or on its page without one. */
function Related({ a, onShow }: { a: Artifact; onShow?: (id: string) => void }) {
  const { state } = useAppState();
  const out = (a.links ?? []).map(l => ({ rel: LINK_OUT[l.rel], item: state.artifacts.find(x => x.id === l.to) }));
  const inn = state.artifacts.flatMap(x => (x.links ?? []).filter(l => l.to === a.id).map(l => ({ rel: LINK_IN[l.rel], item: x })));
  const every = [...out, ...inn].filter((r): r is { rel: string; item: Artifact } => !!r.item);
  if (!every.length) return null;
  // four at most here; the rest are a click away on the item's page
  const all = every.slice(0, 4), more = every.length - all.length;
  return (
    <Prop label="Related">
      <ul className={s.propList}>
        {all.map(r => (
          <li key={`${r.rel}-${r.item.id}`}>
            {onShow
              ? <button type="button" className={s.propLink} onClick={() => onShow(r.item.id)} title={`${r.rel} ${r.item.title}`}><span className={s.propEllip}>{r.item.title}</span></button>
              : <Link className={s.propLink} href={`/library/${r.item.id}`} title={`${r.rel} ${r.item.title}`}><span className={s.propEllip}>{r.item.title}</span></Link>}
          </li>
        ))}
        {more > 0 && <li><Link className={s.propLink} href={`/library/${a.id}`}><span className={s.propNone}>{more} more</span><span className="sr-only"> related to {a.title}</span></Link></li>}
      </ul>
    </Prop>
  );
}

/** The selected item's details, as label and value rows. */
function ItemDetails({ a, src, cols, onShow }: { a: Artifact; src?: Source; cols: Group[]; onShow?: (id: string) => void }) {
  const { state } = useAppState();
  const used = usedText(a);
  const custom = customTypeOf(state, a)?.name;
  const projs = (a.projects ?? []).map(id => { const i = state.projects.findIndex(p => p.id === id); return i < 0 ? null : { id, name: state.projects[i].name, colour: projectColour(i) }; })
    .filter((g): g is Group => !!g);
  const groups = (gs: Group[]) => (
    <ul className={s.propList}>{gs.map(g => <li key={g.id}><span className={s.propText}><Dot colour={g.colour} /><span className={s.propEllip}>{g.name}</span></span></li>)}</ul>
  );
  return (
    <section className={s.propsWrap} aria-label={`About ${a.title}`}>
      <h3 className={s.propsHead}>Details</h3>
      <dl className={s.props}>
        <Prop label="Type">
          <span className={s.propText}><TypeIcon type={a.type} className={s.propIcon} />{custom ?? TYPE_LABEL[a.type]}{a.tried && <span className={s.propAside}>{TRIED_LABEL[a.tried.status]}</span>}</span>
        </Prop>
        <Prop label="Source"><SourceValue a={a} src={src} /></Prop>
        <Prop label={cols.length > 1 ? 'Collections' : 'Collection'}>{cols.length ? groups(cols) : <None />}</Prop>
        {projs.length > 0 && <Prop label={projs.length > 1 ? 'Projects' : 'Project'}>{groups(projs)}</Prop>}
        <Prop label="Tags">
          {a.tags?.length
            ? <ul className={s.propTags}>{a.tags.map(t => <li key={t}><Link href={`/library?tag=${encodeURIComponent(t)}`} className={s.propTag} title={`Show everything tagged “${t}”`}>{t}</Link></li>)}</ul>
            : <None />}
        </Prop>
        <Prop label="Saved"><time className={s.propText} dateTime={a.savedAt} title={longDate(a.savedAt)}>{savedAgo(a.savedAt).replace(/^\w/, c => c.toUpperCase())}</time></Prop>
        <Prop label="Used" title={used.detail}>{a.uses?.length ? <span className={s.propText}>{used.text}</span> : <None>Not yet</None>}<span className="sr-only">: {used.detail}</span></Prop>
        <Related a={a} onShow={onShow} />
      </dl>
      {/* each paragraph finds its own direction, so a line in Arabic reads right to left under one in English */}
      {a.note?.trim() && <div className={s.propNote}><h4>Note</h4>{a.note.trim().split(/\n{2,}/).map((para, i) => <p key={i} dir="auto">{para}</p>)}</div>}
    </section>
  );
}

/** With nothing selected: the library at a glance, as the same rows. The last saved and most used items open in the panel
 * (or on their page when there's no panel to open them in); Bookmarked filters the Library; Inbox counts what's waiting. */
function Glance({ onShow }: { onShow?: (id: string) => void }) {
  const { state } = useAppState();
  const last = state.artifacts.reduce<Artifact | undefined>((m, x) => (!m || x.savedAt > m.savedAt ? x : m), undefined);
  const most = state.artifacts.reduce<Artifact | undefined>((m, x) => ((x.uses?.length ?? 0) > (m?.uses?.length ?? 0) ? x : m), undefined);
  const starred = state.artifacts.filter(x => x.starred).length;
  const waiting = inboxCount(state);
  const n = state.artifacts.length;
  const open = (x?: Artifact, none = 'Nothing yet') => !x ? <None>{none}</None>
    : onShow ? <button type="button" className={s.propLink} onClick={() => onShow(x.id)}><span className={s.propEllip}>{x.title}</span></button>
    : <Link className={s.propLink} href={`/library/${x.id}`}><span className={s.propEllip}>{x.title}</span></Link>;
  return (
    <section className={s.propsWrap} aria-label="Your library at a glance">
      <dl className={s.props}>
        <Prop label="Items"><span className={s.propText}>{n === 1 ? '1 item' : `${n} items`}</span></Prop>
        <Prop label="Last saved">{open(last)}</Prop>
        <Prop label="Most used">{open(most)}</Prop>
        <Prop label="Bookmarked"><Link className={s.propLink} href="/library?starred=1">{starred === 1 ? '1 item' : `${starred} items`}</Link></Prop>
        <Prop label="Inbox"><Link className={s.propLink} href="/inbox">{waiting ? `${waiting} to review` : 'All clear'}</Link></Prop>
      </dl>
    </section>
  );
}

/** "Post on x.com", "Video on youtube.com", "Pasted by you". */
function sourceNoun(src?: Source): string {
  const f = fromPhrase(src);
  return f.replace(/^from (a|an) /, '').replace(/^\w/, c => c.toUpperCase());
}

/** The Library's right panel is a quick look: the text, the title, Copy / Open / Bookmark, and its details. Everything you
 * do to an item (versions, editing, blanks, tags, filing, history, export, delete) lives on its own page, so the two never
 * repeat each other. */
export default function Panel({ a, src, cols, onClose, onShow }: { a?: Artifact; src?: Source; cols: Group[]; onClose?: () => void; onShow?: (id: string) => void }) {
  const { state } = useAppState();
  const libs = useLibraries();
  const copy = useCopy();
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (onClose) closeRef.current?.focus(); }, [onClose]);

  if (!a) {
    const lib = libs.find(l => l.id === currentLibraryId()) ?? libs[0];
    return (
      <section className={s.panel} aria-label="Selected item" data-lib-panel="empty">
        <EmptyPanel />
        <div className={s.mb}>
          <h2 className={s.mt}>{lib?.name ?? 'Your library'}</h2>
          <Glance onShow={onShow} />
        </div>
      </section>
    );
  }
  // Your version when you made one, otherwise the exact words; with no text, the AI summary (labelled, as it isn't the item's own words).
  const edited = isEdited(a);
  const text = reuseText(a);
  const head = text ? (edited ? 'Your version' : null) : 'AI summary';
  const body = text ?? a.purpose ?? 'No text was captured for this item.';
  const img = itemImageOf(state, a);
  const copyImg = async () => { if (img && await copyImage(img.key)) { recordUse([a.id], 'copy'); setCopied(true); setTimeout(() => setCopied(false), 1100); } };
  const run = async () => {
    if (!text) return;
    const ok = await copy(text, edited ? `Copied your version of “${a.title}”` : `Copied “${a.title}”`);
    if (ok) { recordUse([a.id], 'copy'); setCopied(true); setTimeout(() => setCopied(false), 1100); }
  };

  return (
    <section className={s.panel} aria-label={`Selected item: ${a.title}`} data-lib-panel="item">
      {onClose && <button ref={closeRef} type="button" className={s.panelClose} onClick={onClose} aria-label="Close"><X aria-hidden /></button>}
      {img ? (
        <div className={s.sky} data-tint={tintOf(a)} data-image><PanelImage k={img.key} /></div>
      ) : (
        <div className={s.sky} data-tint={tintOf(a)}>
          <div className={s.frost} data-copied={copied}>
            {head && <div className={s.frostHead}><span>{head}</span></div>}
            <div className={text ? s.frostText : s.frostSummary}>{body}</div>
          </div>
        </div>
      )}
      <div className={s.mb}>
        <h2 className={s.mt} title={a.title}>{a.title}</h2>
        <div className={s.mbtn}>
          {img && !text ? (
            <button type="button" className={s.mPrimary} onClick={copyImg}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}Copy image
            </button>
          ) : text && (
            <button type="button" className={s.mPrimary} onClick={run}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copyLabel(a)}
            </button>
          )}
          <Link href={`/library/${a.id}`} className={s.mSecondary}>Open<span className="sr-only"> {a.title}</span></Link>
          <button type="button" className={s.mStar} aria-pressed={!!a.starred} aria-label="Bookmark" title={a.starred ? 'Bookmarked' : 'Bookmark'}
            onClick={() => toggleStar(a.id)}>{a.starred ? <BookmarkFilled aria-hidden /> : <Bookmark aria-hidden />}</button>
        </div>
        <ItemDetails a={a} src={src} cols={cols} onShow={onShow} />
      </div>
    </section>
  );
}

/** The item page's side area: compact facts only (type, collection and project, source, used, saved). The main column
 * holds the text, where it came from, blanks, tags, explainer and history, so nothing here repeats it. */
export function ItemFacts({ a, src, cols, onClose }: { a: Artifact; src?: Source; cols: Group[]; onClose?: () => void }) {
  const { state } = useAppState();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (onClose) closeRef.current?.focus(); }, [onClose]);
  const projs = (a.projects ?? []).map(id => state.projects.find(p => p.id === id)?.name).filter(Boolean) as string[];
  const filed = [...cols.map(c => c.name), ...projs];
  const fileLabel = cols.length && projs.length ? 'Collection and project' : projs.length ? (projs.length > 1 ? 'Projects' : 'Project') : cols.length > 1 ? 'Collections' : 'Collection';
  const used = usedText(a);
  const board = a.boardId ? state.boards.find(b => b.id === a.boardId) : undefined;
  return (
    <section className={s.panel} aria-label={`Details: ${a.title}`} data-facts>
      {onClose && <button ref={closeRef} type="button" className={s.panelClose} onClick={onClose} aria-label="Close"><X aria-hidden /></button>}
      <div className={s.sky} data-tint={tintOf(a)} data-slim />
      <div className={s.mb}>
        <div className={s.tiles}>
          {TypeTile ? <TypeTile a={a} /> : <TypeFact a={a} />}
          <FileTile a={a}>
            <TileBody icon={Folder} label={fileLabel}>
              {filed.length ? filed.join(', ') : <span className={s.tileMuted}>Add to a collection</span>}
            </TileBody>
            <ChevronDown aria-hidden className={s.tileChev} />
          </FileTile>
          {(src || board) && (
            <Tile icon={LinkIcon} label="Source">
              <span title={src?.url ?? undefined}>{board ? 'Your board' : sourceNoun(src)}</span>
            </Tile>
          )}
          <div className={s.tile3} title={used.detail}>
            <TileBody icon={Copy} label="Used">{used.text}</TileBody>
            <span className="sr-only">: {used.detail}</span>
          </div>
          <div className={s.tile3}>
            <TileBody icon={Clock} label="Saved"><time dateTime={a.savedAt} title={new Date(a.savedAt).toLocaleString('en-GB')}>{longDate(a.savedAt)}</time></TileBody>
          </div>
        </div>
      </div>
    </section>
  );
}
