// Unit checks for local notifications (build-out Stage 9). Usage: node verify/notify/notify-test.mjs
import '../_ts.mjs'; // notifications.ts imports the changelog (What's new) without an extension, as the app does
const { DEMO } = await import('../../src/lib/demo-data.ts');
const { notices, visibleNotices, unreadNotices } = await import('../../src/lib/notifications.ts');
const { linkSavedMessage } = await import('../../src/lib/capture/messages.ts');
const { LATEST_CHANGE } = await import('../../src/lib/changelog.ts');
const { has } = await import('../../src/lib/features.ts'); // a release snapshot can lack a feature (lib/features.ts)
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const now = Date.parse('2026-10-22T12:00:00Z');
const base = () => ({ v: 1, sources: structuredClone(DEMO.sources).map(s => ({ ...s, demo: true })), artifacts: structuredClone(DEMO.artifacts).map(a => ({ ...a, demo: true })), projects: [], collections: [], boards: [], references: [], prefs: { theme: 'system', reviewView: 'auto' }, seededDemo: true });
let s = base();
const review = notices(s, now).find(n => n.key === 'review');
check('sources ready to review make one grouped notice', /^\d+ ready to review$/.test(review?.title ?? '') && review.href === '/inbox', review?.title);
check('sources that need you make a warning', notices(s, now).find(n => n.key === 'needs')?.tone === 'warn');
check('demo data alone never nags about backups', !notices(s, now).some(n => n.key === 'backup'));
s.sources.unshift({ id: 's-mine', kind: 'manual', title: 'Mine', savedAt: new Date(now).toISOString(), status: 'nothing' });
check('your own data with no backup asks for one', notices(s, now).find(n => n.key === 'backup')?.title === 'Back up: you haven’t yet');
s.prefs.lastBackupAt = new Date(now - 2 * 864e5).toISOString();
check('a recent backup is quiet', !notices(s, now).some(n => n.key === 'backup'));
s.prefs.lastBackupAt = new Date(now - 9 * 864e5).toISOString();
check('a backup older than a week says how old', notices(s, now).find(n => n.key === 'backup')?.title === 'Back up: last one 9 days ago');
const v = notices(s, now).find(n => n.key === 'review');
s.prefs.dismissed = { review: v.version };
check('a dismissed notice stays hidden while nothing changes', !visibleNotices(s, now).some(n => n.key === 'review'));
s.sources.unshift({ id: 's-new', kind: 'manual', title: 'New paste', savedAt: new Date(now).toISOString(), status: 'review', candidates: [{ id: 'c1', type: 'prompt', title: 'P' }] });
check('…and comes back when there is something new to review', visibleNotices(s, now).some(n => n.key === 'review'));
s.boards = [{ id: 'b1', title: 'Calm', note: '', sections: [], createdAt: '', updatedAt: new Date(now).toISOString() }];
s.artifacts.unshift({ id: 'a-brief', type: 'prompt', title: 'Brief: Calm', boardId: 'b1', savedAt: new Date(now - 864e5).toISOString(), history: [{ when: new Date(now - 864e5).toISOString(), what: 'Saved from a board as a prompt' }] });
const changed = notices(s, now).find(n => n.key === 'brief:b1');
if (has('playground')) check('a board edited after its brief was saved says so, linking to the board', changed?.href === '/boards/b1', changed?.title);
else check('without Playground, boards make no notices', !changed);
s.artifacts[0].history.push({ when: new Date(now).toISOString(), what: 'Brief updated from the board · text replaced' });
s.boards[0].updatedAt = new Date(now - 1000).toISOString();
const saved = notices(s, now).find(n => n.key === 'briefsaved:b1');
if (has('playground')) check('after saving the brief again: "Board brief updated", linking to the item', saved?.href === '/library/a-brief');
else check('without Playground, a saved brief makes no notice either', !saved);
// The toast after saving a link must match the GitHub setting (it once said "off" while reading was on)
check('link toast: GitHub reading off says so', /Reading GitHub links is off/.test(linkSavedMessage({ kind: 'github', title: 'acme/kit' }, false)));
check('link toast: GitHub reading on points to the Inbox, never says off', /Read it from GitHub there/.test(linkSavedMessage({ kind: 'github', title: 'acme/kit' }, true)) && !/off/.test(linkSavedMessage({ kind: 'github', title: 'acme/kit' }, true)));
check('link toast: other links say reading isn’t connected', /isn’t connected/.test(linkSavedMessage({ kind: 'youtube', title: 'A talk' }, true)));
// Settings › Notifications (24 Oct): kinds switched off, and the backup interval
{
  const t = base(); t.sources.unshift({ id: 's-mine', kind: 'manual', title: 'Mine', savedAt: new Date(now).toISOString(), status: 'nothing' });
  t.prefs.lastBackupAt = new Date(now - 10 * 864e5).toISOString();
  const has = k => notices(t, now).some(n => n.key === k);
  check('backup interval: 10 days old, every 7 (the default): reminded', has('backup'));
  t.prefs.backupEveryDays = 14; check('…every 14: not yet', !has('backup'));
  t.prefs.lastBackupAt = new Date(now - 15 * 864e5).toISOString(); check('…15 days old, every 14: reminded', has('backup'));
  t.prefs.backupEveryDays = 30; check('…every 30: not yet', !has('backup'));
  t.prefs.backupEveryDays = 0; delete t.prefs.lastBackupAt; check('…never: no reminder, even with no backup at all', !has('backup'));
  t.prefs.backupEveryDays = 5; t.prefs.lastBackupAt = new Date(now - 8 * 864e5).toISOString(); check('…an unknown interval falls back to 7 days', has('backup'));
  check('ready to review is on by default', has('review'));
  t.prefs.notify = { review: false }; check('ready to review switched off: not shown', !has('review') && has('needs'));
  t.prefs.notify = { review: true, needs: false }; check('couldn’t be read switched off: not shown', has('review') && !has('needs'));
}
// Design review (25 Oct): read state, times, actions and What's new
{
  const t = base();
  const all = notices(t, now);
  check('every notice has a time and an action', all.every(n => !isNaN(+new Date(n.at)) && ['Review', 'Open', 'Back up'].includes(n.action)), all.map(n => `${n.key}:${n.at}:${n.action}`).join(' '));
  t.prefs.readNotices = Object.fromEntries(all.map(n => [n.key, n.version]));
  check('read notices stay listed but are not counted', visibleNotices(t, now).length === all.length && unreadNotices(t, now).length === 0);
  t.sources.unshift({ id: 's-new2', kind: 'manual', title: 'Another', savedAt: new Date(now).toISOString(), status: 'review', candidates: [{ id: 'c9', type: 'prompt', title: 'P' }] });
  check('…until the event changes (something new to review is unread again)', unreadNotices(t, now).some(n => n.key === 'review'));
  check('newest first', visibleNotices(t, now).every((n, i, xs) => i === 0 || +new Date(xs[i - 1].at) >= +new Date(n.at)));
  const w = base();
  check('What’s new: nothing for someone who has never opened it', !notices(w, now).some(n => n.kind === 'whatsnew'));
  w.prefs.whatsNewSeen = '2026-01-01';
  check('…a notice once there is something newer than what was seen', notices(w, now).some(n => n.kind === 'whatsnew' && n.href === '/help/whats-new'));
  w.prefs.whatsNewSeen = LATEST_CHANGE;
  check('…gone once the newest is seen', !notices(w, now).some(n => n.kind === 'whatsnew'));
}
check('notices are one line: no secondary explanations', notices(base(), now).every(n => !n.detail || n.key === 'review'));
console.log(`\n${pass}/${pass + fail} notification checks passed`);
process.exit(fail ? 1 : 0);
