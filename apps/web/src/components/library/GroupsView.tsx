'use client';
/* Collections and Projects: a quiet grid with context (Cosmos feel, Pinterest-easy). Each card opens the group's own page. */
import { FolderKanban, LayoutGrid, Plus, SlidersHorizontal } from '@/components/ui/icons';
import { smartItems, smartSummary } from '@/lib/organise';
import { TYPE_MANY as TYPE_MANY_LABEL } from './look';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TYPE_ICON, useToast } from '@/components/ui';
import { EmptyScene } from '@/components/ui/EmptyScene';
import PageTop from '@/components/shell/PageTop';
import { DemoNote, PageHead } from '@/components/shell/PageParts';
import p from '@/components/shell/page.module.css';
import { groupIcon } from './groupIcons';
import { relTime } from '@/lib/format';
import { createCollection, createProject, useAppState } from '@/lib/store';
import type { Artifact, ArtifactType } from '@/lib/types';
import { plural } from './lib';
import g from './groups.module.css';
import { has } from '@/lib/features';

type Kind = 'collections' | 'projects';
const COPY: Record<Kind, { title: string; one: string; lede: string; Icon: typeof LayoutGrid }> = {
  collections: { title: 'Collections', one: 'collection', lede: 'Your own groupings of items, for finding things again.', Icon: LayoutGrid },
  projects: { title: 'Projects', one: 'project', lede: 'Goals you’re working toward, with the items you’ve linked to them.', Icon: FolderKanban },
};

const TYPE_ONE: Record<ArtifactType, string> = {
  prompt: 'prompt', skill: 'skill', mcp_server: 'MCP server', tool: 'tool', app_tool: 'app or tool', technique: 'technique',
  command: 'command', command_config: 'command or config', template: 'template', reference: 'reference', workflow: 'workflow',
};
const TYPE_MANY: Record<ArtifactType, string> = {
  prompt: 'prompts', skill: 'skills', mcp_server: 'MCP servers', tool: 'tools', app_tool: 'apps or tools', technique: 'techniques',
  command: 'commands', command_config: 'commands or configs', template: 'templates', reference: 'references', workflow: 'workflows',
};

const lastTouched = (a: Artifact) => Math.max(+new Date(a.savedAt), ...(a.history ?? []).map(h => +new Date(h.when)));

function composition(items: Artifact[]): string {
  const counts = new Map<ArtifactType, number>();
  items.forEach(a => counts.set(a.type, (counts.get(a.type) ?? 0) + 1));
  const parts = [...counts].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([t, n]) => `${n} ${n === 1 ? TYPE_ONE[t] : TYPE_MANY[t]}`);
  return parts.join(', ');
}

export default function GroupsView({ kind }: { kind: Kind }) {
  const { state } = useAppState();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const c = COPY[kind];
  const groups = kind === 'collections' ? state.collections : state.projects;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const newBtn = useRef<HTMLButtonElement>(null);

  // Old links (?open=<id>) showed the group under the grid; the group has its own page now.
  const openParam = params.get('open');
  useEffect(() => { if (openParam && groups.some(x => x.id === openParam)) router.replace(`/${kind}/${encodeURIComponent(openParam)}`); }, [openParam, groups, kind, router]);

  const members = useMemo(() => {
    const m = new Map<string, Artifact[]>();
    groups.forEach(gr => m.set(gr.id, state.artifacts.filter(a => (a[kind] ?? []).includes(gr.id)).sort((x, y) => lastTouched(y) - lastTouched(x))));
    return m;
  }, [groups, state.artifacts, kind]);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    const gr = kind === 'collections' ? createCollection(v) : createProject(v, note.trim());
    setCreating(false); setName(''); setNote('');
    toast({ message: `Created “${gr.name}”`, tone: 'ok' });
    router.push(`/${kind}/${encodeURIComponent(gr.id)}`);
  };
  const cancel = () => { setCreating(false); setName(''); setNote(''); requestAnimationFrame(() => newBtn.current?.focus()); };

  const hasDemo = groups.some(x => x.demo);
  // CUR-01 (Track B): smart collections sit with the collections, after them, marked by the filters glyph
  const smart = kind === 'collections' && has('organise') ? state.organise?.smart ?? [] : [];
  const smartMembers = useMemo(() => new Map(smart.map(sc => [sc.id, smartItems(state, sc.rules)])), [smart, state]);

  return (
    <div className={p.page} data-own-nav-toggle>
      <PageTop crumbs={[{ label: c.title, icon: c.Icon }]} actions={hasDemo ? <DemoNote /> : undefined} />
      <div className={p.body}>
        <PageHead title={c.title}
          actions={(groups.length > 0 || creating) && <button ref={newBtn} type="button" className="btn primary" onClick={() => setCreating(true)} disabled={creating}><Plus aria-hidden />New {c.one}</button>} />

        {groups.length === 0 && smart.length === 0 && !creating ? (
          <EmptyScene drawing={kind} title={`No ${kind} yet`}
            actions={<button type="button" className="btn primary" onClick={() => setCreating(true)}><Plus aria-hidden />New {c.one}</button>} />
        ) : (
          <ul className={g.grid} aria-label={c.title}>
            {creating && (
              <li>
                <form className={`${g.card} ${g.createCard}`} onSubmit={create} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } }}>
                  <p className={g.createTitle}>New {c.one}</p>
                  <div className="field">
                    <label htmlFor="grp-name">Name</label>
                    <input id="grp-name" className="input" autoFocus value={name} maxLength={60} onChange={e => setName(e.target.value)}
                      placeholder={kind === 'collections' ? 'e.g. Writing prompts' : 'e.g. Launch the beta'} />
                  </div>
                  {kind === 'projects' && (
                    <div className="field">
                      <label htmlFor="grp-note">What it’s for <span className="muted">(optional)</span></label>
                      <input id="grp-note" className="input" value={note} maxLength={120} onChange={e => setNote(e.target.value)} />
                    </div>
                  )}
                  <div className={g.createBar}>
                    <button type="button" className="btn ghost" onClick={cancel}>Cancel</button>
                    <button type="submit" className="btn primary" disabled={!name.trim()}>Create</button>
                  </div>
                </form>
              </li>
            )}
            {groups.map(gr => {
              const its = members.get(gr.id) ?? [];
              const updated = its.length ? Math.max(...its.map(lastTouched)) : null;
              const desc = (gr as { note?: string }).note || null;
              const GI = groupIcon((gr as { icon?: string }).icon, kind);
              return (
                <li key={gr.id}>
                  <Link id={`grp-${gr.id}`} href={`/${kind}/${encodeURIComponent(gr.id)}`} className={g.card}>
                    <span className={g.mosaic} aria-hidden data-n={Math.min(its.length, 4)}>
                      {its.length === 0 ? <span className={g.emptyTile}><GI /></span> : its.slice(0, 4).map(a => {
                        const I = TYPE_ICON[a.type];
                        return <span key={a.id} className={`${g.tile} t-${a.type}`}><I /><span>{a.title}</span></span>;
                      })}
                    </span>
                    <span className={g.cardBody}>
                      <span className={g.name}><GI aria-hidden /><span>{gr.name}</span></span>
                      {(desc || its.length > 0) && <span className={g.desc}>{desc ?? composition(its)}</span>}
                    </span>
                    <span className={g.foot}>
                      <span>{plural(its.length, 'item')}</span>
                      {updated && <><span aria-hidden>·</span><span>{`updated ${relTime(new Date(updated).toISOString())}`}</span></>}
                    </span>
                  </Link>
                </li>
              );
            })}
            {smart.map(sc => {
              const its = smartMembers.get(sc.id) ?? [];
              return (
                <li key={sc.id}>
                  <Link id={`grp-${sc.id}`} href={`/smart/${encodeURIComponent(sc.id)}`} className={g.card} data-smart>
                    <span className={g.mosaic} aria-hidden data-n={Math.min(its.length, 4)}>
                      {its.length === 0 ? <span className={g.emptyTile}><SlidersHorizontal /></span> : its.slice(0, 4).map(a => {
                        const I = TYPE_ICON[a.type];
                        return <span key={a.id} className={`${g.tile} t-${a.type}`}><I /><span>{a.title}</span></span>;
                      })}
                    </span>
                    <span className={g.cardBody}>
                      <span className={g.name}><SlidersHorizontal aria-hidden /><span>{sc.name}</span></span>
                      <span className={g.desc}>{smartSummary(sc.rules, TYPE_MANY_LABEL).join(' · ')}</span>
                    </span>
                    <span className={g.foot}><span>{plural(its.length, 'item')}</span><span aria-hidden>·</span><span>Smart</span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
