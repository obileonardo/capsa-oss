/* Search everything (build-out Stage 5): one ranked search across items, evidence quotes, sources, tags, collections,
 * projects, boards and board references (boards only where the Playground is, lib/features.ts). Pure functions, so the
 * checks can run it in Node.
 * Every word must match somewhere in the same record (AND); the field that matched is reported, so results can say
 * why they're there ("in the evidence quote", "in a region note"). Nothing is sent anywhere. */
import { has } from './features';
import type { AppState } from './types';

export type ResultKind = 'item' | 'quote' | 'source' | 'tag' | 'collection' | 'project' | 'board' | 'reference';
export interface Hit {
  kind: ResultKind;
  id: string;
  title: string;
  /** What matched, in words: "title", "exact text", "evidence quote", "region note"… */
  field: string;
  /** A short window of the matching text (for anything but the title). */
  snippet?: string;
  href: string;
  /** Extra label shown in the type column ("Prompt", "Video", "Board"…). */
  label?: string;
  score: number;
}

export const terms = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

/** A window of `text` around the first term. */
export function snippetOf(text: string, ts: string[], radius = 48): string {
  const lower = text.toLowerCase();
  const at = Math.min(...ts.map(t => lower.indexOf(t)).filter(i => i >= 0));
  if (!isFinite(at)) return text.slice(0, radius * 2);
  const a = Math.max(0, at - radius), b = Math.min(text.length, at + radius);
  return `${a > 0 ? '…' : ''}${text.slice(a, b).replace(/\s+/g, ' ').trim()}${b < text.length ? '…' : ''}`;
}

/* ---------- the index: lowercased once per library state, not on every keystroke ---------- */
// A record is its title plus named fields, each kept with a lowercased copy. Built when the store changes (the state
// object is immutable, so its identity is the cache key) and reused for every keystroke until then.
interface Rec { title: string; tl: string; words: string[]; fields: [name: string, text: string, lower: string][] }
type Base = Omit<Hit, 'score' | 'field' | 'snippet'>;
interface Quote { lower: string; text: string; hit: Omit<Hit, 'snippet'> }
// Kept in the original order (each record followed by its quotes), so ties sort exactly as before.
interface Index { parts: unknown[]; entries: ({ base: Base; rec: Rec } | { quote: Quote })[] }

const rec = (title: string, fields: [string, string | undefined | null][]): Rec => {
  const tl = title.toLowerCase();
  return { title, tl, words: tl.split(/[^a-z0-9]+/), fields: fields.filter((f): f is [string, string] => !!f[1]).map(([n, x]) => [n, x, x.toLowerCase()]) };
};

/** Scores a record: every term must appear in some field. Title hits rank highest; returns the best non-title field. */
function scoreRecord(ts: string[], r: Rec): { score: number; field: string; snippet?: string } | null {
  let score = 0;
  let best: [string, string, string] | null = null;
  for (const term of ts) {
    if (r.tl.includes(term)) { score += r.tl.startsWith(term) ? 6 : r.words.includes(term) ? 5 : 4; continue; }
    let f: [string, string, string] | undefined;
    for (const x of r.fields) if (x[2].includes(term)) { f = x; break; }
    if (!f) return null;
    score += 1; if (!best) best = f;
  }
  return best ? { score, field: best[0], snippet: snippetOf(best[1], ts) } : { score: score + 1, field: 'title' };
}

const TYPE_NAME: Record<string, string> = {
  prompt: 'Prompt', skill: 'Skill', mcp_server: 'MCP server', tool: 'Tool', app_tool: 'App or tool', technique: 'Technique', command: 'Command',
  command_config: 'Command / config', template: 'Template', reference: 'Reference', workflow: 'Workflow',
};
const KIND_NAME: Record<string, string> = { video: 'Video', github: 'GitHub', article: 'Article', x: 'Post on X', manual: 'Note' };

let cache: Index | null = null;
const partsOf = (s: AppState) => [s.artifacts, s.sources, s.collections, s.projects, s.boards, s.references];

/** The search index for this library state; rebuilt only when one of its lists changes. */
export function searchIndex(s: AppState): Index {
  const parts = partsOf(s);
  if (cache && cache.parts.every((p, i) => p === parts[i])) return cache;
  const entries: Index['entries'] = [];
  for (const a of s.artifacts) {
    entries.push({ base: { kind: 'item', id: a.id, title: a.title, href: `/library/${a.id}`, label: TYPE_NAME[a.type] }, rec: rec(a.title, [
      ['your version', a.yours], ['exact text', a.exact], ['summary', a.purpose], ['tags', (a.tags ?? []).join(' ')], ['domains', (a.domains ?? []).join(' ')],
    ]) });
    // Evidence quotes are their own results, so a remembered phrase finds where it was said.
    const quote = a.evidence?.quote;
    if (quote) entries.push({ quote: { lower: quote.toLowerCase(), text: quote, hit: { kind: 'quote', id: `q-${a.id}`, title: a.title, field: 'evidence quote', href: `/library/${a.id}`, label: TYPE_NAME[a.type], score: 3 } } });
  }
  for (const x of s.sources) {
    const segText = ((x.segments ?? []) as { text?: string }[]).map(g => (g && typeof g.text === 'string' ? g.text : '')).join('\n');
    entries.push({ base: { kind: 'source', id: x.id, title: x.title, href: `/inbox/${x.id}`, label: KIND_NAME[x.kind] }, rec: rec(x.title, [
      ['author', x.author], ['address', x.url ?? x.displayUrl], ['your note', x.description], ['stored text', segText || x.minimalQuote], ['pasted text', x.pastedText],
    ]) });
    for (const c of x.candidates ?? []) {
      const quote = c.evidence?.quote;
      if (!quote || (x.keptIds ?? []).includes(c.id)) continue; // kept ones are found through the Library item
      entries.push({ quote: { lower: quote.toLowerCase(), text: quote, hit: { kind: 'quote', id: `q-${x.id}-${c.id}`, title: c.title, field: `evidence quote · in “${x.title}”`, href: `/inbox/${x.id}`, label: 'Candidate', score: 2 } } });
    }
  }
  const tagSeen = new Map<string, number>();
  for (const a of s.artifacts) for (const t of a.tags ?? []) tagSeen.set(t, (tagSeen.get(t) ?? 0) + 1);
  for (const [t, n] of tagSeen) entries.push({ base: { kind: 'tag', id: `t-${t}`, title: t, href: `/library?tag=${encodeURIComponent(t)}`, label: `${n} ${n === 1 ? 'item' : 'items'}` }, rec: rec(t, []) });
  for (const c of s.collections) entries.push({ base: { kind: 'collection', id: c.id, title: c.name, href: `/collections/${c.id}`, label: 'Collection' }, rec: rec(c.name, []) });
  for (const p of s.projects) entries.push({ base: { kind: 'project', id: p.id, title: p.name, href: `/projects/${p.id}`, label: 'Project' }, rec: rec(p.name, [['note', p.note]]) });
  for (const b of has('playground') ? s.boards : []) {
    entries.push({ base: { kind: 'board', id: b.id, title: b.title, href: `/boards/${b.id}`, label: 'Board' }, rec: rec(b.title, [
      ['board note', b.note], ['section', b.sections.map(x => `${x.title} ${x.note}`).join(' ')],
    ]) });
  }
  for (const r of has('playground') ? s.references : []) {
    const board = s.boards.find(b => b.id === r.boardId);
    entries.push({ base: { kind: 'reference', id: r.id, title: r.title || r.creator || 'Untitled reference', href: `/boards/${r.boardId}?ref=${encodeURIComponent(r.id)}`, label: board ? `On “${board.title}”` : 'Reference' },
      rec: rec(r.title || '', [
        ['your note', r.note], ['creator', r.creator], ['address', r.sourceUrl || r.linkUrl], ['region note', r.regions.map(g => g.note).join(' ')],
        ['timed note', (r.notes ?? []).map(n => n.text).join(' ')], ['what you like', r.likes.join(' ')],
      ]) });
  }
  cache = { parts, entries };
  return cache;
}

export function searchAll(s: AppState, q: string, limit = 40): Hit[] {
  const ts = terms(q);
  if (!ts.length) return [];
  const ix = searchIndex(s);
  const out: Hit[] = [];
  for (const e of ix.entries) {
    if ('quote' in e) { if (ts.every(t => e.quote.lower.includes(t))) out.push({ ...e.quote.hit, snippet: snippetOf(e.quote.text, ts, 60) }); }
    else { const m = scoreRecord(ts, e.rec); if (m) out.push({ ...e.base, ...m }); }
  }
  return out.sort((x, y) => y.score - x.score || x.title.localeCompare(y.title)).slice(0, limit);
}
