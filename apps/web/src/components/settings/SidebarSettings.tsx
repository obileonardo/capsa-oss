'use client';
/* Settings › Sidebar (Elvis, 25 Oct: "when people are customizing their sidebars they can choose different views",
 * Jira #585's Customize your sidebar, GitBook #563's Structure, beehiiv #544). Three views with drawn miniatures; then
 * the sections. Inbox, Library and Playground always show. "Your things" can be dragged into a new order (or moved with the
 * arrow keys on the grip, announced to screen readers) and switched off; the bottom group can be switched off. */
import { useRef, useState } from 'react';
import { useShell } from '@/components/shell/AppShell';
import { Activity, Bookmark, Briefcase, Folder, GraduationCap, GripVertical, Inbox, LibraryBig, Search, Shapes, Sparkles, Tag, type LucideIcon } from '@/components/ui/icons';
import { BOTTOM, moved, thingsOrder, YOUR_THINGS, type SideView, type ThingId } from '@/lib/sidebar';
import { has } from '@/lib/features';
import { setPrefs, useAppState } from '@/lib/store';
import st from './sidebarSettings.module.css';

const ICON: Record<string, LucideIcon> = { bookmarks: Bookmark, collections: Folder, projects: Briefcase, tags: Tag, searches: Search, ai: Sparkles, activity: Activity, learn: GraduationCap };
const FIXED = [{ id: 'inbox', label: 'Inbox', icon: Inbox }, { id: 'library', label: 'Library', icon: LibraryBig }, ...(has('playground') ? [{ id: 'boards', label: 'Playground', icon: Shapes }] : [])];
const VIEWS: { id: SideView; label: string }[] = [{ id: 'full', label: 'Full' }, { id: 'compact', label: 'Compact' }, { id: 'rail', label: 'Icons only' }];
const label = (id: string) => [...YOUR_THINGS, ...BOTTOM].find(x => x.id === id)?.label ?? id;

function Mini({ view }: { view: SideView }) {
  const rows = view === 'compact' ? 7 : 5;
  return (
    <span className={st.mini} data-view={view} aria-hidden>
      <span className={st.miniSide}>{Array.from({ length: rows }, (_, i) => <i key={i} data-w={view === 'rail' ? 0 : (i % 3) + 1} />)}</span>
      <span className={st.miniMain}><b /><i /><i /><i /></span>
    </span>
  );
}

export function Switch({ id, on, onChange, name = label(id) }: { id: string; on: boolean; onChange?: () => void; name?: string }) {
  return (
    <label className={st.switch}>
      <input type="checkbox" role="switch" checked={on} onChange={onChange} disabled={!onChange} aria-label={`Show ${name}`} />
      <i aria-hidden />
    </label>
  );
}

export default function SidebarSettings() {
  const { state } = useAppState();
  const { sidebarView, setSidebarView } = useShell();
  const hidden = new Set(state.prefs.sidebar?.hidden ?? []);
  const saved = thingsOrder(state.prefs);
  const [drag, setDrag] = useState<{ id: ThingId; order: ThingId[] } | null>(null);
  const [said, setSaid] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const order = drag?.order ?? saved;
  const save = (change: { hidden?: string[]; order?: string[] }) => setPrefs({ sidebar: { ...state.prefs.sidebar, ...change } });
  const toggle = (id: string) => save({ hidden: hidden.has(id) ? [...hidden].filter(x => x !== id) : [...hidden, id] });
  const move = (id: ThingId, by: number) => {
    const next = moved(saved, id, by);
    if (next === saved) return;
    save({ order: next });
    setSaid(`${label(id)}, position ${next.indexOf(id) + 1} of ${next.length}`);
  };
  // dragging the grip: the row follows the pointer's place among the rows; the order is saved on release
  const onDown = (id: ThingId) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, order: saved });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag || !list.current) return;
    const rows = [...list.current.querySelectorAll<HTMLElement>('[data-thing]')];
    const others = rows.filter(r => r.dataset.thing !== drag.id);
    let at = others.findIndex(r => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    if (at < 0) at = others.length;
    const rest = drag.order.filter(x => x !== drag.id);
    const next = [...rest.slice(0, at), drag.id, ...rest.slice(at)];
    if (next.join() !== drag.order.join()) setDrag({ ...drag, order: next });
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.order.join() !== saved.join()) { save({ order: drag.order }); setSaid(`${label(drag.id)}, position ${drag.order.indexOf(drag.id) + 1} of ${drag.order.length}`); }
    setDrag(null);
  };

  return (
    <div className={st.wrap}>
      <section aria-labelledby="sb-view" data-setting="sidebar-view">
        <h3 id="sb-view" className={st.h2}>View</h3>
        <div className={st.views} role="radiogroup" aria-label="Sidebar view">
          {VIEWS.map(v => (
            <button key={v.id} type="button" role="radio" aria-checked={sidebarView === v.id} className={st.view} onClick={() => setSidebarView(v.id)}>
              <Mini view={v.id} />
              <b>{v.label}</b>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="sb-things" data-setting="sidebar-sections">
        <h3 id="sb-things" className={st.h2}>Sections</h3>
        <ul className={st.list}>
          {FIXED.map(x => (
            <li key={x.id} className={st.item} data-fixed>
              <span className={st.grip} aria-hidden />
              <x.icon aria-hidden className={st.ic} />
              <span className={st.name}>{x.label}</span>
              <Switch id={x.id} on name={x.label} />
            </li>
          ))}
        </ul>
        <ul ref={list} className={st.list} aria-label="Your things, in sidebar order" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {order.map((id, i) => {
            const Icon = ICON[id];
            return (
              <li key={id} className={st.item} data-thing={id} data-dragging={drag?.id === id || undefined}>
                <button type="button" className={st.grip} onPointerDown={onDown(id)}
                  aria-label={`Move ${label(id)}, position ${i + 1} of ${order.length}`} title="Drag, or use the arrow keys"
                  onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); move(id, e.key === 'ArrowUp' ? -1 : 1); } }}>
                  <GripVertical aria-hidden />
                </button>
                <Icon aria-hidden className={st.ic} />
                <span className={st.name}>{label(id)}</span>
                <Switch id={id} on={!hidden.has(id)} onChange={() => toggle(id)} />
              </li>
            );
          })}
        </ul>
        <ul className={st.list}>
          {BOTTOM.map(x => {
            const Icon = ICON[x.id];
            return (
              <li key={x.id} className={st.item}>
                <span className={st.grip} aria-hidden />
                <Icon aria-hidden className={st.ic} />
                <span className={st.name}>{x.label}</span>
                <Switch id={x.id} on={!hidden.has(x.id)} onChange={() => toggle(x.id)} />
              </li>
            );
          })}
        </ul>
        <p className="sr-only" aria-live="polite">{said}</p>
      </section>
    </div>
  );
}
