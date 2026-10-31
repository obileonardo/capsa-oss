'use client';
/* Help (build-out Stage 9; its own pages like Settings, 25 Oct): the shortcuts that exist, the glossary, what's kept on
 * this device and how, backing up and restoring, what's new and what isn't connected yet. Plain words, no promises. */
import { CircleHelp } from '@/components/ui/icons';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import PageTop from '@/components/shell/PageTop';
import { PageHead } from '@/components/shell/PageParts';
import { Kbd } from '@/components/ui';
import { storageEstimate } from '@/lib/db';
import { bytes, relTime } from '@/lib/format';
import { setPrefs, useAppState, useHydrated } from '@/lib/store';
import { CHANGELOG, changeDate, LATEST_CHANGE } from '@/lib/changelog';
import { GLOSSARY } from '@/lib/glossary';
import { backupEvery } from '@/lib/notifications';
import { shortcutsFor } from '@/lib/shortcuts';
import { plural } from '@/components/library/lib';
import { has } from '@/lib/features';
import p from '@/components/shell/page.module.css';
import { HELP_SECTIONS, type HelpSection } from './sections';
import s from './help.module.css';

/** The shared list (lib/shortcuts.ts), also shown in Settings › Keyboard shortcuts and the sidebar's Help menu, with any
 * changed keys (THM-07). */
const keysFor = (m: Parameters<typeof shortcutsFor>[0]): [string, string, string][] => shortcutsFor(m).flatMap(g => g.keys.map(k => [g.where, k.keys, k.what] as [string, string, string]));

export default function HelpPage({ section }: { section: HelpSection }) {
  const { state } = useAppState();
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => { storageEstimate().then(setEst); }, []);
  const last = state.prefs.lastBackupAt;
  // HLP-09: opening What's new counts as seeing it (the Help menu's dot goes)
  const ready = useHydrated();
  useEffect(() => { if (section === 'whats-new' && ready && (state.prefs.whatsNewSeen ?? '') < LATEST_CHANGE) setPrefs({ whatsNewSeen: LATEST_CHANGE }); }, [section, ready, state.prefs.whatsNewSeen]);
  const title = HELP_SECTIONS.find(x => x.id === section)!.label;
  useEffect(() => { document.title = `${title} · Help · Capsa`; }, [title]);
  // an old glossary anchor (/help#g-mcp) scrolls to its term once the page is drawn
  useEffect(() => { const h = location.hash.slice(1); if (h) document.getElementById(h)?.scrollIntoView({ block: 'center' }); }, [section]);
  return (
    <div className={p.page} data-own-nav-toggle>
      <PageTop crumbs={[{ label: 'Help', href: '/help/shortcuts', icon: CircleHelp }, { label: title }]} />
      <div className={p.body}>
        <div className={s.page}>
        <PageHead title={title} />

        {section === 'shortcuts' && <section className={s.sec} aria-label="Keyboard shortcuts">
          <div className={s.card}><table className={s.keys}>
            <thead><tr><th scope="col">Where</th><th scope="col">Keys</th><th scope="col">What it does</th></tr></thead>
            <tbody>{keysFor(state.prefs.keys).map(([w, k, d]) => <tr key={w + d}><td>{w}</td><td><Kbd>{k}</Kbd></td><td>{d}</td></tr>)}</tbody>
          </table></div>
        </section>}

        {section === 'device' && <section className={s.sec} aria-label="On this device">
          <Facts rows={[
            ['Stored in', <>This browser (IndexedDB){est ? ` · ${bytes(est.usage)}` : ''}</>],
            ['Contents', `${plural(state.artifacts.length, 'Library item')}, ${plural(state.sources.length, 'source')}${has('playground') ? `, ${plural(state.boards.length, 'board')}, ${plural(state.references.length, 'reference')}` : ''}`],
            ['Uploaded', 'Nothing. No account, no sync'],
            ['Pasted text', 'Unpacked here by rules, no AI'],
            ['Links', <>Saved, not read. GitHub: <Link href="/settings/capture-import#reading">Settings</Link></>],
            ['Clearing site data', 'Deletes the library'],
          ]} />
        </section>}

        {section === 'backup' && <section className={s.sec} aria-label="Backup and restore">
          <Facts rows={[
            ['Last backup', last ? relTime(last) : 'Never'],
            ['Back up', <>Sidebar download icon, or <Link href="/settings/data#backup">Settings</Link>. One .zip with every image</>],
            ['Restore', <><Link href="/settings/data#backup">Settings</Link> › Restore from backup…: Merge in or Replace everything</>],
            ['Reminder', <>{backupEvery(state.prefs) ? `The bell, after ${backupEvery(state.prefs)} days` : 'Off'} · <Link href="/settings/general#notifications">Settings</Link></>],
          ]} />
        </section>}

        {section === 'whats-new' && <section className={s.sec} aria-label="What’s new">
          <div className={s.card}>
            {CHANGELOG.map(c => (
              <div key={c.date} className={s.change}>
                <h3><time dateTime={c.date}>{changeDate(c.date)}</time> · {c.title}</h3>
                <ul>{c.items.map(i => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>}

        {section === 'glossary' && <section className={s.sec} aria-label="Glossary">
          <div className={s.card}>
            <dl className={s.facts}>
              {GLOSSARY.map(g => <div key={g.id} id={`g-${g.id}`}><dt>{g.term}</dt><dd>{g.def}</dd></div>)}
            </dl>
          </div>
        </section>}

        {section === 'not-connected' && <section className={s.sec} aria-label="Not connected yet">
          <Facts rows={[
            ['Reading videos, posts, articles', <span className={p.badge} data-tone="faint">Not connected</span>],
            ['AI inside Capsa', <><span className={p.badge} data-tone="faint">Not connected</span> <Link href="/ai/overview">Use your own AI</Link></>],
            ['AI summaries and explainers', 'Demo data only, labelled AI'],
          ]} />
        </section>}
        </div>
      </div>
    </div>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className={s.card}>
      <dl className={s.facts}>
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </div>
  );
}
