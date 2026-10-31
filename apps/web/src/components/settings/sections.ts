/* Settings, grouped (Elvis, 26 Oct: "subcategories could work best... when you click on that group you then have the
 * different sections and the nuggets explained in them", and "we need to be able to search within settings").
 * Seven groups, each one page at /settings/<group>; each page holds its sections, every section with a one-line
 * explanation (the only helper text Settings has, by Elvis's request). The sidebar lists the groups and, under the open
 * one, its sections. The old one-section pages (/settings/<section>) and the older one-page anchors (/settings#backup)
 * still work: they land on the section's group, scrolled to it (see the routes and LEGACY_ANCHORS).
 *
 * Search (SettingsSearch) reads this file: groups, sections and the settings inside them, by name, explanation and a
 * few other words people use for the same thing ("dark" finds Theme, "backup" finds Storage and backup). A setting's
 * `id` is its anchor: the row carries data-setting="<id>" (or that id), so a match scrolls to the exact row.
 *
 * A section or setting that a feature adds names it (`feature`), and stays out of a build without that feature
 * (lib/features.ts); a group left with no sections goes too. A name or explanation that mentions a feature says how it
 * reads without it (`without`). */
import { available, has, type FeatureId } from '@/lib/features';
import { Bell, Command, FileText, Folder, FolderPlus, HardDrive, Info, Layers, LayoutGrid, Link2, PanelLeft, Shapes, SlidersHorizontal, Sparkles, Sun, Tag, Trash2, TriangleAlert, Upload, UserRound } from '@/components/ui/icons';
import type { LucideIcon } from '@/components/ui/icons';

export interface SettingEntry { id: string; label: string; words?: string; feature?: FeatureId }
type Without = Partial<Record<FeatureId, { label?: string; blurb?: string; words?: string }>>;
export interface SettingsSectionDef { id: string; label: string; icon: LucideIcon; blurb: string; words?: string; settings: SettingEntry[]; feature?: FeatureId; without?: Without }
export interface SettingsGroupDef { id: string; label: string; icon: LucideIcon; blurb: string; words?: string; sections: SettingsSectionDef[]; without?: Without }

const GROUPS: SettingsGroupDef[] = [
  { id: 'profile', label: 'Profile', icon: UserRound, blurb: 'Who you are here, and what your library says about you.', words: 'me account you', sections: [
    { id: 'profile', label: 'Your library card', icon: UserRound, blurb: 'Your name, work and face, with your prompts and activity.', words: 'me account card id name avatar flip back', feature: 'avatar', settings: [
      { id: 'profile-name', label: 'Name', words: 'display name your name save' },
      { id: 'profile-role', label: 'Role', words: 'job title bio headline what you do' },
      { id: 'profile-company', label: 'Company', words: 'work employer organisation organization where you work business studio' },
      { id: 'avatar', label: 'Avatar', words: 'face picture photo character customise customize' },
      { id: 'avatar-alive', label: 'Animated avatar', words: 'animation moving blink idle character alive motion' },
    ] },
  ] },
  { id: 'general', label: 'General', icon: SlidersHorizontal, blurb: 'How Capsa looks, its sidebar, notifications and keys.', words: 'preferences look display', sections: [
    { id: 'appearance', label: 'Appearance', icon: Sun, blurb: 'Theme, style, icons and how reviews open.', words: 'look display design', without: { avatar: { blurb: 'Theme, icons and how reviews open.' } }, settings: [
      { id: 'theme', label: 'Theme', words: 'dark light night mode system colour color scheme' },
      { id: 'style', label: 'Style', words: 'classic paper look notebook serif', feature: 'avatar' },
      { id: 'icon-style', label: 'Icon style', words: 'solid line outline glyphs icons' },
      { id: 'review-view', label: 'Review view', words: 'auto list bench focus inbox review layout' },
    ] },
    { id: 'sidebar', label: 'Sidebar', icon: PanelLeft, blurb: 'How the sidebar looks and which sections it shows.', words: 'navigation nav menu left panel', settings: [
      { id: 'sidebar-view', label: 'Sidebar view', words: 'full compact icons only rail collapse density' },
      { id: 'sidebar-sections', label: 'Sidebar sections', words: 'show hide reorder order drag collections projects tags activity learn' },
    ] },
    { id: 'notifications', label: 'Notifications', icon: Bell, blurb: 'What shows under the bell, and when to remind you to back up.', words: 'bell alerts notify', settings: [
      { id: 'notify-review', label: 'Ready to review', words: 'inbox notification' },
      { id: 'notify-needs', label: 'Couldn’t be read', words: 'failed error notification' },
      { id: 'notify-brief', label: 'Board changed since its brief', words: 'board brief notification', feature: 'playground' },
      { id: 'notify-briefsaved', label: 'Board brief updated', words: 'board brief notification', feature: 'playground' },
      { id: 'notify-context', label: 'Saved items that fit a project', words: 'resurfacing suggestions notification', feature: 'organise' },
      { id: 'notify-whatsnew', label: 'What’s new', words: 'updates release notes changelog notification' },
      { id: 'backup-reminder', label: 'Backup reminder', words: 'remind backup days never' },
    ] },
    { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Command, blurb: 'Every shortcut, and the ones you can change.', words: 'keys hotkeys keybindings keyboard', settings: [
      { id: 'shortcut-change', label: 'Change a shortcut', words: 'rebind record keys' },
      { id: 'shortcut-reset', label: 'Reset all shortcuts', words: 'default keys' },
    ] },
  ] },
  { id: 'capture-import', label: 'Capture and import', icon: Upload, blurb: 'What Capsa reads when you save, and bringing things in.', words: 'add save bring in', without: { imports: { label: 'Capture', blurb: 'What Capsa reads when you save.', words: 'add save' } }, sections: [
    { id: 'capture', label: 'Capture', icon: Link2, blurb: 'What Capsa reads when you save a link, and the bookmarklet.', words: 'save links reading', without: { imports: { blurb: 'What Capsa reads when you save a link.' } }, settings: [
      { id: 'reading', label: 'Reading public GitHub links', words: 'github repository read privacy asks first' },
      { id: 'link-reading', label: 'Reading links, videos and posts', words: 'youtube video post article fetch' },
      { id: 'bookmarklet', label: 'Bookmarklet', words: 'browser bookmark bar save button extension', feature: 'imports' },
    ] },
    { id: 'import', label: 'Import', icon: Upload, blurb: 'Bring in bookmarks, GitHub stars, prompts and notes.', words: 'migrate move bring in', feature: 'imports', settings: [
      { id: 'import-bookmarks', label: 'Browser bookmarks', words: 'html chrome safari firefox' },
      { id: 'import-services', label: 'Raindrop, Instapaper or Pocket', words: 'csv read later' },
      { id: 'import-github', label: 'GitHub stars', words: 'starred repositories username' },
      { id: 'import-prompts', label: 'Prompts', words: 'csv json markdown folder' },
      { id: 'import-notes', label: 'Notes', words: 'obsidian markdown vault folder' },
      { id: 'h-imports', label: 'Imports', words: 'history undo remove batch' },
    ] },
  ] },
  { id: 'organising', label: 'Organising', icon: Folder, blurb: 'Collections, filing rules and how items show.', words: 'organize organise sort', without: { organise: { blurb: 'Collections and projects.' } }, sections: [
    { id: 'groups', label: 'Collections and projects', icon: Folder, blurb: 'Your collections, projects, smart collections and saved searches.', words: 'folders groups', without: { organise: { blurb: 'Your collections and projects.' } }, settings: [
      { id: 'collections', label: 'Collections', words: 'folder rename icon new' },
      { id: 'projects', label: 'Projects', words: 'rename icon new boards' },
      { id: 'smart', label: 'Smart collections', words: 'automatic rules filter', feature: 'organise' },
      { id: 'searches', label: 'Saved searches', words: 'search pin filter', feature: 'organise' },
    ] },
    { id: 'rules', label: 'Filing rules', icon: FolderPlus, blurb: 'Send new items to a collection or project on their own.', words: 'automation auto sort file', feature: 'organise', settings: [
      { id: 'h-new-rule', label: 'New rule', words: 'add rule filing' },
    ] },
    { id: 'views', label: 'Cards and views', icon: LayoutGrid, blurb: 'What Library cards show, and how each type opens.', words: 'layout display', feature: 'organise', settings: [
      { id: 'h-cards', label: 'On Library cards', words: 'fields card show hide' },
      { id: 'h-views', label: 'Opens in', words: 'cards list table view default' },
    ] },
  ] },
  { id: 'labels', label: 'Tags, types and domains', icon: Tag, blurb: 'The labels that sort your items.', words: 'labels categories', without: { organise: { label: 'Tags' } }, sections: [
    { id: 'tags', label: 'Tags', icon: Tag, blurb: 'Rename, pin or remove tags across every item.', words: 'labels hashtags pin', settings: [] },
    { id: 'types', label: 'Types', icon: Shapes, blurb: 'Your own types, each built on one Capsa has.', words: 'kinds custom fields', feature: 'organise', settings: [
      { id: 'h-new-type', label: 'New type', words: 'make custom type fields' },
    ] },
    { id: 'domains', label: 'Domains', icon: Layers, blurb: 'Rename or remove the areas your items belong to.', words: 'areas topics subject', feature: 'organise', settings: [] },
  ] },
  { id: 'boards-ai', label: 'Playground and AI', icon: Sparkles, blurb: 'Board briefs, and connecting your library to an AI.', words: 'playground boards easels ai', without: { playground: { label: 'AI', blurb: 'Connecting your library to an AI.', words: 'ai' } }, sections: [
    { id: 'briefs', label: 'Briefs', icon: FileText, blurb: 'What a new board’s brief includes, and its format.', words: 'brief board design export', feature: 'playground', settings: [
      { id: 'brief-regions', label: 'Marked regions', words: 'brief' },
      { id: 'brief-palettes', label: 'Palettes', words: 'colours colors brief' },
      { id: 'brief-avoid', label: 'Avoid list', words: 'brief' },
      { id: 'brief-credits', label: 'Credits section', words: 'attribution brief' },
      { id: 'brief-format', label: 'Brief format', words: 'prompt markdown zip bundle' },
    ] },
    { id: 'ai', label: 'MCP server and exports', icon: Sparkles, blurb: 'Connect your library to an AI through a local MCP server.', words: 'ai mcp claude chatgpt model assistant export', settings: [
      { id: 'ai-inside', label: 'AI inside Capsa', words: 'assistant model' },
      { id: 'mcp', label: 'Local MCP server', words: 'mcp server library file set up' },
    ] },
  ] },
  { id: 'data', label: 'Data', icon: HardDrive, blurb: 'Storage, backups, deleted items and starting over.', words: 'privacy storage', sections: [
    { id: 'storage', label: 'Storage and backup', icon: HardDrive, blurb: 'Space used on this device, backups and restore.', words: 'backup export download save space disk quota', settings: [
      { id: 'persist', label: 'On this device', words: 'space size quota keep persist browser' },
      { id: 'backup', label: 'Back up', words: 'backup export download zip' },
      { id: 'restore', label: 'Restore', words: 'import backup zip merge replace' },
    ] },
    { id: 'deleted', label: 'Deleted', icon: Trash2, blurb: 'Deleted items, and how long they are kept.', words: 'trash bin recycle', settings: [
      { id: 'keep-deleted', label: 'Keep deleted items', words: 'retention 30 days empty trash' },
    ] },
    { id: 'danger', label: 'Danger zone', icon: TriangleAlert, blurb: 'Remove the demo data, or start over.', words: 'reset wipe erase', settings: [
      { id: 'demo-data', label: 'Demo data', words: 'sample example remove' },
      { id: 'start-over', label: 'Start over', words: 'delete everything reset wipe erase' },
    ] },
  ] },
  { id: 'about', label: 'About', icon: Info, blurb: 'The version, installing the app and credits.', words: 'version', sections: [
    { id: 'about', label: 'About Capsa', icon: Info, blurb: 'The version, installing the app and credits.', words: 'version licence license credits fonts', settings: [
      { id: 'install', label: 'Install the app', words: 'pwa desktop home screen' },
    ] },
  ] },
];

/** A group's or section's words as they read in this build: with the `without` text of each feature it doesn't have. */
const worded = <T extends { without?: Without }>(x: T): T => Object.entries(x.without ?? {}).reduce((o, [f, w]) => (has(f as FeatureId) ? o : { ...o, ...w }), x);
/** The groups this build shows. */
export const SETTINGS_GROUPS: SettingsGroupDef[] = GROUPS
  .map(g => worded({ ...g, sections: g.sections.filter(available).map(x => worded({ ...x, settings: x.settings.filter(available) })) }))
  .filter(g => g.sections.length);

export type SettingsGroupId = string;
export const SETTINGS_SECTIONS: (SettingsSectionDef & { group: SettingsGroupDef })[] = SETTINGS_GROUPS.flatMap(g => g.sections.map(x => ({ ...x, group: g })));
export const groupOf = (id: string) => SETTINGS_GROUPS.find(g => g.id === id);
export const sectionOf = (id: string) => SETTINGS_SECTIONS.find(x => x.id === id);
export const isSettingsGroup = (s: string) => SETTINGS_GROUPS.some(g => g.id === s);

/** Where Settings opens: Profile, from every way in (the sidebar's gear, the command menu, the breadcrumb, bare /settings).
 * Elvis, 27 Oct: "Profile should be the first thing it takes you to when you go to settings." General in a build without it. */
export const SETTINGS_HOME = has('avatar') ? '/settings/profile' : '/settings/general';

/** Old one-page anchors (/settings#backup and so on) and the section each now lives in. */
export const LEGACY_ANCHORS: Record<string, string> = {
  profile: 'profile', avatar: 'profile', appearance: 'appearance', theme: 'appearance', notifications: 'notifications', shortcuts: 'shortcuts', keys: 'shortcuts', sidebar: 'sidebar',
  reading: 'capture', capture: 'capture', import: 'import', imports: 'import', bookmarklet: 'capture', groups: 'groups', collections: 'groups', projects: 'groups', tags: 'tags', deleted: 'deleted',
  briefs: 'briefs', types: 'types', domains: 'domains', rules: 'rules', filing: 'rules', views: 'views', cards: 'views', smart: 'groups', searches: 'groups', ai: 'ai', storage: 'storage', backup: 'storage', restore: 'storage', danger: 'danger', demo: 'danger', reset: 'danger', about: 'about',
};

/** Where an old address goes: /settings/<section> (and /settings#<anchor>) land on the group, at that section, or at
 * the more exact anchor when the old link had one (/settings/storage#backup → /settings/data#backup). */
export function settingsHref(sectionOrAnchor: string, anchor?: string): string {
  const sec = sectionOf(sectionOrAnchor) ?? sectionOf(LEGACY_ANCHORS[sectionOrAnchor] ?? '');
  if (!sec) return SETTINGS_HOME;
  const at = anchor || sectionOrAnchor;
  return `/settings/${sec.group.id}#${at}`;
}

/** Where "Back to app" goes: the last page outside Settings (AppShell records it), else the Library. */
export const BACK_KEY = 'capsa-back-to-app';
