'use client';
/* The new-shell top bar shared by every page (Library has its own, same look): sidebar toggle, breadcrumb, actions. */
import { ChevronRight, PanelLeft, type LucideIcon } from '@/components/ui/icons';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { useShell } from './AppShell';
import p from './page.module.css';

export interface Crumb { label: string; href?: string; icon?: LucideIcon }

export default function PageTop({ crumbs, actions }: { crumbs: Crumb[]; actions?: ReactNode }) {
  const { toggleSidebar } = useShell();
  return (
    <header className={p.top}>
      <button type="button" className={p.tgl} onClick={toggleSidebar} aria-label="Show or hide the sidebar" title="Sidebar"><PanelLeft aria-hidden /></button>
      <span className={p.csep} aria-hidden />
      <nav className={p.crumb} aria-label="Breadcrumb">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const Icon = c.icon;
          return (
            <Fragment key={i}>
              {i > 0 && <ChevronRight aria-hidden />}
              {Icon && i === 0 && <Icon aria-hidden />}
              {last ? <b aria-current="page">{c.label}</b> : c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
            </Fragment>
          );
        })}
      </nav>
      {actions && <div className={p.topActions}>{actions}</div>}
    </header>
  );
}
