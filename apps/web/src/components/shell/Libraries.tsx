'use client';
/* Libraries (design review 25 Oct, item 1): the sidebar header switches between libraries, the way Arc switches spaces
 * (References: Manus's workspace list with a tick, Confluence's icon tiles, Tana's colour per space).
 * The menu lists each library with its tile, name and item count, the current one ticked, ⌘1–⌘9 beside them; then New
 * library and Manage libraries, then Invite a friend. Data, limits and switching live in lib/libraries.ts and lib/store.ts.
 * Above them, you (Elvis, 27 Oct: "we need to add a way to get to that screen from here"): your face and name, opening
 * Settings › Profile, the way Webflow's and Snowflake's account menus start with who you are. Your profile is the same in
 * every library, so it sits above the list rather than in it. */
import { Check, ChevronDown, ChevronRight, Gift, LibraryBig, Plus, SlidersHorizontal, Trash2 } from '@/components/ui/icons';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog, Kbd, useOutsideClose, useToast } from '@/components/ui';
import { GROUP_ICONS } from '@/components/library/groupIcons';
import { canAddLibrary, FREE_LIBRARY_LIMIT, PRO_PRICE_MONTHLY, LIB_COLORS, addLibrary, updateLibrary, useLibraries, type LibColor, type LibraryMeta } from '@/lib/libraries';
import { currentLibraryId, deleteLibrary, useAppState } from '@/lib/store';
import { avatarOf } from '@/lib/avatar/spec';
// your face (release 5) and Invite a friend come from their features (lib/features.ts)
import Avatar from '@/slots.gen/Avatar';
import avatarCrop from '@/slots.gen/avatarCrop';
import { SETTINGS_HOME } from '@/components/settings/sections';
import type { LucideIcon } from '@/components/ui/icons';
import InviteDialog from '@/slots.gen/InviteDialog';
import { has } from '@/lib/features';
import s from './shell.module.css';

export const LIB_ICONS: Record<string, LucideIcon> = { library: LibraryBig, ...GROUP_ICONS };
const COLOR_NAME: Record<LibColor, string> = { graphite: 'Graphite', blue: 'Blue', teal: 'Teal', green: 'Green', amber: 'Amber', violet: 'Violet', pink: 'Pink', brown: 'Brown' };
const ICON_NAME: Record<string, string> = { swatch: 'Swatches', code: 'Code', book: 'Book' };
const iconName = (k: string) => ICON_NAME[k] ?? k[0].toUpperCase() + k.slice(1);
const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

/** A library's tile: its icon on its colour. */
export function LibTile({ lib, size = 24 }: { lib: Pick<LibraryMeta, 'icon' | 'color'>; size?: 20 | 24 | 32 }) {
  const Icon = LIB_ICONS[lib.icon] ?? LibraryBig;
  return <span className={s.libTile} data-color={lib.color} data-size={size} aria-hidden><Icon /></span>;
}

/** Move focus through a menu's rows with the arrow keys, Home and End. */
export function menuKeys(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"], [data-row]')].filter(x => !x.hasAttribute('disabled'));
  if (!rows.length) return;
  e.preventDefault();
  const i = rows.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : e.key === 'ArrowDown' ? (i + 1) % rows.length : (i - 1 + rows.length) % rows.length;
  rows[next].focus();
}

export function LibrarySwitcher({ onSwitch }: { onSwitch: (id: string) => void }) {
  const libs = useLibraries();
  const { state } = useAppState();
  const cur = currentLibraryId();
  const me = libs.find(l => l.id === cur) ?? libs[0];
  const [open, setOpen] = useState(false);
  const [dlg, setDlg] = useState<'new' | 'manage' | 'pro' | 'invite' | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(); }, [open]);
  const startNew = () => { close(); setDlg(canAddLibrary() ? 'new' : 'pro'); };
  const count = (l: LibraryMeta) => (l.id === cur ? state.artifacts.length : l.count ?? 0);
  const myName = state.prefs.profileName?.trim();
  return (
    <div className={s.wsWrap} ref={wrap}>
      <button ref={btn} type="button" className={s.wsBtn} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} data-tip={me.name}>
        <LibTile lib={me} /><b className={s.lbl}>{me.name}</b><ChevronDown aria-hidden className={s.wsChev} />
      </button>
      {open && (
        <div ref={menu} className={`menu ${s.popLeft} ${s.libMenu}`} role="menu" aria-label="Libraries"
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); btn.current?.focus(); } else menuKeys(e); }}>
          {Avatar && <>
            <Link href={SETTINGS_HOME} role="menuitem" className={s.meRow} onClick={close} data-me>
              <Avatar spec={avatarOf(state.prefs)} size={32} view={avatarCrop} className={s.meFace} />
              <span className={s.libText}>{myName ? <><b>{myName}</b><small>Your profile</small></> : <b>Your profile</b>}</span>
              <ChevronRight aria-hidden className={s.meChev} />
            </Link>
            <div className="sep" />
          </>}
          {libs.map((l, i) => (
            <button key={l.id} type="button" role="menuitemradio" aria-checked={l.id === cur} className={s.libRow}
              onClick={() => { close(); if (l.id !== cur) onSwitch(l.id); }}>
              <LibTile lib={l} size={32} />
              <span className={s.libText}><b>{l.name}</b><small>{items(count(l))}</small></span>
              {l.id === cur ? <Check aria-hidden className={s.libCheck} /> : <span className={s.libCheck} />}
              {i < 9 && <Kbd>⌘{i + 1}</Kbd>}
            </button>
          ))}
          <div className="sep" />
          <button type="button" role="menuitem" onClick={startNew}><Plus aria-hidden />New library</button>
          <button type="button" role="menuitem" onClick={() => { close(); setDlg('manage'); }}><SlidersHorizontal aria-hidden />Manage libraries</button>
          {has('invite') && <>
            <div className="sep" />
            <button type="button" role="menuitem" onClick={() => { close(); setDlg('invite'); }}><Gift aria-hidden />Invite a friend</button>
          </>}
        </div>
      )}
      <NewLibraryDialog open={dlg === 'new'} onClose={() => { setDlg(null); btn.current?.focus(); }} onCreated={id => { setDlg(null); onSwitch(id); }} />
      <ManageLibraries open={dlg === 'manage'} onClose={() => { setDlg(null); btn.current?.focus(); }} onNew={() => setDlg(canAddLibrary() ? 'new' : 'pro')} />
      <ProSheet open={dlg === 'pro'} onClose={() => { setDlg(null); btn.current?.focus(); }} />
      {InviteDialog && <InviteDialog open={dlg === 'invite'} onClose={() => { setDlg(null); btn.current?.focus(); }} />}
    </div>
  );
}

/** Icon and colour pickers, shared by New library and Manage libraries. */
function LookPicker({ icon, color, onIcon, onColor, idBase }: { icon: string; color: LibColor; onIcon: (i: string) => void; onColor: (c: LibColor) => void; idBase: string }) {
  const radioKeys = <T,>(list: readonly T[], cur: T, set: (v: T) => void) => (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = list[(list.indexOf(cur) + d + list.length) % list.length];
    set(next);
    requestAnimationFrame(() => e.currentTarget.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  const icons = Object.keys(LIB_ICONS);
  return (
    <>
      <div className={s.lookField}>
        <span className={s.lookLabel} id={`${idBase}-color`}>Colour</span>
        <div className={s.swatches} role="radiogroup" aria-labelledby={`${idBase}-color`} onKeyDown={radioKeys(LIB_COLORS, color, onColor)}>
          {LIB_COLORS.map(c => (
            <button key={c} type="button" role="radio" aria-checked={c === color} tabIndex={c === color ? 0 : -1} aria-label={COLOR_NAME[c]} title={COLOR_NAME[c]}
              className={s.swatch} data-color={c} onClick={() => onColor(c)}>{c === color && <Check aria-hidden />}</button>
          ))}
        </div>
      </div>
      <div className={s.lookField}>
        <span className={s.lookLabel} id={`${idBase}-icon`}>Icon</span>
        <div className={s.iconGrid} role="radiogroup" aria-labelledby={`${idBase}-icon`} onKeyDown={radioKeys(icons, icon, onIcon)}>
          {icons.map(k => {
            const I = LIB_ICONS[k];
            return (
              <button key={k} type="button" role="radio" aria-checked={k === icon} tabIndex={k === icon ? 0 : -1} aria-label={iconName(k)} title={iconName(k)}
                className={s.iconPick} onClick={() => onIcon(k)}><I aria-hidden /></button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function NewLibraryDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('book');
  const [color, setColor] = useState<LibColor>('blue');
  useEffect(() => { if (open) { setName(''); setIcon('book'); setColor('blue'); } }, [open]);
  const create = (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = name.trim();
    if (!v) return;
    const m = addLibrary(v, icon, color);
    if (!m) { onClose(); return; }
    toast({ message: `Created “${m.name}”`, tone: 'ok' });
    onCreated(m.id);
  };
  return (
    <Dialog open={open} onClose={onClose} title="New library" size="sm"
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="new-lib" className="btn primary" disabled={!name.trim()}>Create library</button></>}>
      <form id="new-lib" className={s.libForm} onSubmit={create}>
        <div className={s.libPreview}><LibTile lib={{ icon, color }} size={32} /><b>{name.trim() || 'New library'}</b></div>
        <label className={s.lookField}><span className={s.lookLabel}>Name</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={40} autoFocus placeholder="Design" />
        </label>
        <LookPicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} idBase="new-lib" />
      </form>
    </Dialog>
  );
}

function ManageLibraries({ open, onClose, onNew }: { open: boolean; onClose: () => void; onNew: () => void }) {
  const libs = useLibraries();
  const { state } = useAppState();
  const toast = useToast();
  const cur = currentLibraryId();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!open) { setEditing(null); setDeleting(null); setTyped(''); } }, [open]);
  const target = libs.find(l => l.id === deleting);
  const doDelete = async () => {
    if (!target || typed.trim() !== target.name) return;
    const name = target.name;
    if (await deleteLibrary(target.id)) { toast({ message: `Deleted “${name}”`, tone: 'ok' }); setDeleting(null); setTyped(''); }
    else toast({ message: `Couldn’t delete “${name}”` });
  };
  return (
    <Dialog open={open} onClose={onClose} title={target ? `Delete “${target.name}”` : 'Manage libraries'}
      footer={target
        ? <><span className="spacer" /><button type="button" className="btn ghost" onClick={() => { setDeleting(null); setTyped(''); }}>Cancel</button>
          <button type="button" className="btn danger" disabled={typed.trim() !== target.name} onClick={doDelete}><Trash2 aria-hidden />Delete library</button></>
        : <><span className="hint">{libs.length} of {FREE_LIBRARY_LIMIT}</span><span className="spacer" />
          <button type="button" className="btn" onClick={onNew}><Plus aria-hidden />New library</button>
          <button type="button" className="btn primary" onClick={onClose}>Done</button></>}>
      {target ? (
        <div className={s.libForm}>
          <div className={s.libPreview}><LibTile lib={target} size={32} /><span className={s.libText}><b>{target.name}</b><small>{items(target.id === cur ? state.artifacts.length : target.count ?? 0)}</small></span></div>
          <label className={s.lookField}><span className={s.lookLabel}>Type “{target.name}” to delete it</span>
            <input className="input" value={typed} onChange={e => setTyped(e.target.value)} autoFocus autoComplete="off"
              onKeyDown={e => { if (e.key === 'Enter') doDelete(); }} />
          </label>
        </div>
      ) : (
        <ul className={s.libList}>
          {libs.map(l => (
            <li key={l.id} className={s.libItem}>
              <div className={s.libItemRow}>
                <button type="button" className={s.libTileBtn} aria-expanded={editing === l.id} aria-label={`Change icon and colour of ${l.name}`} title="Icon and colour"
                  onClick={() => setEditing(e => (e === l.id ? null : l.id))}><LibTile lib={l} size={32} /></button>
                <input className={`input ${s.libName}`} defaultValue={l.name} aria-label={`Name of ${l.name}`} maxLength={40} key={l.name}
                  onBlur={e => updateLibrary(l.id, { name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                <span className={s.libCount}>{items(l.id === cur ? state.artifacts.length : l.count ?? 0)}</span>
                {libs.length > 1 && <button type="button" className="btn ghost icon sm" aria-label={`Delete ${l.name}`} title="Delete" onClick={() => setDeleting(l.id)}><Trash2 aria-hidden /></button>}
              </div>
              {editing === l.id && (
                <div className={s.libLook}>
                  <LookPicker icon={l.icon} color={l.color} onIcon={i => updateLibrary(l.id, { icon: i })} onColor={c => updateLibrary(l.id, { color: c })} idBase={`lib-${l.id}`} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Creating a library past the free limit: what Pro adds. No payment yet. */
export function ProSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="More libraries with Pro" size="sm"
      footer={<><span className="spacer" /><button type="button" className="btn primary" onClick={onClose}>OK</button></>}>
      <ul className={s.plans} aria-label="Plans">
        <li className={s.plan}>
          <span className={s.planName}>Free<span className="tag neutral">Your plan</span></span>
          {PRO_PRICE_MONTHLY != null && <span className={s.planPrice}>$0</span>}
          <span className={s.planWhat}><LibraryBig aria-hidden />{FREE_LIBRARY_LIMIT} libraries</span>
        </li>
        <li className={s.plan} data-pro>
          <span className={s.planName}>Pro<span className="tag neutral">Not available yet</span></span>
          {PRO_PRICE_MONTHLY != null && <span className={s.planPrice}>${PRO_PRICE_MONTHLY}<small>a month</small></span>}
          <span className={s.planWhat}><LibraryBig aria-hidden />More libraries</span>
        </li>
      </ul>
    </Dialog>
  );
}
