'use client';
/* Build-out Stage 1: the small organising controls shared by the cards, the list and the right panel.
 * - BookmarkButton: a pressed/unpressed toggle; bookmarked items show in the sidebar's "Bookmarks" (stored as `starred`).
 * - FileMenu: add to or take out of collections and projects (and create a collection), as in the selection bar.
 * - TagEditor: the item's tags as chips (each opens the Library filtered by it), remove with Undo, add with suggestions. */
import { Bookmark, BookmarkFilled, Check, Copy, Dots, PanelRightOpen, Plus, X } from '@/components/ui/icons';
import Link from 'next/link';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOutsideClose, useToast } from '@/components/ui';
import { addTag, createCollection, removeTag, tagCounts, toggleArtifactIn, toggleStar, useAppState } from '@/lib/store';
import type { Artifact } from '@/lib/types';
import { useMedia } from '@/components/inbox/useMedia';
import { groupIcon } from './groupIcons';
import ItemSheet, { CONFIRM_MS, PHONE_QUERY } from './ItemSheet';
import { collectionColour, projectColour } from './look';
import s from './library.module.css';
import sh from './itemSheet.module.css';

export function BookmarkButton({ a, className, showText }: { a: Artifact; className?: string; showText?: boolean }) {
  const on = !!a.starred;
  const Icon = on ? BookmarkFilled : Bookmark;
  return (
    <button type="button" className={className} aria-pressed={on} data-on={on} onClick={() => toggleStar(a.id)}
      aria-label={showText ? undefined : `Bookmark ${a.title}`} title={on ? 'Remove bookmark' : 'Bookmark'}>
      <Icon aria-hidden />{showText && <span>{on ? 'Bookmarked' : 'Bookmark'}</span>}
    </button>
  );
}

/** Arrow keys move between the menu's buttons; Escape closes and returns focus to the trigger. */
function useMenuKeys(close: () => void, trigger: React.RefObject<HTMLButtonElement | null>) {
  return (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); trigger.current?.focus(); }
  };
}

/** The list of collections and projects with a check on the ones this item is in. Stays open while you toggle.
 * `sheet`: the same list and actions laid out for the phone's item sheet (grouped rows, the tick on the right). */
function FileList({ a, onDone, sheet }: { a: Artifact; onDone?: () => void; sheet?: boolean }) {
  const { state } = useAppState();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const uid = useId();
  const flip = (field: 'collections' | 'projects', id: string, label: string) => {
    const was = (a[field] ?? []).includes(id);
    toggleArtifactIn(a.id, field, id);
    toast({ message: was ? `Removed from “${label}”` : `Added to “${label}”`, tone: was ? undefined : 'ok', action: { label: 'Undo', run: () => toggleArtifactIn(a.id, field, id) } });
  };
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    const c = createCollection(v);
    toggleArtifactIn(a.id, 'collections', c.id);
    toast({ message: `Created “${c.name}” and added this item`, tone: 'ok' });
    setName(''); setCreating(false); onDone?.();
  };
  if (sheet) {
    const rows = (field: 'collections' | 'projects', list: { id: string; name: string; icon?: string }[]) => list.map((g, i) => {
      const on = (a[field] ?? []).includes(g.id);
      const G = groupIcon(g.icon, field);
      return (
        <button key={g.id} type="button" className={sh.row} aria-pressed={on} onClick={() => flip(field, g.id, g.name)}>
          <G aria-hidden style={{ color: (field === 'collections' ? collectionColour : projectColour)(i) }} />
          <span className={sh.label}>{g.name}</span>
          <span className={sh.tick} aria-hidden>{on && <Check />}</span>
        </button>
      );
    });
    const section = (field: 'collections' | 'projects', title: string, list: { id: string; name: string; icon?: string }[], extra?: ReactNode) => (
      <section className={sh.group} aria-labelledby={`${uid}-${field}`}>
        <h3 id={`${uid}-${field}`} className={sh.groupHead}>{title}</h3>
        <div className={sh.rows}>
          {list.length === 0 && !extra && <p className={sh.note}>No {title.toLowerCase()} yet.</p>}
          {rows(field, list)}
          {extra}
        </div>
      </section>
    );
    return (
      <>
        {section('collections', 'Collections', state.collections, creating ? (
          <form className={sh.form} onSubmit={create}>
            <label className="sr-only" htmlFor={`${uid}-new`}>New collection name</label>
            <input id={`${uid}-new`} className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Collection name" maxLength={60} autoFocus />
            <button type="submit" className="btn primary" disabled={!name.trim()}>Create</button>
          </form>
        ) : (
          <button type="button" className={sh.row} onClick={() => setCreating(true)}><Plus aria-hidden /><span className={sh.label}>New collection…</span></button>
        ))}
        {section('projects', 'Projects', state.projects)}
      </>
    );
  }
  const group = (field: 'collections' | 'projects', title: string, list: { id: string; name: string; icon?: string }[]) => (
    <>
      <p className={s.menuHead}>{title}</p>
      {list.length === 0 && <p className={s.menunote}>No {title.toLowerCase()} yet.</p>}
      {list.map((g, i) => {
        const on = (a[field] ?? []).includes(g.id);
        const G = groupIcon(g.icon, field);
        return (
          <button key={g.id} type="button" aria-pressed={on} onClick={() => flip(field, g.id, g.name)}>
            <span className={s.menucheck} aria-hidden>{on && <Check />}</span>
            <G aria-hidden className={s.menuIcon} style={{ color: (field === 'collections' ? collectionColour : projectColour)(i) }} />
            <span className={s.menuname}>{g.name}</span>
          </button>
        );
      })}
    </>
  );
  return (
    <>
      {group('collections', 'Collections', state.collections)}
      {creating ? (
        <form className={s.menuform} onSubmit={create}>
          <label className="sr-only" htmlFor={`${uid}-new`}>New collection name</label>
          <input id={`${uid}-new`} className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Collection name" maxLength={60} autoFocus />
          <button type="submit" className="btn primary sm" disabled={!name.trim()}>Create</button>
        </form>
      ) : (
        <button type="button" onClick={() => setCreating(true)}><span className={s.menucheck} aria-hidden><Plus /></span>New collection…</button>
      )}
      <div className="sep" />
      {group('projects', 'Projects', state.projects)}
    </>
  );
}

/** Where the card menu goes: under the ⋯ button, spanning the card's tool row as before, or above it when there isn't
 * room below (bottom row, short windows); clamped inside the viewport, and as tall as the space allows (it scrolls). */
function placeCardMenu(menu: HTMLElement, trigger: HTMLElement) {
  const M = 8, GAP = 6, MAX_H = 360;
  const row = (trigger.parentElement?.parentElement ?? trigger).getBoundingClientRect(); // the card's .tools row
  const t = trigger.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const width = Math.min(Math.max(row.width + 34, 200), vw - 2 * M);
  const left = Math.min(Math.max(M, row.left - 34), vw - M - width);
  const natural = menu.scrollHeight + (menu.offsetHeight - menu.clientHeight); // content plus borders, even while capped
  const below = vh - t.bottom - GAP - M, above = t.top - GAP - M;
  const up = natural > below && above > below;
  const maxH = Math.max(0, Math.min(MAX_H, up ? above : below));
  const h = Math.min(natural, maxH);
  Object.assign(menu.style, { position: 'fixed', left: `${left}px`, right: 'auto', width: `${width}px`, maxHeight: `${maxH}px`,
    top: `${up ? t.top - GAP - h : t.bottom + GAP}px`, bottom: 'auto' });
  menu.dataset.side = up ? 'top' : 'bottom';
}

/** "⋯" on a card: bookmark, copy, open in the panel, and filing into collections and projects (the keyboard and
 * screen-reader way to do what dragging a card does). The menu is portaled to <body>: each card is its own stacking
 * context (contain: layout), so a menu inside it was painted under the next row's card whatever its z-index. */
export function CardMenu({ a, onCopy, onPanel }: { a: Artifact; onCopy?: () => void; onPanel?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const menu = useRef<HTMLDivElement>(null);
  const wrap = useOutsideClose(open, close, menu);
  const trigger = useRef<HTMLButtonElement>(null);
  const keys = useMenuKeys(close, trigger);
  // Tab leaves the menu from its trigger, so focus carries on through the card rather than from the end of <body>
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Tab') { close(); trigger.current?.focus(); return; } keys(e); };
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const m = menu.current, t = trigger.current;
    const place = () => placeCardMenu(m, t);
    place();
    const onScroll = (e: Event) => { if (!(e.target instanceof Node && m.contains(e.target))) place(); };
    window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', place);
    const ro = new ResizeObserver(place); ro.observe(m); // rows change (new collection, bookmark label)
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', place); ro.disconnect(); };
  }, [open]);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); }, [open]);
  // phones: the same actions in a bottom sheet (ItemSheet) instead of the popover
  const phone = useMedia(PHONE_QUERY);
  const [sheet, setSheet] = useState<false | 'touch' | 'keys'>(false);
  const [copied, setCopied] = useState(false);
  const closeSheet = useCallback(() => { setSheet(false); setCopied(false); trigger.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className={s.toolWrap} ref={wrap} data-open={open || !!sheet}>
      <button ref={trigger} type="button" className={s.tool} aria-haspopup={phone ? 'dialog' : 'true'} aria-expanded={open || !!sheet}
        onClick={e => { if (matchMedia(PHONE_QUERY).matches) setSheet(e.detail === 0 ? 'keys' : 'touch'); else setOpen(o => !o); }}
        aria-label={`More for ${a.title}`} title="More: bookmark, copy, add to a collection or project">
        <Dots aria-hidden />
      </button>
      {sheet && (
        <ItemSheet a={a} onClose={closeSheet} keyboard={sheet === 'keys'}>
          {close => (
            <>
              <div className={sh.rows}>
                <button type="button" className={sh.row} aria-pressed={!!a.starred} onClick={() => toggleStar(a.id)}>
                  {a.starred ? <BookmarkFilled aria-hidden /> : <Bookmark aria-hidden />}<span className={sh.label}>Bookmark</span>
                  <span className={sh.tick} aria-hidden>{a.starred && <Check />}</span>
                </button>
                {onCopy && (
                  <button type="button" className={sh.row} data-done={copied || undefined} disabled={copied}
                    onClick={() => { onCopy(); setCopied(true); setTimeout(close, CONFIRM_MS); }}>
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}<span className={sh.label}>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
                {onPanel && <button type="button" className={sh.row} onClick={() => { onPanel(); close(); }}><PanelRightOpen aria-hidden /><span className={sh.label}>Open in panel</span></button>}
              </div>
              <FileList a={a} sheet />
            </>
          )}
        </ItemSheet>
      )}
      {open && createPortal(
        <div className={`menu ${s.toolMenu}`} ref={menu} role="group" aria-label={`Organise ${a.title}`} onKeyDown={onKey}>
          <button type="button" aria-pressed={!!a.starred} onClick={() => toggleStar(a.id)}>
            <span className={s.menucheck} aria-hidden>{a.starred ? <BookmarkFilled /> : <Bookmark />}</span>{a.starred ? 'Bookmarked' : 'Bookmark'}
          </button>
          {onCopy && <button type="button" onClick={() => { onCopy(); close(); trigger.current?.focus(); }}><span className={s.menucheck} aria-hidden><Copy /></span>Copy</button>}
          {onPanel && <button type="button" onClick={() => { onPanel(); close(); }}><span className={s.menucheck} aria-hidden><PanelRightOpen /></span>Open in panel</button>}
          <div className="sep" />
          <FileList a={a} />
        </div>,
        document.body,
      )}
    </div>
  );
}

/** The right panel's Collection tile: shows where the item is filed and opens the same list to change it. */
export function FileTile({ a, children }: { a: Artifact; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const onKey = useMenuKeys(close, trigger);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>('button')?.focus(); }, [open]);
  return (
    <div className={s.fileWrap} ref={wrap}>
      <button ref={trigger} type="button" className={`${s.tile3} ${s.tileBtn}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {children}
      </button>
      {open && (
        <div className={`menu ${s.fileMenu}`} ref={menu} role="group" aria-label="Collections and projects" onKeyDown={onKey}>
          <FileList a={a} />
        </div>
      )}
    </div>
  );
}

/** Tags: chips that filter the Library, × to remove (Undo in the toast), and "Add tag" with suggestions. */
export function TagEditor({ a }: { a: Artifact }) {
  const { state } = useAppState();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const tags = a.tags ?? [];
  const suggestions = tagCounts(state).map(t => t.tag).filter(t => !tags.some(x => x.toLowerCase() === t.toLowerCase()));
  useEffect(() => { if (adding) input.current?.focus(); }, [adding]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = addTag(a.id, value);
    if (!t) { setAdding(false); return; }
    setValue('');
    toast({ message: `Tagged “${t}”`, tone: 'ok' });
    input.current?.focus(); // stay in the field to add another
  };
  const remove = (t: string) => {
    const undo = removeTag(a.id, t);
    toast({ message: `Removed the tag “${t}”`, action: { label: 'Undo', run: undo } });
    addBtn.current?.focus();
  };

  return (
    <div className={s.tagRow} role="group" aria-labelledby={`${uid}-h`}>
      <span id={`${uid}-h`} className={s.tagHead}>Tags</span>
      <ul className={s.tagList}>
        {tags.map(t => (
          <li key={t} className={s.tagChip}>
            <Link href={`/library?tag=${encodeURIComponent(t)}`} className={s.tagLink} title={`Show everything tagged “${t}”`}>{t}</Link>
            <button type="button" className={s.tagX} onClick={() => remove(t)} aria-label={`Remove tag ${t}`} title="Remove tag"><X aria-hidden /></button>
          </li>
        ))}
        <li>
          {adding ? (
            <form className={s.tagForm} onSubmit={submit}>
              <label htmlFor={`${uid}-in`} className="sr-only">New tag</label>
              <input id={`${uid}-in`} ref={input} className={s.tagInput} value={value} maxLength={40} placeholder="Tag name" list={`${uid}-list`} autoComplete="off"
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAdding(false); setValue(''); requestAnimationFrame(() => addBtn.current?.focus()); } }}
                onBlur={() => { if (!value.trim()) setAdding(false); }} />
              <datalist id={`${uid}-list`}>{suggestions.map(t => <option key={t} value={t} />)}</datalist>
            </form>
          ) : (
            <button ref={addBtn} type="button" className={s.tagAdd} onClick={() => setAdding(true)}><Plus aria-hidden />Add tag</button>
          )}
        </li>
      </ul>
    </div>
  );
}
