/* Help sections (Elvis, 25 Oct: "the same way we did the settings"). Each is its own page at /help/<id>; on help pages
 * the sidebar shows these under "Back to app", grouped under quiet headings, instead of the app's navigation. */
import { BookOpen, Command, Download, HardDrive, Plug, Sparkles } from '@/components/ui/icons';

export const HELP_GROUPS = [
  { label: 'Using Capsa', sections: [
    { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Command },
    { id: 'glossary', label: 'Glossary', icon: BookOpen },
  ] },
  { label: 'Your data', sections: [
    { id: 'device', label: 'On this device', icon: HardDrive },
    { id: 'backup', label: 'Backup and restore', icon: Download },
  ] },
  { label: 'Updates', sections: [
    { id: 'whats-new', label: 'What’s new', icon: Sparkles },
    { id: 'not-connected', label: 'Not connected yet', icon: Plug },
  ] },
] as const;

type Group = (typeof HELP_GROUPS)[number];
export const HELP_SECTIONS: Group['sections'][number][] = HELP_GROUPS.flatMap((g: Group) => [...g.sections]);
export type HelpSection = (typeof HELP_SECTIONS)[number]['id'];
export const isHelpSection = (s: string): s is HelpSection => HELP_SECTIONS.some(x => x.id === s);

/** Old one-page anchors (/help#whats-new, /help#g-mcp…) and the page each now lives on. */
export function helpSectionFor(hash: string): HelpSection {
  if (hash.startsWith('g-')) return 'glossary';
  const old: Record<string, HelpSection> = { keys: 'shortcuts', device: 'device', 'backing-up': 'backup', backup: 'backup' };
  return old[hash] ?? (isHelpSection(hash) ? hash : 'shortcuts');
}
