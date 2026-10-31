'use client';
/* Empty states (design-references/mockups/empty-states.html, approved 23 Oct): the brand hero where one is drawn, else a thin line drawing of the real object,
 * a serif title, one black primary (with its key) and at most one quiet secondary. A faint scatter of Capsa's own
 * type icons on canvases only. No helper sentences, no tiles behind icons. */
import type { ReactNode } from 'react';
import {
  AppWindow, Blocks, BookOpen, Command, FileCode2, Image, Lightbulb, MessageSquareText, Plug, SquareTerminal, Workflow, Wrench,
} from './icons';
import { BrandIcon, glyphFor, type BrandConcept } from './BrandIcon';
import { hasArt, Illustration } from './Illustration';
import e from './empty.module.css';

const SCATTER = ([['prompt', MessageSquareText], ['skill', Blocks], ['mcp_server', Plug], ['tool', Wrench], ['capture', AppWindow], ['technique', Lightbulb],
  ['command', Command], ['command_config', SquareTerminal], ['template', FileCode2], ['reference', BookOpen], ['workflow', Workflow], ['image', Image]] as const)
  .map(([n, I]) => glyphFor(n, I));
const SPOTS: [number, number][] = [[18, 22], [30, 12], [44, 18], [62, 10], [76, 20], [86, 34], [12, 44], [82, 56], [20, 68], [34, 80], [66, 78], [78, 70]];

const svg = (children: ReactNode) => <svg className={e.draw} viewBox="0 0 120 84" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>{children}</svg>;
const DRAW: Record<string, ReactNode> = {
  boards: svg(<>
    <rect x="30" y="4" width="62" height="46" rx="6" transform="rotate(6 61 27)" opacity=".55" />
    <rect x="22" y="14" width="66" height="50" rx="6" /><line x1="55" y1="14" x2="55" y2="64" /><line x1="22" y1="39" x2="55" y2="39" />
    <rect x="61" y="20" width="21" height="14" rx="2" /><line x1="26" y1="74" x2="62" y2="74" /><line x1="26" y1="80" x2="48" y2="80" opacity=".6" />
  </>),
  library: svg(<>
    <rect x="18" y="8" width="40" height="52" rx="6" /><rect x="62" y="8" width="40" height="52" rx="6" opacity=".55" />
    <line x1="26" y1="20" x2="48" y2="20" /><line x1="26" y1="28" x2="50" y2="28" /><line x1="26" y1="36" x2="42" y2="36" />
    <rect x="24" y="66" width="18" height="8" rx="4" /><line x1="18" y1="80" x2="50" y2="80" opacity=".6" />
    <line x1="70" y1="20" x2="92" y2="20" opacity=".55" /><line x1="70" y1="28" x2="88" y2="28" opacity=".55" />
  </>),
  inbox: svg(<><path d="M24 44 L34 18 H86 L96 44 V70 H24 Z" /><path d="M24 44 H44 L48 52 H72 L76 44 H96" /><path d="M50 30 l7 7 l13 -13" /></>),
  group: svg(<>
    <rect x="30" y="8" width="60" height="18" rx="5" /><rect x="26" y="32" width="68" height="18" rx="5" /><rect x="22" y="56" width="76" height="18" rx="5" opacity=".55" />
    <rect x="34" y="13" width="12" height="8" rx="3" /><line x1="52" y1="17" x2="80" y2="17" /><rect x="30" y="37" width="12" height="8" rx="3" /><line x1="48" y1="41" x2="82" y2="41" />
  </>),
  search: svg(<><circle cx="54" cy="38" r="20" /><line x1="69" y1="53" x2="86" y2="70" /><line x1="46" y1="32" x2="62" y2="32" opacity=".6" /><line x1="46" y1="40" x2="58" y2="40" opacity=".6" /></>),
};

/** An illustration from the sketch engine wins where one is drawn; then the brand hero (glass light, rose gold dark); else the line drawing. */
const ART: Record<string, string> = {
  library: 'library-empty', inbox: 'inbox-clear', boards: 'boards-empty', group: 'group-empty', search: 'search-empty', deleted: 'bin',
  collections: 'collections-none', projects: 'projects-none', sources: 'capture-anywhere', duplicates: 'review-all-kept', smart: 'filters',
};
const HERO: Record<string, BrandConcept | undefined> = { library: 'library', inbox: 'done', boards: 'boards', search: 'search' };

export function EmptyScene({ drawing, title, actions, scatter, compact, id }: {
  drawing?: keyof typeof DRAW | string; title: ReactNode; actions?: ReactNode; scatter?: boolean; compact?: boolean; id?: string;
}) {
  const name = drawing ? ART[drawing] ?? drawing : '';
  const art = hasArt(name) ? name : null;
  return (
    <section className={e.scene} data-compact={compact || undefined} aria-labelledby={id}>
      {scatter && !art && ( /* an illustration carries the scene on its own; the flat icon scatter would mix two styles */
        <div className={e.scatter} aria-hidden>
          {SPOTS.map(([x, y], k) => { const I = SCATTER[k % SCATTER.length]; return <I key={k} style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${(k % 3 - 1) * 8}deg)` }} />; })}
        </div>
      )}
      {drawing && (art ? <Illustration name={art} size={compact ? 168 : 216} className={e.art} />
        : HERO[drawing] ? <BrandIcon name={HERO[drawing]} tier="hero" size={112} className={e.hero} fallback={DRAW[drawing]} /> : DRAW[drawing])}
      <h2 className={e.title} id={id}>{title}</h2>
      {actions && <div className={e.actions}>{actions}</div>}
    </section>
  );
}
