/* What's new (HLP-09, Track C): written by hand from this repository's git history (git log on main), newest first,
 * in the app's plain words. Add an entry when something a person would notice ships; the Help menu marks entries newer
 * than prefs.whatsNewSeen. Dates are the commit dates. An item about a feature is wrapped in about(), which leaves it
 * out of a build without that feature (lib/features.ts). */
import { has, type FeatureId } from './features';

export interface ChangeEntry { date: string; title: string; items: string[] }
const about = (feature: FeatureId, item: string) => (has(feature) ? [item] : []);

export const CHANGELOG: ChangeEntry[] = [
  { date: '2026-10-29', title: 'LibraryKit is now Capsa', items: [
    'A new name: Capsa, the Roman case that held and carried scrolls',
    'A new mark: a scroll case with a red tag on a looped cord',
    'Everything you saved is where you left it, with nothing to do',
    'The command line is now capsa, and the MCP server is capsa-mcp; the old names still work',
  ] },
  { date: '2026-10-25', title: 'Review, reuse and safer pasting', items: [
    'Merge or split what was found while you review, with Undo',
    'Review later: snooze a source until later today, tomorrow or next week',
    'Optional reasons when you skip something',
    'Secrets and personal data in pasted text are flagged on this device, with Mask',
    'Cautions for risky commands, like curl … | sh, rm -rf and sudo',
    '{{blanks}} work like [blanks], and model parameters such as --ar 16:9 are kept as written',
    'Why each find was picked, and what was left out',
    'Setup for Claude Code, Codex, Cursor and VS Code on saved MCP servers, with what it changes and its permissions',
    'Send to Claude, ChatGPT and others; citations as BibTeX, CSL-JSON or APA',
    ...about('playground', 'More for your AI: collections, filled prompts, boards and briefs on the MCP server, and the lk command line'),
    'Change keyboard shortcuts in Settings',
  ] },
  { date: '2026-10-24', title: 'Settings in groups, Deleted, and the icon rail', items: [
    ...about('playground', 'Settings: twelve pages in six groups, with notifications, keyboard shortcuts, collections, tags and briefs'),
    'Deleted keeps what you delete until you empty it, or for 30 days',
    'The sidebar collapses to an icon rail',
    'Solid or Line icons, in Settings › Appearance',
    'Drawn illustrations in empty states',
    ...about('playground', 'Boards: add references from your Library'),
  ] },
  { date: '2026-10-23', title: 'The Cite mark and a faster capture', items: [
    'New brand: the Cite mark and Ribbon red',
    'Capture rebuilt: one clear prompt goes straight to the Library',
    'Drag cards in the Inbox and the Library, in every browser',
    'A first visit starts with an empty library; sample data is one click away',
  ] },
  { date: '2026-10-22', title: 'The first full version', items: [
    'The Inbox as a board: Ready to review, Processing, Nothing to unpack, Done',
    'Bookmarks, tags and use counts in the Library',
    'Pasted text is split on this device, with no AI',
    ...about('playground', 'Collections and projects as places; boards join projects'),
    ...about('search', 'Search everything with ⌘K'),
    'Use your library in your AI: the local MCP server and exports',
    'Notifications, Help and Settings',
  ] },
];
export const LATEST_CHANGE = CHANGELOG[0].date;
export const changeDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
