/* Library look (approved mockup design-references/mockups/library.html): type colours and plural names,
 * compact evidence labels, "Saved 8 days ago", group colours, and the parsers behind the card previews.
 * Pure functions only. Everything shown is derived from real record fields; nothing is made up. */
import { ArrowDownAZ, BadgeCheck, CircleDashed, Clock, History, Pencil, Quote, Sparkles, type LucideIcon } from '@/components/ui/icons';
import { evidenceLabel } from '@/lib/format';
import type { Artifact, ArtifactType, Evidence, Source } from '@/lib/types';
import { isEdited, placeholders, reuseText, type Sort } from './lib';

/** Display order for the type menu and the grouped list (the mockup's order). */
export const DISPLAY_ORDER: ArtifactType[] = [
  'prompt', 'skill', 'mcp_server', 'technique', 'workflow', 'template', 'tool', 'app_tool', 'command', 'command_config', 'reference',
];

export const TYPE_MANY: Record<ArtifactType, string> = {
  prompt: 'Prompts', skill: 'Skills', mcp_server: 'MCP servers', tool: 'Tools', app_tool: 'Apps and tools', technique: 'Techniques',
  command: 'Commands', command_config: 'Commands and configs', template: 'Templates', reference: 'References', workflow: 'Workflows',
};

/** Groups in the list view, as in the mockup: related small types share a group. */
export const LIST_GROUPS: { key: string; types: ArtifactType[]; dot: ArtifactType; both?: string }[] = [
  { key: 'prompt', types: ['prompt'], dot: 'prompt' },
  { key: 'mcp', types: ['mcp_server'], dot: 'mcp_server' },
  { key: 'skill', types: ['skill'], dot: 'skill' },
  { key: 'technique', types: ['technique'], dot: 'technique' },
  { key: 'workflow', types: ['workflow', 'template'], dot: 'workflow', both: 'Workflows and templates' },
  { key: 'tool', types: ['tool', 'app_tool'], dot: 'tool', both: 'Tools and apps' },
  { key: 'command', types: ['command', 'command_config'], dot: 'command', both: 'Commands and configs' },
  { key: 'reference', types: ['reference'], dot: 'reference' },
];
/** "Workflows and templates" when both are present, otherwise the one type's plural. */
export const groupName = (g: (typeof LIST_GROUPS)[number], present: ArtifactType[]) =>
  present.length > 1 && g.both ? g.both : TYPE_MANY[present[0]];

/** Which preview a card shows. */
export type PreviewKind = 'paper' | 'code' | 'quote' | 'steps' | 'template';
const PREVIEW: Record<ArtifactType, PreviewKind> = {
  prompt: 'paper', reference: 'paper', template: 'template', workflow: 'steps',
  skill: 'code', mcp_server: 'code', command: 'code', command_config: 'code',
  technique: 'quote', tool: 'quote', app_tool: 'quote',
};

/** Tint key used by the CSS (`data-tint`). Prompts in your own words get the pink paper, as in the mockup. */
export function tintOf(a: Artifact): string {
  if (a.type === 'prompt' && (isEdited(a) || a.evidence?.method === 'user_supplied')) return 'yours';
  if (a.type === 'app_tool') return 'tool';
  if (a.type === 'command_config') return 'command';
  return a.type;
}

/* ---------- evidence, compact (method first; the full label goes in title and screen-reader text) ---------- */
export const EV_ICON: Record<Evidence['method'] | 'none', LucideIcon> = {
  text_span: Quote, creator_metadata: BadgeCheck, ai_located: Sparkles, user_supplied: Pencil, none: CircleDashed,
};
/** Short evidence label. `compact` for tight table columns; `brief` drops the moment (cards: the full label is the tooltip). */
export function evShort(e: Evidence | undefined, compact = false, brief = false): string {
  if (!e) return 'Not recorded';
  const t = brief ? '' : e.t;
  switch (e.method) {
    case 'text_span': return 'Quoted';
    case 'creator_metadata': return `${compact ? 'Creator' : 'Said by the creator'}${t ? ' ' + t : ''}`;
    case 'ai_located': return compact ? `AI${t ? ' · ' + t : ''}` : `Found by AI${t ? ' ' + t : ''}`;
    case 'user_supplied': return 'You added';
  }
}
export const evFull = (e?: Evidence) => evidenceLabel(e);

/** The sort menu's glyphs (design review, 25 Oct): last saved, recently used, title A–Z. */
export const SORT_ICON: Record<Sort, LucideIcon> = { recent: Clock, used: History, az: ArrowDownAZ };

/* ---------- dates ---------- */
const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** "today", "yesterday", "8 days ago"; older than 60 days falls back to the date. */
export function savedAgo(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((dayStart(now) - dayStart(d)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 60) return `${days} days ago`;
  return `on ${shortDate(iso, d.getFullYear() !== now.getFullYear())}`;
}
export const shortDate = (iso: string, withYear = false) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Where it came from, for the card meta line ("x.com", "pasted by you"). */
export function originLabel(src?: Source): string {
  if (!src) return 'unknown source';
  if (src.kind === 'manual') return /^pasted/i.test(src.displayUrl ?? '') ? 'pasted by you' : 'added by you';
  if (src.url) { try { return new URL(src.url).hostname.replace(/^www\./, ''); } catch { /* fall through */ } }
  return src.displayUrl ?? 'unknown source';
}

/* ---------- group colours (collections and projects have no colour field, so it follows their order) ---------- */
// Dark enough for white initials to pass WCAG AA at 10 px.
const COLLECTION_COLOURS = ['#15803d', '#2563eb', '#7c3aed', '#b45309', '#be185d', '#0f766e', '#0369a1', '#c2410c'];
// Project colours are drawn as a dot, a chip's dot and a folder glyph on every surface (27 Oct, #85). The first is the
// page's ink: it was #1f1f23, near black in every theme, so it vanished on dark surfaces; now it is black in light and
// near white in dark, never the mid grey of a neutral glyph. The rest sit at a relative luminance near 0.20: at least 3.39:1
// against every surface, pill and hover fill in Classic and Paper, light and dark (WCAG 1.4.11). Colours follow a project's
// order, not a stored value, so existing projects take the new ones as they are.
const PROJECT_COLOURS = ['var(--ink)', '#e3307d', '#9257ff', '#008b7f', '#c16200', '#3373fc', '#db4a00', '#009037'];
export const collectionColour = (i: number) => COLLECTION_COLOURS[(i < 0 ? 0 : i) % COLLECTION_COLOURS.length];
export const projectColour = (i: number) => PROJECT_COLOURS[(i < 0 ? 0 : i) % PROJECT_COLOURS.length];
export const initial = (name: string) => (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? '·').toUpperCase();

/* ---------- preview content ---------- */
export interface PreviewData {
  kind: PreviewKind;
  head?: string;          // paper / template header: "Your version", "6 blanks"
  text?: string;          // paper / quote / code body
  isQuote?: boolean;      // quote preview: verbatim (shows the quote mark) or a summary (no mark)
  comment?: string;       // code preview: first comment line
  steps?: string[];       // workflow
  blanks?: number;        // template
}

/** Numbered steps from "1. Do this. 2. Then that." or one step per line. Fewer than two means "not steps". */
export function parseSteps(text: string): string[] {
  const inline = text.split(/(?:^|\s)\d{1,2}[.)]\s+/).map(x => x.trim()).filter(Boolean);
  if (inline.length >= 2) return inline;
  const lines = text.split('\n').map(l => l.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, '').trim()).filter(Boolean);
  return lines.length >= 2 ? lines : [];
}

/** Verbatim quote without a leading chapter timestamp that repeats the evidence moment ("12:30 Make it…"). */
function cleanQuote(e?: Evidence): string | undefined {
  const q = e?.quote?.trim();
  if (!q) return undefined;
  return e?.t && q.startsWith(e.t + ' ') ? q.slice(e.t.length + 1) : q;
}

export function previewOf(a: Artifact): PreviewData {
  const text = reuseText(a) ?? undefined;
  const kind = PREVIEW[a.type];
  const quote = cleanQuote(a.evidence);
  if (kind === 'template' && text) {
    const n = placeholders(text).length; // the type is on the card's pill; the head says only what the pill can't
    return { kind, head: `${n || 'No'} ${n === 1 ? 'blank' : 'blanks'}`, text, blanks: n };
  }
  if (kind === 'steps' && text) {
    const steps = parseSteps(text);
    if (steps.length) return { kind, steps };
  }
  if (kind === 'code') {
    const file = a.evidence?.locator?.split(',')[0]?.trim();
    if (text) return { kind, text, comment: file && /\.\w{1,6}$/.test(file) ? file : undefined };
    return { kind, comment: '# no config captured · from the source', text: quote ? `“${quote}”` : a.purpose, isQuote: !!quote };
  }
  if (kind === 'quote' || !text) {
    if (text) return { kind: 'quote', text, isQuote: true };
    if (quote) return { kind: 'quote', text: quote, isQuote: true };
    return { kind: 'quote', text: a.purpose ?? a.title, isQuote: false };
  }
  // The type is on the pill and "Quoted" on the evidence label; the head marks only your own version.
  return { kind: 'paper', head: isEdited(a) ? 'Your version' : undefined, text };
}

/** Light syntax colouring for config-like text: comments, YAML keys, JSON keys and strings. */
export type CodeTok = { t: string; c?: 'k' | 's' | 'c' };
export function tokenizeCode(src: string): CodeTok[][] {
  return src.split('\n').map(line => {
    if (/^\s*(#|\/\/)/.test(line)) return [{ t: line, c: 'c' }];
    const yaml = line.match(/^(\s*[\w.-]+)(:)(\s.*)?$/);
    if (yaml && !line.includes('"')) return [{ t: yaml[1], c: 'k' }, { t: ':' }, ...(yaml[3] ? [{ t: yaml[3], c: 's' as const }] : [])];
    const out: CodeTok[] = [];
    let last = 0;
    for (const m of line.matchAll(/"(?:[^"\\]|\\.)*"(\s*:)?/g)) {
      if (m.index! > last) out.push({ t: line.slice(last, m.index) });
      out.push({ t: m[0], c: m[1] ? 'k' : 's' });
      last = m.index! + m[0].length;
    }
    if (last < line.length) out.push({ t: line.slice(last) });
    return out;
  });
}
