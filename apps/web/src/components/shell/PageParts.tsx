'use client';
/* Page parts shared by every page in the new shell (refinement pass): one page header (title, subtitle, actions), one
 * section header, one small empty state, and the quiet "Demo data" note for the top bar. */
import type { LucideIcon } from '@/components/ui/icons';
import { type ReactNode } from 'react';
import { useScrollSpy } from '@/components/ui/useScrollSpy';
import p from './page.module.css';

export function PageHead({ title, subtitle, actions, lead }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; lead?: ReactNode }) {
  return (
    <div className={p.pageHead} data-lead={lead ? true : undefined}>
      {lead && <div className={p.pageHeadLead}>{lead}</div>}
      <div className={p.pageHeadText}>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className={p.pageHeadActions}>{actions}</div>}
    </div>
  );
}

export function SectionHead({ id, title, count, actions }: { id?: string; title: string; count?: number; actions?: ReactNode }) {
  return (
    <div className={p.secHead}>
      <h2 id={id}>{title}{count !== undefined && <span className={p.secCount}>{count}</span>}</h2>
      {actions && <div className={p.secActions}>{actions}</div>}
    </div>
  );
}

export function SmallEmpty({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={p.smallEmpty}>
      <span className={p.smallEmptyIcon} aria-hidden><Icon /></span>
      <div className={p.smallEmptyText}><b>{title}</b>{children && <span>{children}</span>}</div>
      {action && <div className={p.smallEmptyAction}>{action}</div>}
    </div>
  );
}

export const DemoNote = () => <span className={p.demoNote} title="Fictional demonstration data, written for this prototype">Demo data</span>;

/** Reading pages (Settings, Help, Your AI): a section list on the left that follows the reading position, and the
 * content at a readable width; the pair is centred in the panel. Narrow panels drop the list. */
export function DocLayout({ label, sections, children }: { label: string; sections: readonly (readonly [string, string])[]; children: ReactNode }) {
  const ids = sections.map(([id]) => id);
  const [on, hold] = useScrollSpy(ids, () => innerHeight * 0.3);
  return (
    <div className={p.doc}>
      <nav className={p.docNav} aria-label={label}>
        <ul>
          {sections.map(([id, text]) => (
            <li key={id}><a href={`#${id}`} aria-current={on === id ? 'true' : undefined} onClick={() => hold(id)}>{text}</a></li>
          ))}
        </ul>
      </nav>
      <div className={p.docMain}>{children}</div>
    </div>
  );
}
