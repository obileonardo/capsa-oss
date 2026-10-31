/* Your AI as an area (design review 25 Oct, item 4), like Settings and Help: each page at /ai/<id>, with its own sidebar
 * under "Back to app": Overview, one page per AI added to this library, then the local MCP server and Files for agents. */
import { FileCode2, LayoutGrid, Plug } from '@/components/ui/icons';
import { isAiId } from '@/lib/ais';

export const AI_PAGES = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'mcp', label: 'Local MCP server', icon: Plug },
  { id: 'files', label: 'Files for agents', icon: FileCode2 },
] as const;
export type AiPageId = (typeof AI_PAGES)[number]['id'];
export const isAiPage = (s: string): s is AiPageId => AI_PAGES.some(p => p.id === s);
/** A page of the area: a fixed page or an AI's own page. */
export const isAiSection = (s: string) => isAiPage(s) || isAiId(s);

/** Old one-page anchors (/ai#mcp, /ai#files) and the page each now lives on. */
export function aiSectionFor(hash: string): string {
  const h = hash.replace(/^#/, '');
  if (h === 'mcp' || h === 'ai-mcp') return 'mcp';
  if (h === 'files' || h === 'ai-files') return 'files';
  return isAiSection(h) ? h : 'overview';
}
