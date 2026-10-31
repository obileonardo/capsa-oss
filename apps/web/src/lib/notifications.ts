/* Notifications (build-out Stage 9): local events worked out from what's on this device. Nothing is pushed or sent.
 * Each event has a key and a version; dismissing stores the version, so the same event comes back only when it
 * changes (a new item to review, the backup getting older, a board edited again). Pure, for the checks.
 * Settings › Notifications (24 Oct) switches kinds off (prefs.notify) and sets the backup interval (prefs.backupEveryDays). */
import { LATEST_CHANGE } from './changelog';
import { available, has, type FeatureId } from './features';
import type { AppState, Artifact, NoticeKind, Prefs } from './types';

/** `at`: when the event happened (for "2h ago" and the Today / Earlier groups). `action`: the row's verb. */
export interface Notice { key: string; kind: NoticeKind; version: string; title: string; detail?: string; href: string; tone: 'accent' | 'warn' | 'neutral'; at: string; action: 'Review' | 'Open' | 'Back up' }

const DAY = 86_400_000;
/** The default days between backup reminders. */
export const BACKUP_DUE_DAYS = 7;
export const BACKUP_INTERVALS = [7, 14, 30, 0] as const;
/** Days between backup reminders (0: never). */
export const backupEvery = (p: Prefs): number => (BACKUP_INTERVALS as readonly number[]).includes(p.backupEveryDays as number) ? p.backupEveryDays! : BACKUP_DUE_DAYS;
/** Whether the bell shows this kind (the backup reminder is governed by its interval instead). */
export const notifyOn = (p: Prefs, kind: NoticeKind) => (kind === 'backup' ? backupEvery(p) > 0 : kind === 'context' ? p.notify?.context === true : p.notify?.[kind] !== false);
/** Kinds that stay off until switched on (NTF-03: context resurfacing). */
export const OFF_BY_DEFAULT: NoticeKind[] = ['context'];

/** The kinds a person can switch, in the order Settings lists them. The backup reminder is its interval row. */
/** The kinds Settings › Notifications lists; a kind a feature adds only where that feature is (lib/features.ts). */
export const NOTICE_KINDS: { kind: Exclude<NoticeKind, 'backup'>; label: string }[] = ([
  { kind: 'review', label: 'Ready to review' },
  { kind: 'needs', label: 'Couldn’t be read' },
  { kind: 'brief', label: 'Board changed since its brief', feature: 'playground' },
  { kind: 'briefsaved', label: 'Board brief updated', feature: 'playground' },
  { kind: 'context', label: 'Saved items that fit a project', feature: 'organise' },
  { kind: 'whatsnew', label: 'What’s new' },
] satisfies { kind: Exclude<NoticeKind, 'backup'>; label: string; feature?: FeatureId }[]).filter(available);

const iso = (t: number) => new Date(Number.isFinite(t) ? t : 0).toISOString();
const latest = (xs: (string | undefined)[]) => iso(Math.max(0, ...xs.map(x => (x ? +new Date(x) : 0)).filter(Number.isFinite)));

export function notices(s: AppState, now = Date.now()): Notice[] {
  const out: Notice[] = [];
  // snoozed sources (REV-08, Track C) stay quiet until their time comes
  const review = s.sources.filter(x => x.status === 'review' && !(x.snoozedUntil && +new Date(x.snoozedUntil) > now) && (x.candidates ?? []).some(c => !(x.keptIds ?? []).includes(c.id) && !(x.skippedIds ?? []).includes(c.id)));
  if (review.length) out.push({
    key: 'review', kind: 'review', version: review.map(x => x.id).sort().join(','), tone: 'accent', href: review.length === 1 ? `/inbox/${review[0].id}` : '/inbox',
    title: `${review.length} ready to review`, detail: review.length === 1 ? review[0].title : undefined, at: latest(review.map(x => x.savedAt)), action: 'Review',
  });
  const needs = s.sources.filter(x => x.status === 'needs_thread' || x.status === 'failed');
  if (needs.length) out.push({
    key: 'needs', kind: 'needs', version: needs.map(x => x.id).sort().join(','), tone: 'warn', href: needs.length === 1 ? `/inbox/${needs[0].id}` : '/inbox',
    title: `${needs.length} couldn’t be read`, at: latest(needs.map(x => x.savedAt)), action: 'Review',
  });
  const every = backupEvery(s.prefs);
  const hasData = s.artifacts.some(a => !a.demo) || s.sources.some(x => !x.demo) || s.boards.some(b => !b.demo);
  const last = s.prefs.lastBackupAt ? +new Date(s.prefs.lastBackupAt) : null;
  if (every > 0 && hasData && (last === null || now - last > every * DAY)) {
    const days = last === null ? null : Math.floor((now - last) / DAY);
    out.push({
      key: 'backup', kind: 'backup', version: last === null ? 'never' : `${Math.floor(days! / every)}`, tone: 'warn', href: '/settings/data#backup',
      title: last === null ? 'Back up: you haven’t yet' : `Back up: last one ${days} days ago`,
      // due since the interval ran out; never backed up: since your first item
      at: last === null ? latest([s.artifacts.filter(a => !a.demo).map(a => a.savedAt).sort()[0] ?? s.sources.filter(x => !x.demo).map(x => x.savedAt).sort()[0]]) : iso(last + every * DAY),
      action: 'Back up',
    });
  }
  for (const b of has('playground') ? s.boards : []) {
    const brief = s.artifacts.find(a => a.boardId === b.id && !a.refId);
    if (!brief) continue;
    const savedAt = Math.max(+new Date(brief.savedAt), ...(brief.history ?? []).filter(h => /brief/i.test(h.what)).map(h => +new Date(h.when)));
    if (+new Date(b.updatedAt) > savedAt + 1000) out.push({
      key: `brief:${b.id}`, kind: 'brief', version: b.updatedAt, tone: 'neutral', href: `/boards/${b.id}`,
      title: `Board “${b.title || 'Untitled board'}” changed since its brief`, at: b.updatedAt, action: 'Open',
    });
    else if (now - savedAt < 2 * DAY && (brief.history ?? []).some(h => /Brief updated/.test(h.what) && now - +new Date(h.when) < 2 * DAY)) out.push({
      key: `briefsaved:${b.id}`, kind: 'briefsaved', version: String(savedAt), tone: 'neutral', href: `/library/${brief.id}`,
      title: `Board brief updated: “${b.title || 'Untitled board'}”`, at: iso(savedAt), action: 'Open',
    });
  }
  // NTF-03 (Track B): you opened a project in the last week and saved items outside it may fit. Off by default.
  const lp = s.organise?.lastProject;
  const proj = lp && now - +new Date(lp.at) < 7 * DAY ? s.projects.find(p => p.id === lp.id) : undefined;
  if (proj && has('organise') && notifyOn(s.prefs, 'context')) {
    const fit = projectFit(s, proj.id);
    if (fit.length) out.push({
      key: `context:${proj.id}`, kind: 'context', version: fit.map(a => a.id).sort().join(','), tone: 'neutral', href: `/projects/${encodeURIComponent(proj.id)}#fit`,
      title: `${fit.length} saved ${fit.length === 1 ? 'item' : 'items'} may fit “${proj.name}”`, at: lp!.at, action: 'Open',
    });
  }
  // What's new: only once you've seen an earlier entry (to someone new, everything is new; Help still marks it)
  const seen = s.prefs.whatsNewSeen;
  if (seen && seen < LATEST_CHANGE) out.push({
    key: 'whatsnew', kind: 'whatsnew', version: LATEST_CHANGE, tone: 'neutral', href: '/help/whats-new', title: 'What’s new in Capsa', at: `${LATEST_CHANGE}T09:00:00.000Z`, action: 'Open',
  });
  return out.filter(n => notifyOn(s.prefs, n.kind));
}

export const visibleNotices = (s: AppState, now = Date.now()) => notices(s, now).filter(n => s.prefs.dismissed?.[n.key] !== n.version)
  .sort((a, b) => +new Date(b.at) - +new Date(a.at));
/** Read: opened, or cleared with Mark all read, at this version. A new version (something new to review) is unread again. */
export const isRead = (s: AppState, n: Notice) => s.prefs.readNotices?.[n.key] === n.version;
/** What the bell counts. */
export const unreadNotices = (s: AppState, now = Date.now()) => visibleNotices(s, now).filter(n => !isRead(s, n));

/* ---------- NTF-03 context resurfacing (Track B): saved items outside a project that share its tags, domains or words ---------- */
const STOP_FIT = new Set('the and for with you your are use using how what when into about from this that'.split(' '));
const fitWords = (t: string) => (t.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).filter(w => w.length > 2 && !STOP_FIT.has(w));
export function projectFit(s: AppState, projectId: string, limit = 5): Artifact[] {
  const p = s.projects.find(x => x.id === projectId);
  if (!p) return [];
  const members = s.artifacts.filter(a => (a.projects ?? []).includes(projectId));
  const tags = new Set(members.flatMap(a => (a.tags ?? []).map(t => t.toLowerCase())));
  const domains = new Map<string, number>();
  members.forEach(a => (a.domains ?? []).forEach(d => domains.set(d, (domains.get(d) ?? 0) + 1)));
  const pw = new Set(fitWords(`${p.name} ${p.note ?? ''}`).filter(w => w.length > 3));
  return s.artifacts
    .filter(a => !(a.projects ?? []).includes(projectId))
    .map(a => {
      let n = 2 * (a.tags ?? []).filter(t => tags.has(t.toLowerCase())).length;
      n += (a.domains ?? []).filter(d => (domains.get(d) ?? 0) >= 2).length;
      n += 1.5 * fitWords(`${a.title} ${a.purpose ?? ''}`).filter(w => pw.has(w)).length;
      return { a, n };
    })
    .filter(x => x.n >= 2)
    .sort((x, y) => y.n - x.n || +new Date(y.a.savedAt) - +new Date(x.a.savedAt))
    .slice(0, limit).map(x => x.a);
}

