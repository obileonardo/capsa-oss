'use client';
/* Notifications (Stage 9; panel redesigned in the design review, 25 Oct, item 2). Local events worked out on this device
 * (lib/notifications.ts). References: Causal and Dovetail (a header with Mark all read and a settings link, an icon
 * per row, a clear action), Slite (Today / earlier groups), Telescope (the illustrated empty state).
 * Each kind has its own glyph; opening a row marks it read; Mark all read clears the bell's count; × dismisses it until
 * the event changes. Arrow keys move between rows, Escape closes and returns to the bell. */
import {
  Bell, CheckCheck, HardDrive, Inbox, Lightbulb, Link2Off, MessageSquareText, Settings, Sparkles, SwatchBook, X, type LucideIcon,
} from '@/components/ui/icons';
import Link from 'next/link';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useOutsideClose, useToast } from '@/components/ui';
import { brandGlyph } from '@/components/ui/BrandIcon';
import { Illustration } from '@/components/ui/Illustration';
import { backupFileName, makeBackup } from '@/lib/backup';
import { bytes, relTime } from '@/lib/format';
import { isRead, unreadNotices, visibleNotices, type Notice } from '@/lib/notifications';
import { dismissNotice, markNoticesRead, useAppState } from '@/lib/store';
import type { NoticeKind } from '@/lib/types';
import { download } from '@/lib/zip';
import { menuKeys } from './Libraries';
import s from './shell.module.css';

const SettingsGlyph = brandGlyph('settings', Settings);
/** One glyph per kind (both icon styles come from the brand set). */
export const NOTICE_GLYPH: Record<NoticeKind, LucideIcon> = {
  review: brandGlyph('inbox', Inbox), needs: Link2Off, backup: HardDrive, brief: brandGlyph('boards', SwatchBook),
  briefsaved: brandGlyph('prompt', MessageSquareText), context: Lightbulb, whatsnew: Sparkles,
};

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function Activity({ rail }: { rail: boolean }) {
  const { state } = useAppState();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useOutsideClose(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const byKey = useRef(false);
  const items = visibleNotices(state);
  const unread = unreadNotices(state);
  useEffect(() => { if (open && byKey.current) panel.current?.querySelector<HTMLElement>('[data-row]')?.focus(); }, [open]);

  const now = new Date();
  const groups: [string, Notice[]][] = [['Today', items.filter(n => sameDay(new Date(n.at), now))], ['Earlier', items.filter(n => !sameDay(new Date(n.at), now))]];
  const markAll = () => {
    const undo = markNoticesRead(unread);
    toast({ message: `Marked ${unread.length} as read`, action: { label: 'Undo', run: undo } });
  };
  const backup = async () => {
    close();
    try { const blob = await makeBackup(); download(blob, backupFileName()); toast({ message: `Backup downloaded (${bytes(blob.size)})`, tone: 'ok' }); }
    catch (e) { toast({ message: `Backup failed: ${(e as Error).message}` }); }
  };
  return (
    <div className={s.wsWrap} ref={wrap}>
      <button ref={btn} type="button" className={s.wsi} aria-haspopup="true" aria-expanded={open}
        onClick={e => { byKey.current = e.detail === 0; setOpen(o => !o); }}
        aria-label={unread.length ? `Notifications: ${unread.length}` : 'Notifications: none'} title={rail ? undefined : 'Notifications'} data-tip="Notifications">
        <Bell aria-hidden />{unread.length > 0 && <span className={s.wdot} aria-hidden />}
      </button>
      {open && (
        <div ref={panel} className={`menu ${s.popRight} ${s.notes}`} role="group" aria-label="Notifications"
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } else menuKeys(e); }}>
          <div className={s.notesHead}>
            <h2 className={s.notesTitle}>Notifications</h2>
            {unread.length > 0 && <button type="button" className={s.notesBtn} onClick={markAll}><CheckCheck aria-hidden />Mark all read</button>}
            <Link href="/settings/general#notifications" onClick={close} className={`${s.notesBtn} ${s.notesIcon}`} aria-label="Notification settings" title="Notification settings"><SettingsGlyph aria-hidden /></Link>
          </div>
          {!items.length ? (
            <div className={s.notesEmpty}><Illustration name="notifications-none" size={112} /><b>Nothing new</b></div>
          ) : groups.filter(([, xs]) => xs.length).map(([label, xs]) => (
            <section key={label} className={s.noteGroup} aria-label={label}>
              <h3 className={s.noteGroupHead}>{label}</h3>
              {xs.map(n => {
                const Icon = NOTICE_GLYPH[n.kind];
                const read = isRead(state, n);
                return (
                  <div key={n.key} className={s.note} data-tone={n.tone} data-unread={!read || undefined}>
                    <span className={s.noteIcon} aria-hidden><Icon /></span>
                    <div className={s.noteBody}>
                      <Link href={n.href} data-row className={s.noteLink} onClick={() => { markNoticesRead([n]); close(); }}>
                        <span className={s.popTitle}>{!read && <span className="sr-only">Unread: </span>}{n.title}</span>
                        {n.detail && <span className={s.popSub}>{n.detail}</span>}
                      </Link>
                      <span className={s.noteMeta}>
                        <time dateTime={n.at}>{relTime(n.at)}</time>
                        {n.action === 'Back up'
                          ? <button type="button" className={s.noteDo} onClick={() => { markNoticesRead([n]); backup(); }}>Back up</button>
                          : <span className={s.noteAction} aria-hidden>{n.action}</span>}
                      </span>
                    </div>
                    {!read && <span className={s.noteDot} aria-hidden />}
                    <button type="button" className={s.noteX} aria-label={`Dismiss: ${n.title}`} title="Dismiss"
                      onClick={() => { const undo = dismissNotice(n.key, n.version); toast({ message: 'Notification dismissed', action: { label: 'Undo', run: undo } }); }}><X aria-hidden /></button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
