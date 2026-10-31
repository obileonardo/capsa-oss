'use client';
/* A collection or project as a place (build-out Stage 6), in the new shell: icon (picked from the icon set), name and
 * note you can edit in place, its items (remove with Undo, add from the Library), and for projects its boards and the
 * briefs saved from them. Delete keeps the items in the Library and has Undo. */
import { Briefcase, Check, Download, Folder, LibraryBig, MoreHorizontal, Pencil, Plus, Search, Sparkles, SwatchBook, Trash2, X } from '@/components/ui/icons';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AiExportDialog from '@/components/ai/AiExportDialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageTop from '@/components/shell/PageTop';
import { DemoNote, PageHead, SectionHead, SmallEmpty } from '@/components/shell/PageParts';
import { useShell } from '@/components/shell/AppShell';
import { useMedia } from '@/components/inbox/useMedia';
import { createPortal } from 'react-dom';
import Panel, { EmptyPanel } from './Panel';
import { EmptyScene } from '@/components/ui/EmptyScene';
import ExportDialog from './ExportDialog';
import { Ev, type Group } from './Results';
import { collectionColour } from './look';
import s from './library.module.css';
import { Empty, TypeTag, useOutsideClose, useToast } from '@/components/ui';
import { relTime } from '@/lib/format';
import { deleteGroup, referencesOf, setBoardProject, setNoAi, toggleArtifactIn, updateGroup, useAppState } from '@/lib/store';
import { CircleOff } from '@/components/ui/icons';
import type { Artifact } from '@/lib/types';
import { GROUP_ICONS, groupIcon } from './groupIcons';
import { plural } from './lib';
import p from '@/components/shell/page.module.css';
import g from './groups.module.css';
import MightFit from '@/slots.gen/MightFit'; // Organise's "Might fit" (release 3, lib/features.ts)
import { has } from '@/lib/features';

type Kind = 'collections' | 'projects';

export default function GroupPage({ kind, id }: { kind: Kind; id: string }) {
  const { state } = useAppState();
  const { asideSlot } = useShell();
  const docked = useMedia('(min-width: 1100px)');
  const router = useRouter();
  const toast = useToast();
  const one = kind === 'collections' ? 'collection' : 'project';
  const title = kind === 'collections' ? 'Collections' : 'Projects';
  const group = (kind === 'collections' ? state.collections : state.projects).find(x => x.id === id);
  const items = useMemo(() => state.artifacts.filter(a => (a[kind] ?? []).includes(id)).sort((x, y) => y.savedAt.localeCompare(x.savedAt)), [state.artifacts, kind, id]);
  const boards = kind === 'projects' ? state.boards.filter(b => b.projectId === id) : [];
  const briefs = items.filter(a => a.evidence?.locator?.startsWith('from your board'));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const renameBtn = useRef<HTMLButtonElement>(null);
  const params = useSearchParams();
  const [exportOpen, setExportOpen] = useState(() => params.get('export') === '1');
  const [exportItemsOpen, setExportItemsOpen] = useState(false);
  const colById = useMemo(() => new Map<string, Group>(state.collections.map((c, i) => [c.id, { id: c.id, name: c.name, colour: collectionColour(i), icon: c.icon }])), [state.collections]);

  useEffect(() => { if (group) document.title = `${group.name} · Capsa`; }, [group]);

  if (!group) {
    return (
      <div className={p.page} data-own-nav-toggle>
        <PageTop crumbs={[{ label: title, href: `/${kind}` }, { label: 'Not found' }]} />
        <div className={p.body}>
          <Empty icon={Folder} title={`This ${one} isn’t here`} action={<Link href={`/${kind}`} className="btn">All {kind}</Link>}>
            It may have been deleted, or the link is out of date.
          </Empty>
        </div>
      </div>
    );
  }
  const Icon = groupIcon(group.icon, kind);
  const active = items.find(a => a.id === activeId) ?? items[0];
  const startRename = () => { setName(group.name); setRenaming(true); };
  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (v && v !== group.name) { updateGroup(kind, id, { name: v }); toast({ message: `Renamed to “${v}”`, tone: 'ok' }); }
    setRenaming(false); requestAnimationFrame(() => renameBtn.current?.focus());
  };
  const saveNote = () => {
    if (note === null) return;
    if (note.trim() !== (group.note ?? '')) { updateGroup(kind, id, { note: note.trim() }); toast({ message: 'Note saved', tone: 'ok' }); }
    setNote(null);
  };
  const remove = () => {
    const undo = deleteGroup(kind, id);
    router.push(`/${kind}`);
    toast({ message: `Deleted “${group.name}”`, action: { label: 'Undo', run: undo } });
  };
  const removeItem = (a: Artifact) => {
    toggleArtifactIn(a.id, kind, id);
    toast({ message: `Removed “${a.title}” from “${group.name}”`, action: { label: 'Undo', run: () => toggleArtifactIn(a.id, kind, id) } });
  };

  return (
    <div className={p.page} data-own-nav-toggle>
      <PageTop crumbs={[{ label: title, href: `/${kind}`, icon: kind === 'collections' ? Folder : Briefcase }, { label: group.name }]} actions={group.demo ? <DemoNote /> : undefined} />
      <div className={p.body}>
        <PageHead
          lead={<IconPicker kind={kind} value={group.icon} Icon={Icon} onPick={v => updateGroup(kind, id, { icon: v })} />}
          title={renaming ? (
            <form className={g.renameForm} onSubmit={saveName} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false); requestAnimationFrame(() => renameBtn.current?.focus()); } }}>
              <label htmlFor="grp-rename" className="sr-only">{one[0].toUpperCase() + one.slice(1)} name</label>
              <input id="grp-rename" className={`input ${g.renameInput}`} value={name} maxLength={60} autoFocus onChange={e => setName(e.target.value)} onBlur={saveName} />
            </form>
          ) : <span className={g.titleRow}>{group.name}<button ref={renameBtn} type="button" className={g.inlineIcon} onClick={startRename} aria-label={`Rename ${one}`} title="Rename"><Pencil aria-hidden /></button></span>}
          actions={<>
            {items.length > 0 && <Link href={`/library?${kind === 'collections' ? 'collection' : 'project'}=${encodeURIComponent(id)}`} className="btn">Open in Library</Link>}
            <button type="button" className="btn" onClick={() => setExportOpen(true)}><Sparkles aria-hidden />Export for AI</button>
            {kind === 'collections' && (() => { // PRV-02 (Track C): ready for when AI arrives
              const on = !!(group as { noAi?: boolean }).noAi;
              return <button type="button" className="btn icon" aria-pressed={on} aria-label="Don’t send to AI" title={`Don’t send to AI${on ? ': on' : ''}. Nothing is sent to AI today.`}
                onClick={() => { const undo = setNoAi('collection', id, !on); toast({ message: !on ? `“${group.name}” marked Don’t send to AI` : 'Don’t send to AI removed', action: { label: 'Undo', run: undo } }); }}><CircleOff aria-hidden /></button>;
            })()}
            <MoreMenu one={one} onRename={startRename} onDelete={remove} onExport={items.length ? () => setExportItemsOpen(true) : undefined} />
          </>} />

        <section className={`${g.placeSec} ${g.noteSec}`} aria-label={kind === 'projects' ? 'What it’s for' : 'Note'}>
          {note !== null ? (
            <div className={g.noteEdit}>
              <label htmlFor="grp-note-ta" className="sr-only">Note</label>
              <textarea id="grp-note-ta" className="textarea" rows={3} value={note} autoFocus maxLength={2000} onChange={e => setNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote(); } if (e.key === 'Escape') { e.stopPropagation(); setNote(null); } }} />
              <div className={g.noteBar}><button type="button" className="btn ghost" onClick={() => setNote(null)}>Cancel</button><button type="button" className="btn primary" onClick={saveNote}>Save note</button></div>
            </div>
          ) : (
            <button type="button" className={g.noteShow} onClick={() => setNote(group.note ?? '')}>
              {group.note ? <span className={g.noteText}>{group.note}</span> : <span className={g.notePh}>Add a note</span>}
              <Pencil aria-hidden />
            </button>
          )}
        </section>

        <section className={g.placeSec} aria-labelledby="grp-items-h">
          <SectionHead id="grp-items-h" title="Items" count={items.length} actions={items.length > 0 ? <AddItems kind={kind} id={id} name={group.name} /> : undefined} />
          {items.length === 0 ? (
            <EmptyScene compact drawing="group" title={`Nothing in “${group.name}”`} actions={<AddItems kind={kind} id={id} name={group.name} label="Add from Library" primary />} />
          ) : (
            <ul className={g.itemList} id="grp-items" aria-label={`Items in ${group.name}`}>
              {items.map(a => (
                <li key={a.id} className={g.item} data-active={docked && a.id === active?.id} onFocus={() => setActiveId(a.id)} onMouseDown={() => setActiveId(a.id)}>
                  <span className={g.itemType}><TypeTag type={a.type} /></span>
                  <span className={g.itemMain}>
                    <Link href={`/library/${a.id}`} className={g.itemTitle}
                      onClick={e => { if (docked && !e.metaKey && !e.ctrlKey && e.detail !== 0) { e.preventDefault(); setActiveId(a.id); } }}
                      onDoubleClick={() => router.push(`/library/${a.id}`)}>{a.title}</Link>
                    {a.purpose && <span className={g.itemSub}>{a.purpose}</span>}
                  </span>
                  <span className={g.itemEv}><Ev e={a.evidence} compact /></span>
                  <time className={g.itemWhen} dateTime={a.savedAt} title={new Date(a.savedAt).toLocaleString('en-GB')}>{relTime(a.savedAt)}</time>
                  <button type="button" className={g.itemX} onClick={() => removeItem(a)} aria-label={`Remove ${a.title} from ${group.name}`} title={`Remove from ${one}`}><X aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {kind === 'projects' && MightFit && <MightFit projectId={id} name={group.name} />}
        {kind === 'projects' && has('playground') && (
          <section className={g.placeSec} aria-labelledby="grp-boards-h">
            <SectionHead id="grp-boards-h" title="Boards" count={boards.length} actions={boards.length > 0 ? <AddBoard projectId={id} /> : undefined} />
            {boards.length === 0 ? (
              <SmallEmpty icon={SwatchBook} title="No boards yet" action={<AddBoard projectId={id} />} />
            ) : (
              <ul className={g.itemList}>
                {boards.map(b => (
                  <li key={b.id} className={g.item}>
                    <span className={g.itemType}><span className={g.boardTag}><SwatchBook aria-hidden />Board</span></span>
                    <span className={g.itemMain}>
                      <Link href={`/boards/${b.id}`} className={g.itemTitle}>{b.title}</Link>
                      <span className={g.itemSub}>{plural(referencesOf(state, b.id).length, 'reference')}{b.note ? ` · ${b.note}` : ''}</span>
                    </span>
                    <span className={g.itemEv}>{briefs.some(a => a.boardId === b.id) ? 'Brief saved' : ''}</span>
                    <time className={g.itemWhen} dateTime={b.updatedAt}>{relTime(b.updatedAt)}</time>
                    <button type="button" className={g.itemX} aria-label={`Take ${b.title} out of this project`} title="Take out of project"
                      onClick={() => { setBoardProject(b.id, null); toast({ message: `Took “${b.title}” out of “${group.name}”`, action: { label: 'Undo', run: () => setBoardProject(b.id, id) } }); }}><X aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      {docked && asideSlot && createPortal(
        active ? <Panel a={active} src={state.sources.find(x => x.id === active.sourceId)} cols={(active.collections ?? []).map(c => colById.get(c)).filter((x): x is Group => !!x)} />
          : <section className={s.panel} aria-label="Selected item"><EmptyPanel title="Add items to see them here" /></section>,
        asideSlot,
      )}
      <ExportDialog open={exportItemsOpen} onClose={() => setExportItemsOpen(false)} items={items} />
      <AiExportDialog open={exportOpen} onClose={() => setExportOpen(false)} name={group.name} note={group.note} items={items} />
    </div>
  );
}

/** ⋯: the less-used actions (rename, delete with Undo), out of the way of the main ones. */
function MoreMenu({ one, onRename, onDelete, onExport }: { one: string; onRename: () => void; onDelete: () => void; onExport?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) menu.current?.querySelector<HTMLElement>('button')?.focus(); }, [open]);
  return (
    <div className={g.moreWrap} ref={wrap}>
      <button ref={btn} type="button" className="btn icon" aria-haspopup="true" aria-expanded={open} aria-label="More actions" title="More actions" onClick={() => setOpen(o => !o)}><MoreHorizontal aria-hidden /></button>
      {open && (
        <div className={`menu ${g.moreMenu}`} ref={menu} role="group" aria-label="More actions" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); btn.current?.focus(); } }}>
          <button type="button" onClick={() => { close(); onRename(); }}><Pencil aria-hidden />Rename {one}</button>
          {onExport && <button type="button" onClick={() => { close(); onExport(); }}><Download aria-hidden />Export items…</button>}
          <div className="sep" />
          <button type="button" className="danger" onClick={() => { close(); onDelete(); }}><Trash2 aria-hidden />Delete {one}</button>
        </div>
      )}
    </div>
  );
}

/** Pick a collection's or project's icon from GROUP_ICONS. Also used, compact, by Settings › Collections and projects. */
export function IconPicker({ kind, value, Icon, onPick, label = 'Choose an icon', compact }: {
  kind: Kind; value?: string; Icon: React.ComponentType<{ 'aria-hidden'?: boolean }>; onPick: (v: string) => void; label?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) (menu.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? menu.current?.querySelector<HTMLElement>('button'))?.focus(); }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 5 : e.key === 'ArrowUp' ? -5 : 0;
    if (step) { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, i + step))]?.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
  };
  return (
    <div className={g.iconWrap} ref={wrap}>
      <button ref={btn} type="button" className={`${g.iconBtn} ${compact ? g.iconBtnSm : ''}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)} aria-label={label} title="Choose an icon">
        <Icon aria-hidden />
      </button>
      {open && (
        <div className={`menu ${g.iconMenu}`} ref={menu} role="group" aria-label="Icons" onKeyDown={onKey}>
          {Object.entries(GROUP_ICONS).map(([k, I]) => (
            <button key={k} type="button" aria-pressed={(value ?? (kind === 'collections' ? 'folder' : 'briefcase')) === k} aria-label={k} title={k}
              onClick={() => { onPick(k); setOpen(false); btn.current?.focus(); }}><I aria-hidden /></button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Add items": search the Library and tick items into this collection or project. */
function AddItems({ kind, id, name, label = 'Add items', primary }: { kind: Kind; id: string; name: string; label?: string; primary?: boolean }) {
  const { state } = useAppState();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const close = useCallback(() => { setOpen(false); setQ(''); }, []);
  const wrap = useOutsideClose(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const needle = q.trim().toLowerCase();
  const list = state.artifacts.filter(a => !needle || a.title.toLowerCase().includes(needle) || (a.purpose ?? '').toLowerCase().includes(needle)).slice(0, 30);
  return (
    <div className={g.addWrap} ref={wrap}>
      <button ref={btn} type="button" className={primary ? 'btn primary' : 'btn'} aria-haspopup="true" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}><Plus aria-hidden />{label}</button>
      {open && (
        <div className={`menu ${g.addMenu}`} role="group" aria-label={`Add items to ${name}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); btn.current?.focus(); } }}>
          <div className={g.addSearch}><Search aria-hidden /><label htmlFor="grp-add-q" className="sr-only">Find in your Library</label>
            <input id="grp-add-q" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find in your Library" autoComplete="off" /></div>
          {list.length === 0 && <p className={g.addNone}>Nothing matches.</p>}
          {list.map(a => {
            const on = (a[kind] ?? []).includes(id);
            return (
              <button key={a.id} type="button" aria-pressed={on} onClick={() => toggleArtifactIn(a.id, kind, id)}>
                <span className={g.addCheck} aria-hidden>{on && <Check />}</span><span className={g.addName}>{a.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddBoard({ projectId }: { projectId: string }) {
  const { state } = useAppState();
  const toast = useToast();
  const others = state.boards.filter(b => b.projectId !== projectId);
  if (!others.length) return has('playground') ? <Link href="/playground?show=boards" className="btn"><Plus aria-hidden />New board</Link> : null;
  return (
    <span className={g.selectWrap}>
      <label htmlFor="grp-add-board" className="sr-only">Add a board to this project</label>
      <select id="grp-add-board" className={`input ${g.select}`} value="" onChange={e => {
        const b = state.boards.find(x => x.id === e.target.value);
        if (!b) return;
        const before = b.projectId ?? null;
        setBoardProject(b.id, projectId);
        toast({ message: `Added “${b.title}” to the project`, tone: 'ok', action: { label: 'Undo', run: () => setBoardProject(b.id, before) } });
      }}>
        <option value="">Add a board…</option>
        {others.map(b => <option key={b.id} value={b.id}>{b.title}{b.projectId ? ' (in another project)' : ''}</option>)}
      </select>
    </span>
  );
}
