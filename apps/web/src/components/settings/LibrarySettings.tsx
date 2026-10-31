'use client';
/* Settings › Library: Collections and projects, Tags, Deleted (24 Oct). Everything here edits the real records through
 * the store's own actions, with Undo wherever something goes away. */
import { ArrowRight, Check, Clock, Pencil, Plus, Tag, Trash2 } from '@/components/ui/icons';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { groupIcon } from '@/components/library/groupIcons';
import { IconPicker } from '@/components/library/GroupPage';
import { plural } from '@/components/library/lib';
import {
  createCollection, createProject, deleteGroup, pinTag, removeTagEverywhere, renameTag, setTrashRetention, tagCounts, unpinTag, updateGroup, useAppState,
} from '@/lib/store';
import { Row } from './parts';
import s from './settings.module.css';

/** A name you can rename in place: the text, or (while renaming) a field. Enter or leaving the field saves; Esc cancels. */
export function InlineName({ value, label, editing, onSave, onDone, href }: {
  value: string; label: string; editing: boolean; onSave: (v: string) => void; onDone: (saved?: string) => void; href?: string;
}) {
  const [v, setV] = useState(value);
  const done = useRef(false); // Enter saves, then the field unmounts: its blur must not save a second time
  useEffect(() => { if (editing) { setV(value); done.current = false; } }, [editing, value]);
  if (!editing) return href ? <Link href={href} className={s.nameLink}>{value}</Link> : <>{value}</>;
  const save = () => { if (done.current) return; done.current = true; const t = v.trim(); if (t && t !== value) { onSave(t); onDone(t); } else onDone(); };
  return (
    <input className={`input ${s.nameInput}`} aria-label={label} value={v} maxLength={60} autoFocus
      onChange={e => setV(e.target.value)} onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done.current = true; onDone(); } }} />
  );
}

/** After renaming, focus goes back to the row's Rename button (found by data-rename), so the keyboard keeps its place. */
export const focusRename = (key: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-rename="${CSS.escape(key)}"]`)?.focus());

/** "New collection" / "New project": a button that becomes a name field. */
export function NewRow({ noun, onCreate }: { noun: string; onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); setV(''); requestAnimationFrame(() => btn.current?.focus()); };
  if (!open) return <div className={`${s.row} ${s.newRow}`}><button ref={btn} type="button" className="btn" onClick={() => setOpen(true)}><Plus aria-hidden />New {noun}</button></div>;
  return (
    <form className={`${s.row} ${s.newRow}`} onSubmit={e => { e.preventDefault(); const t = v.trim(); if (t) onCreate(t); close(); }}>
      <input className={`input ${s.nameInput}`} aria-label={`New ${noun} name`} placeholder={`New ${noun} name`} value={v} maxLength={60} autoFocus
        onChange={e => setV(e.target.value)} onBlur={() => { if (!v.trim()) close(); }}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }} />
      <button type="submit" className="btn" disabled={!v.trim()}>Create</button>
    </form>
  );
}

export function GroupsSettings() {
  const { state } = useAppState();
  const toast = useToast();
  const [renaming, setRenaming] = useState<string | null>(null);
  const kinds = [
    { kind: 'collections' as const, title: 'Collections', one: 'collection', list: state.collections, create: createCollection },
    { kind: 'projects' as const, title: 'Projects', one: 'project', list: state.projects, create: (n: string) => createProject(n) },
  ];
  return (
    <>
      {kinds.map(({ kind, title, one, list, create }) => (
        <section key={kind} className={s.sec} aria-labelledby={`h-${kind}`} data-setting={kind}>
          <h3 className={s.subHead} id={`h-${kind}`}>{title}</h3>
          <div className={`${s.card} ${s.cardOpen}`}>
            {list.map(gr => {
              const Icon = groupIcon(gr.icon, kind);
              const items = state.artifacts.filter(a => (a[kind] ?? []).includes(gr.id)).length;
              const boards = kind === 'projects' ? state.boards.filter(b => b.projectId === gr.id).length : 0;
              const key = `${kind}:${gr.id}`;
              return (
                <Row key={gr.id} title={<InlineName value={gr.name} label={`${one[0].toUpperCase() + one.slice(1)} name`} editing={renaming === key} href={`/${kind}/${encodeURIComponent(gr.id)}`}
                    onSave={v => { updateGroup(kind, gr.id, { name: v }); toast({ message: `Renamed to “${v}”`, tone: 'ok' }); }} onDone={() => { setRenaming(null); focusRename(key); }} />}
                  sub={`${plural(items, 'item')}${boards ? ` · ${plural(boards, 'board')}` : ''}`}
                  lead={<IconPicker kind={kind} value={gr.icon} Icon={Icon} compact label={`Icon for ${gr.name}`} onPick={v => updateGroup(kind, gr.id, { icon: v })} />}>
                  <span className={s.acts}>
                    <button type="button" className="btn icon" aria-label={`Rename ${gr.name}`} title="Rename" data-rename={key} onClick={() => setRenaming(key)}><Pencil aria-hidden /></button>
                    <button type="button" className="btn icon" aria-label={`Delete ${gr.name}`} title="Delete (Undo in the toast)"
                      onClick={() => { const undo = deleteGroup(kind, gr.id); toast({ message: `Deleted “${gr.name}”`, action: { label: 'Undo', run: undo } }); }}><Trash2 aria-hidden /></button>
                  </span>
                </Row>
              );
            })}
            <NewRow noun={one} onCreate={n => { const g = create(n); toast({ message: `Created “${g.name}”`, tone: 'ok' }); }} />
          </div>
        </section>
      ))}
    </>
  );
}

export function TagsSettings() {
  const { state } = useAppState();
  const toast = useToast();
  const [renaming, setRenaming] = useState<string | null>(null);
  const pins = state.prefs.pinnedTags ?? [];
  const counts = tagCounts(state);
  // every tag in use, then pinned tags no item carries any more (so they can still be unpinned)
  const rows = [...counts, ...pins.filter(p => !counts.some(c => c.tag.toLowerCase() === p.toLowerCase())).map(tag => ({ tag, count: 0 }))];
  const pinned = (t: string) => pins.some(p => p.toLowerCase() === t.toLowerCase());
  return (
    <div className={s.sec}>
      <div className={s.card}>
        {!rows.length && <Row icon={Tag} title="No tags yet" />}
        {rows.map(({ tag, count }) => (
          <Row key={tag} icon={Tag} sub={plural(count, 'item')}
            title={<InlineName value={tag} label="Tag name" editing={renaming === tag} href={`/library?tag=${encodeURIComponent(tag)}`}
              onSave={v => { const n = renameTag(tag, v); toast({ message: `Renamed to “${v}”${n ? ` on ${plural(n, 'item')}` : ''}`, tone: 'ok' }); }} onDone={v => { setRenaming(null); focusRename(`tag:${v ?? tag}`); }} />}>
            <span className={s.acts}>
              <button type="button" className={`btn ${s.pinBtn}`} aria-pressed={pinned(tag)} aria-label={`Pin ${tag}`} title="Pin to the sidebar"
                onClick={() => { if (pinned(tag)) { const undo = unpinTag(tag); toast({ message: `Unpinned “${tag}”`, action: { label: 'Undo', run: undo } }); } else { pinTag(tag); toast({ message: `Pinned “${tag}” to the sidebar`, tone: 'ok' }); } }}>
                {pinned(tag) && <Check aria-hidden />}Pin
              </button>
              <button type="button" className="btn icon" aria-label={`Rename ${tag}`} title="Rename" data-rename={`tag:${tag}`} onClick={() => setRenaming(tag)}><Pencil aria-hidden /></button>
              <button type="button" className="btn icon" aria-label={`Remove ${tag} from all items`} title="Remove from all items (Undo in the toast)"
                onClick={() => { const r = removeTagEverywhere(tag); toast({ message: `Removed “${tag}”${r.count ? ` from ${plural(r.count, 'item')}` : ''}`, action: { label: 'Undo', run: r.undo } }); }}><Trash2 aria-hidden /></button>
            </span>
          </Row>
        ))}
      </div>
    </div>
  );
}

export function DeletedSettings() {
  const { state } = useAppState();
  const toast = useToast();
  const keep = state.prefs.trashRetention === '30d' ? '30d' : 'keep';
  const choose = (v: 'keep' | '30d') => {
    if (v === keep) return;
    const r = setTrashRetention(v);
    if (r.removed) toast({ message: `Emptied ${plural(r.removed, 'item')} deleted over 30 days ago`, action: { label: 'Undo', run: r.undo } });
  };
  return (
    <div className={s.sec}>
      <div className={s.card}>
        <Row icon={Trash2} title="Deleted" sub={plural(state.trash.length, 'item')}>
          <Link href="/deleted" className="btn">Open<ArrowRight aria-hidden /></Link>
        </Row>
        <Row icon={Clock} title="Keep deleted items" setting="keep-deleted">
          <div className="seg" role="group" aria-label="Keep deleted items">
            <button type="button" aria-pressed={keep === 'keep'} onClick={() => choose('keep')}>Until I empty it</button>
            <button type="button" aria-pressed={keep === '30d'} onClick={() => choose('30d')}>30 days</button>
          </div>
        </Row>
      </div>
    </div>
  );
}
