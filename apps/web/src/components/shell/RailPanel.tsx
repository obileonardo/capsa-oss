'use client';
/* The rail's Library panel (Elvis, 25 Oct: "the sidebar collapses, but when you click while it's collapsed a tab opens
 * that shows more detail", Plain #538, Plane #552, Databricks #492). With the sidebar as an icon rail, Library opens
 * this beside the rail instead of navigating: the Library's own views, then collections and projects with counts.
 * Click, not hover, so it works on touch. Focus moves in; Escape or a click outside closes it and focus goes back. */
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOutsideClose } from '@/components/ui';
import { Bookmark, LibraryBig, Rows3, ShieldCheck, X } from '@/components/ui/icons';
import { groupIcon } from '@/components/library/groupIcons';
import { useAppState } from '@/lib/store';
import x from './rail.module.css';

export default function RailPanel({ at, onClose, opener }: { at: DOMRect; onClose: () => void; opener: HTMLElement | null }) {
  const { state } = useAppState();
  const box = useRef<HTMLDivElement | null>(null);
  const done = () => { onClose(); opener?.focus(); };
  // a click on the Library icon itself toggles the panel, so it doesn't count as outside
  const outside = useOutsideClose(true, onClose, { current: opener });
  useEffect(() => { box.current?.querySelector<HTMLElement>('a')?.focus(); }, []);
  const n = (field: 'collections' | 'projects', id: string) => state.artifacts.filter(a => (a[field] ?? []).includes(id)).length;
  const top = Math.min(Math.max(12, at.top - 8), Math.max(12, innerHeight - 420));
  return createPortal(
    <div ref={el => { box.current = el; (outside as React.MutableRefObject<HTMLDivElement | null>).current = el; }} className={x.panel}
      style={{ left: at.right + 8, top }} role="dialog" aria-label="Library"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); done(); } }}>
      <div className={x.head}><b>Library</b><button type="button" className="btn ghost sm icon" onClick={done} aria-label="Close"><X aria-hidden /></button></div>
      <nav aria-label="Library">
        <Link href="/library" className={x.row} onClick={onClose}><LibraryBig aria-hidden />All items<span className={x.n}>{state.artifacts.length}</span></Link>
        <Link href="/library?starred=1" className={x.row} onClick={onClose}><Bookmark aria-hidden />Bookmarks</Link>
        <Link href="/library?tab=sources" className={x.row} onClick={onClose}><Rows3 aria-hidden />Sources</Link>
        <Link href="/library?tab=health" className={x.row} onClick={onClose}><ShieldCheck aria-hidden />Health</Link>
        {state.collections.length > 0 && <div className={x.lbl}>Collections</div>}
        {state.collections.map(c => { const GI = groupIcon(c.icon, 'collections'); return <Link key={c.id} href={`/collections/${encodeURIComponent(c.id)}`} className={x.row} onClick={onClose}><GI aria-hidden />{c.name}<span className={x.n}>{n('collections', c.id) || ''}</span></Link>; })}
        {state.projects.length > 0 && <div className={x.lbl}>Projects</div>}
        {state.projects.map(p => { const GI = groupIcon(p.icon, 'projects'); return <Link key={p.id} href={`/projects/${encodeURIComponent(p.id)}`} className={x.row} onClick={onClose}><GI aria-hidden />{p.name}<span className={x.n}>{n('projects', p.id) || ''}</span></Link>; })}
      </nav>
    </div>,
    document.body,
  );
}
