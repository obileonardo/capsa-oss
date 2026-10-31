'use client';
import { glyphFor } from '@/components/ui/BrandIcon';
import { GlyphSvg } from '@/components/ui/Glyph';
import { Archive, ArrowRight, CircleOff, CodeXml, Columns2, Download, Eraser, FileText, FolderGit2, HardDrive, Link2, MessageSquareText, Monitor, Moon, Quote, RotateCcw, Search, Settings, Shapes, ShieldCheck, Sparkles, SquareDashed, StickyNote, Sun, SwatchBook, Trash2, Upload } from '@/components/ui/icons';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, Kbd, useToast } from '@/components/ui';
import PageTop from '@/components/shell/PageTop';
import { PageHead } from '@/components/shell/PageParts';
import pk from '@/components/shell/page.module.css';
import InstallAppRow from '@/components/pwa/InstallAppRow';
import { backupFileName, makeBackup, restoreBackup } from '@/lib/backup';
import { requestPersistence, storageEstimate } from '@/lib/db';
import { bytes, relTime } from '@/lib/format';
import { plural } from '@/components/library/lib';
import { clearDemo, resetAll, setPrefs, useAppState } from '@/lib/store';
import { download } from '@/lib/zip';
import { backupEvery, BACKUP_INTERVALS, NOTICE_KINDS, notifyOn } from '@/lib/notifications';
import { briefDefaults } from '@/lib/boards/brief';
import ShortcutSettings from './ShortcutSettings';
import SidebarSettings from './SidebarSettings';
// sections and rows a feature adds (lib/features.ts); sections.ts leaves a section out when its feature isn't here
import ProfileSettings from '@/slots.gen/ProfileSettings';
import type { NoticeKind, Prefs } from '@/lib/types';
import { DeletedSettings, GroupsSettings, TagsSettings } from './LibrarySettings';
import DomainsSettings from '@/slots.gen/DomainsSettings';
import RulesSettings from '@/slots.gen/RulesSettings';
import SearchesSettings from '@/slots.gen/SearchesSettings';
import SmartSettings from '@/slots.gen/SmartSettings';
import ViewsSettings from '@/slots.gen/ViewsSettings';
import TypesSettings from '@/slots.gen/TypesSettings';
import BookmarkletRow from '@/slots.gen/BookmarkletRow';
import ImportSettings from '@/slots.gen/ImportSettings';
import { Row, Switch } from './parts';
import { has } from '@/lib/features';
import { NOTICE_GLYPH } from '@/components/shell/Notifications';
import { groupOf, SETTINGS_HOME, SETTINGS_SECTIONS } from './sections';
import { JUMP_EVENT, SEARCH_EVENT } from './SettingsNav';
import { useFixedHead } from './FixedHead';
import s from './settings.module.css';

const ICON_PREVIEW = ['folder', 'copy', 'chevron-down'];
const NOTICE_ICON: Record<Exclude<NoticeKind, 'backup'>, typeof Sun> = NOTICE_GLYPH;
const BRIEF_PARTS = [
  { k: 'regions', label: 'Marked regions', icon: SquareDashed }, { k: 'palettes', label: 'Palettes', icon: SwatchBook },
  { k: 'avoid', label: 'Avoid list', icon: CircleOff }, { k: 'credits', label: 'Credits section', icon: Quote },
] as const;
const BRIEF_FORMATS = [{ v: 'prompt', label: 'Prompt', icon: MessageSquareText }, { v: 'markdown', label: 'Markdown', icon: FileText }, { v: 'zip', label: 'ZIP bundle', icon: Archive }] as const;

/** Scroll to a section or a setting, then highlight it for a moment; with focus, the keyboard lands there too. The page
 * fills in after the library loads, so it waits (a few frames) for the target to exist. */
function useJumps(group: string) {
  useEffect(() => {
    let live = true;
    const jump = (anchor: string, focusWanted: boolean | 'stored') => {
      let focus = focusWanted;
      const main = document.getElementById('main');
      if (!anchor) { main?.scrollTo({ top: 0 }); return; }
      let tries = 0;
      const step = () => {
        if (!live) return;
        const el = document.getElementById(anchor) ?? document.querySelector<HTMLElement>(`[data-setting="${CSS.escape(anchor)}"]`);
        if (!el) {
          if (tries++ < 90) { requestAnimationFrame(step); return; }
          const home = SETTINGS_SECTIONS.find(x => x.settings.some(y => y.id === anchor));
          if (home && home.id !== anchor) jump(home.id, focus);
          return;
        }
        const whole = el.matches('section[data-sub]');
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ block: whole ? 'start' : 'center', behavior: still ? 'auto' : 'smooth' });
        el.removeAttribute('data-flash'); void el.offsetWidth; el.setAttribute('data-flash', '');
        setTimeout(() => el.removeAttribute('data-flash'), 1900);
        if (focus === 'stored') { try { focus = sessionStorage.getItem('capsa-settings-focus') !== null; sessionStorage.removeItem('capsa-settings-focus'); } catch { focus = false; } }
        if (focus) {
          const target = whole ? el : el.querySelector<HTMLElement>('button, a[href], input, select, [tabindex]') ?? el;
          if (target === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
      };
      requestAnimationFrame(step);
    };
    // focus follows a jump made from the sidebar or search on another group's page (SettingsNav leaves a note); it's read
    // when the target is found, so React's double effect run in development doesn't lose it
    jump(decodeURIComponent(location.hash.slice(1)), 'stored');
    const onJump = (e: Event) => { const d = (e as CustomEvent).detail ?? {}; jump(d.anchor ?? '', !!d.focus); };
    window.addEventListener(JUMP_EVENT, onJump);
    return () => { live = false; window.removeEventListener(JUMP_EVENT, onJump); };
  }, [group]);
}

/** One group of settings as a page: its sections in order, each with its name and a one-line explanation. */
export default function SettingsView({ group }: { group: string }) {
  const g = groupOf(group)!;
  const { state } = useAppState();
  const toast = useToast();
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storageEstimate().then(setEst);
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, [state.references.length]);

  const backup = async () => {
    try {
      const blob = await makeBackup();
      download(blob, backupFileName());
      toast({ message: `Backup downloaded (${bytes(blob.size)})`, tone: 'ok' });
    } catch (e) { toast({ message: `Backup failed: ${(e as Error).message}` }); }
  };
  const restore = async (mode: 'merge' | 'replace') => {
    if (!restoreFile) return;
    try { const r = await restoreBackup(restoreFile, mode); toast({ message: mode === 'merge' ? `Restored. ${r.added} new items added.` : 'Library replaced from backup.', tone: 'ok' }); }
    catch (e) { toast({ message: (e as Error).message }); }
    setRestoreFile(null);
  };
  const demoCount = state.sources.filter(x => x.demo).length + state.artifacts.filter(x => x.demo).length + state.boards.filter(x => x.demo).length;
  const themeBtn = (v: 'system' | 'light' | 'dark', label: string, Icon: typeof Sun) => (
    <button type="button" aria-pressed={state.prefs.theme === v} onClick={() => setPrefs({ theme: v })}><Icon aria-hidden />{label}</button>
  );

  // Icon style: each option previews itself (an object, an action and a direction, pinned to that set)
  const iconsBtn = (v: 'solid' | 'line', label: string) => (
    <button type="button" aria-pressed={(state.prefs.icons ?? 'solid') === v} onClick={() => setPrefs({ icons: v })}>
      <span className={s.iconPreview} aria-hidden>{ICON_PREVIEW.map(n => <GlyphSvg key={n} name={n} set={v} />)}</span>{label}
    </button>
  );

  // Style: each option shows a swatch of itself (plain white, or paper with its red margin rule)
  const lookBtn = (v: 'classic' | 'paper', label: string) => (
    <button type="button" aria-pressed={(state.prefs.look ?? 'classic') === v} onClick={() => setPrefs({ look: v })}>
      <span className={s.lookSwatch} data-look={v} aria-hidden />{label}
    </button>
  );

  const brief = briefDefaults(state.prefs.briefDefaults);
  const setBrief = (c: NonNullable<Prefs['briefDefaults']>) => setPrefs({ briefDefaults: { ...state.prefs.briefDefaults, ...c } });

  const aiFile = state.prefs.lastAiExportAt;
  const title = g.label;
  useEffect(() => { document.title = `${title} · Settings · Capsa`; }, [title]);
  useJumps(group);
  const shellRef = useRef<HTMLDivElement>(null), headRef = useRef<HTMLDivElement>(null);
  const head = useFixedHead(shellRef, headRef, group);

  // each section's settings, by section id (sections.ts says which group shows which, in what order)
  const bodies: Record<string, () => ReactNode> = {
    appearance: () => (
      <div className={s.card}>
        <div className={s.row} data-setting="theme">
          <span className={s.rowIcon} aria-hidden><Sun /></span>
          <b className={s.rowText}>Theme</b>
          <div className="seg" role="group" aria-label="Theme">{themeBtn('system', 'System', Monitor)}{themeBtn('light', 'Light', Sun)}{themeBtn('dark', 'Dark', Moon)}</div>
        </div>
        {has('avatar') && <div className={s.row} data-setting="style">
          <span className={s.rowIcon} aria-hidden><StickyNote /></span>
          <b className={s.rowText}>Style</b>
          <div className="seg" role="group" aria-label="Style">{lookBtn('classic', 'Classic')}{lookBtn('paper', 'Paper')}</div>
        </div>}
        <div className={s.row} data-setting="icon-style">
          <span className={s.rowIcon} aria-hidden><Shapes /></span>
          <b className={s.rowText}>Icon style</b>
          <div className="seg" role="group" aria-label="Icon style">{iconsBtn('solid', 'Solid')}{iconsBtn('line', 'Line')}</div>
        </div>
        <div className={s.row} data-setting="review-view">
          <span className={s.rowIcon} aria-hidden><Columns2 /></span>
          <b className={s.rowText}>Review view</b>
          <div className="seg" role="group" aria-label="Default review view">
            {(['auto', 'list', 'bench', 'focus'] as const).map(v => (
              <button key={v} type="button" aria-pressed={state.prefs.reviewView === v} onClick={() => setPrefs({ reviewView: v })}
                title={v === 'auto' ? 'Bench on wide screens, Focus on narrow ones' : undefined}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>
    ),
    sidebar: () => <SidebarSettings />,
    notifications: () => (
      <div className={s.card}>
        {NOTICE_KINDS.map(({ kind, label }) => (
          <Row key={kind} icon={NOTICE_ICON[kind]} title={label} titleId={`n-${kind}`} setting={`notify-${kind}`}>
            <Switch on={notifyOn(state.prefs, kind)} labelledBy={`n-${kind}`} onChange={on => setPrefs({ notify: { ...state.prefs.notify, [kind]: on } })} />
          </Row>
        ))}
        <Row icon={Download} title="Backup reminder" setting="backup-reminder">
          <div className="seg" role="group" aria-label="Backup reminder">
            {BACKUP_INTERVALS.map(d => (
              <button key={d} type="button" aria-pressed={backupEvery(state.prefs) === d} onClick={() => setPrefs({ backupEveryDays: d })}>{d ? `${d} days` : 'Never'}</button>
            ))}
          </div>
        </Row>
      </div>
    ),
    shortcuts: () => <ShortcutSettings />,
    capture: () => (
      <div className={s.card}>
        <div className={s.row} id="reading">
          <span className={s.rowIcon} aria-hidden><FolderGit2 /></span>
          <div className={s.rowText}>
            <b id="gh-label">Reading public GitHub links (asks first)</b>
            <p id="gh-desc">Sends only the repository address to GitHub’s public API, after you press Read.</p>
          </div>
          <button type="button" role="switch" className={`btn ${s.switchBtn}`} aria-checked={!!state.prefs.readGithub} aria-labelledby="gh-label" aria-describedby="gh-desc"
            onClick={() => { const on = !state.prefs.readGithub; setPrefs({ readGithub: on }); toast({ message: on ? 'GitHub reading on. It asks before each read.' : 'GitHub reading off', tone: on ? 'ok' : undefined }); }}>
            <span className={s.switchTrack} aria-hidden><span className={s.switchKnob} /></span>{state.prefs.readGithub ? 'On' : 'Off'}
          </button>
        </div>
        <div className={s.row} data-setting="link-reading">
          <span className={s.rowIcon} aria-hidden><Link2 /></span>
          <b className={s.rowText}>Reading links, videos and posts</b>
          <span className={pk.badge} data-tone="faint">Not connected</span>
        </div>
        {BookmarkletRow && <BookmarkletRow />}
      </div>
    ),
    import: () => ImportSettings && <ImportSettings />,
    groups: () => <><GroupsSettings />{SmartSettings && <SmartSettings />}{SearchesSettings && <SearchesSettings />}</>,
    rules: () => RulesSettings && <RulesSettings />,
    views: () => ViewsSettings && <ViewsSettings />,
    tags: () => <TagsSettings />,
    types: () => TypesSettings && <TypesSettings />,
    domains: () => DomainsSettings && <DomainsSettings />,
    briefs: () => (
      <div className={s.card}>
        {BRIEF_PARTS.map(({ k, label, icon }) => (
          <Row key={k} icon={icon} title={label} titleId={`b-${k}`} setting={`brief-${k}`}>
            <Switch on={brief[k]} labelledBy={`b-${k}`} onChange={on => setBrief({ [k]: on })} />
          </Row>
        ))}
        <Row icon={FileText} title="Format" setting="brief-format">
          <div className="seg" role="group" aria-label="Brief format">
            {BRIEF_FORMATS.map(f => <button key={f.v} type="button" aria-pressed={brief.format === f.v} onClick={() => setBrief({ format: f.v })}><f.icon aria-hidden />{f.label}</button>)}
          </div>
        </Row>
      </div>
    ),
    ai: () => (
      <div className={s.card}>
        <div className={s.row} data-setting="ai-inside">
          <span className={s.rowIcon} aria-hidden><Sparkles /></span>
          <b className={s.rowText}>AI inside Capsa</b>
          <span className={pk.badge} data-tone="faint">Not connected</span>
        </div>
        <div className={s.row} data-setting="mcp">
          <span className={s.rowIcon} aria-hidden><CodeXml /></span>
          <div className={s.rowText}><b>Local MCP server</b><p>{aiFile ? `Library file downloaded ${relTime(aiFile)}` : 'No library file yet'}</p></div>
          <Link href="/ai/mcp" className="btn">Set up<ArrowRight aria-hidden /></Link>
        </div>
      </div>
    ),
    storage: () => (
      <div className={s.card}>
        <div className={s.row} data-setting="persist">
          <span className={s.rowIcon} aria-hidden><HardDrive /></span>
          <div className={s.rowText}><b>On this device</b><p>{est ? `${bytes(est.usage)} of ${bytes(est.quota)}` : 'Size not reported'}</p></div>
          {persisted
            ? <span className={pk.badge} data-tone="ok">Kept by the browser</span>
            : <button type="button" className="btn" title="Without this, the browser may clear the data when the disk is full"
                onClick={async () => { const ok = await requestPersistence(); setPersisted(ok); toast({ message: ok ? 'The browser will keep it' : 'The browser declined. Back up to be safe.' }); }}>Ask the browser to keep it</button>}
        </div>
        <div className={s.row} id="backup">
          <span className={s.rowIcon} aria-hidden><Download /></span>
          <div className={s.rowText}><b>Back up</b><p>{state.prefs.lastBackupAt ? `Last backup ${relTime(state.prefs.lastBackupAt)}` : 'Never backed up'}</p></div>
          <button type="button" className="btn primary" onClick={backup}><Download aria-hidden />Back up everything</button>
        </div>
        <div className={s.row} id="restore">
          <span className={s.rowIcon} aria-hidden><Upload /></span>
          <b className={s.rowText}>Restore</b>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}><Upload aria-hidden />Restore from backup…</button>
          <input ref={fileInput} type="file" accept=".zip,application/zip" hidden onChange={e => { setRestoreFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </div>
      </div>
    ),
    deleted: () => <DeletedSettings />,
    danger: () => (
      <div className={`${s.card} ${s.danger}`}>
        {demoCount > 0 && (
          <div className={s.row} data-setting="demo-data">
            <span className={s.rowIcon} aria-hidden><Eraser /></span>
            <div className={s.rowText}><b>Demo data</b><p>{plural(demoCount, 'item')}</p></div>
            <button type="button" className="btn" onClick={async () => { const undo = await clearDemo(); toast({ message: 'Demo data removed', action: { label: 'Undo', run: () => { void undo(); } } }); }}><Trash2 aria-hidden />Remove demo data</button>
          </div>
        )}
        <div className={s.row} data-setting="start-over">
          <span className={s.rowIcon} aria-hidden><RotateCcw /></span>
          <b className={s.rowText}>Start over</b>
          <button type="button" className="btn danger" onClick={() => setConfirmReset(true)}>Delete everything…</button>
        </div>
      </div>
    ),
    about: () => (
      <>
        <div className={s.card}>
          <div className={s.row}>
            <span className={s.rowIcon} aria-hidden><ShieldCheck /></span>
            <b className={s.rowText}>Capsa web</b>
            <span className={pk.badge} data-tone="faint">First version</span>
          </div>
          <div data-setting="install" className={s.rowWrap}><InstallAppRow className={`${s.row} ${s.installRow}`} /></div>
        </div>
        <p className={s.licence}>Fonts: Inter, Newsreader and JetBrains Mono (SIL OFL 1.1). Icons: Lucide (ISC). Reading PDFs and images: pdf.js and Tesseract.js (Apache-2.0).</p>
      </>
    ),
  };

  return (
    <div ref={shellRef} className={`${pk.page} ${s.shell}`} data-own-nav-toggle data-wide={group === 'profile' || undefined}>
      <span className={s.topMarker} aria-hidden data-top-marker />
      <PageTop crumbs={[{ label: 'Settings', href: SETTINGS_HOME, icon: glyphFor('settings', Settings) }, { label: title }]} />
      {/* the page title stays put under the top bar while the sections scroll up under it (FixedHead) */}
      <div ref={headRef} className={s.head} data-settings-head data-fixed={head.fixed || undefined} data-under={head.under || undefined}>
        <div className={s.headIn}><PageHead title={title} subtitle={g.blurb} /></div>
      </div>
      <div className={`${pk.body} ${s.body}`}>
        <div className={s.page}>
          {/* phones: the sidebar is a drawer, so the search starts here and opens it (SettingsNav) */}
          <button type="button" className={`omni ${s.narrowSearch}`} onClick={() => window.dispatchEvent(new Event(SEARCH_EVENT))}><Search aria-hidden />Search settings</button>
          {g.sections.map(sec => {
            const header = (
              <header className={s.subHeader}>
                <span className={s.subIcon} aria-hidden><sec.icon /></span>
                <div className={s.subText}>
                  <h2 id={`sh-${sec.id}`}>{sec.label}</h2>
                  <p>{sec.blurb}</p>
                </div>
              </header>
            );
            return (
              <section key={sec.id} id={sec.id} className={s.sub} aria-labelledby={`sh-${sec.id}`} data-sub>
                {/* Profile lays its own heading out: over the form, with the library card rising beside it to the heading's top */}
                {sec.id === 'profile' && ProfileSettings ? <ProfileSettings head={header} /> : <>{header}<Fragment>{bodies[sec.id]?.()}</Fragment></>}
              </section>
            );
          })}
        </div>
      </div>

      <Dialog open={!!restoreFile} onClose={() => setRestoreFile(null)} title="Restore from backup" size="sm"
        footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={() => setRestoreFile(null)}>Cancel</button>
          <button type="button" className="btn" onClick={() => restore('replace')}>Replace everything</button>
          <button type="button" className="btn primary" onClick={() => restore('merge')}>Merge in</button></>}>
        <p style={{ margin: 0 }}><b>{restoreFile?.name}</b></p>
        <p className="muted" style={{ margin: 0 }}>Merge adds anything not already here and keeps your current items. Replace makes this device match the backup exactly.</p>
      </Dialog>
      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} title="Delete everything on this device?" size="sm"
        footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
          <button type="button" className="btn danger" onClick={async () => { setConfirmReset(false); await resetAll(); toast({ message: 'Everything deleted' }); }}>Delete everything</button></>}>
        <p style={{ margin: 0 }}>This removes your sources, library, boards and images from this browser. It can’t be undone. Back up first if you might want them.</p>
      </Dialog>
    </div>
  );
}

