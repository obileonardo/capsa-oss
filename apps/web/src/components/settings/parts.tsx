'use client';
/* Settings building blocks: a card row (icon, label, control) and the on/off switch (the GitHub reading one's look). */
import type { ReactNode } from 'react';
import type { LucideIcon } from '@/components/ui/icons';
import s from './settings.module.css';

/** One settings row: an icon tile (or a control in its place), the label (and a short line under it), then the control. */
export function Row({ icon: Icon, lead, title, titleId, sub, children, className, setting }: {
  icon?: LucideIcon; lead?: ReactNode; title: ReactNode; titleId?: string; sub?: ReactNode; children?: ReactNode; className?: string;
  /** the anchor Settings search jumps to (sections.ts) */ setting?: string;
}) {
  return (
    <div className={`${s.row} ${className ?? ''}`} data-setting={setting}>
      {lead ? <span className={s.rowLead}>{lead}</span> : Icon && <span className={s.rowIcon} aria-hidden><Icon /></span>}
      {sub !== undefined
        ? <div className={s.rowText}><b id={titleId}>{title}</b><p>{sub}</p></div>
        : <b className={s.rowText} id={titleId}>{title}</b>}
      {children}
    </div>
  );
}

/** An on/off switch, named by the row's label (labelledBy). */
export function Switch({ on, onChange, labelledBy }: { on: boolean; onChange: (on: boolean) => void; labelledBy: string }) {
  return (
    <button type="button" role="switch" className={`btn ${s.switchBtn}`} aria-checked={on} aria-labelledby={labelledBy} onClick={() => onChange(!on)}>
      <span className={s.switchTrack} aria-hidden><span className={s.switchKnob} /></span>{on ? 'On' : 'Off'}
    </button>
  );
}
