/* Track B, organise and search (25 Oct): pure functions over the app state. Nothing here writes, fetches or guesses;
 * every count and suggestion comes from fields already on the records. The actions that change records are in
 * organiseStore.ts. Kept free of the store so the store (filing rules on capture) and notifications can use it. */
import type {
  AppState, Artifact, ArtifactType, CardField, CustomType, EvidenceMethod, FilingRule, LinkRel, Organise, SmartRules, Source, SourceKind, TriedStatus,
} from './types';
import { TYPE_LABEL } from './format';

export const DAY = 86_400_000;
export const org = (s: AppState): Organise => s.organise ?? {};
const lc = (t: string) => t.toLowerCase();

/* ---------- labels ---------- */
export const TRIED_LABEL: Record<TriedStatus | 'untried', string> = { untried: 'Not tried', tried: 'Tried', worked: 'Worked', didnt: 'Didn’t work' };
export const TRIED_ORDER: (TriedStatus | 'untried')[] = ['untried', 'tried', 'worked', 'didnt'];
export const triedOf = (a: Artifact): TriedStatus | 'untried' => a.tried?.status ?? 'untried';

export const LINK_OUT: Record<LinkRel, string> = { requires: 'Requires', replaces: 'Replaces', alternative: 'Alternative to' };
export const LINK_IN: Record<LinkRel, string> = { requires: 'Required by', replaces: 'Replaced by', alternative: 'Alternative to' };

export const CARD_FIELDS: { k: CardField; label: string }[] = [
  { k: 'meta', label: 'Saved and source' }, { k: 'type', label: 'Type' }, { k: 'evidence', label: 'Where from' },
  { k: 'collections', label: 'Collections' }, { k: 'tags', label: 'Tags' }, { k: 'tried', label: 'Tried' }, { k: 'note', label: 'Your note' },
];
export const DEFAULT_CARD_FIELDS: CardField[] = ['meta', 'type', 'evidence', 'collections'];
export const cardFields = (s: AppState): CardField[] => s.prefs.cardFields ?? DEFAULT_CARD_FIELDS;

export const KIND_PHRASE: Record<SourceKind, string> = { video: 'from videos', github: 'from GitHub', article: 'from articles', x: 'from posts on X', manual: 'added by you' };
export const METHOD_PHRASE: Record<EvidenceMethod, string> = { text_span: 'quoted', creator_metadata: 'said by the creator', ai_located: 'found by AI', user_supplied: 'written by you' };
export const SMART_DAYS = [7, 30, 90, 365] as const;

/* ---------- words ---------- */
const STOP = new Set(('the and for with you your are use using how what when into about can will not all any this that from was were has have had '
  + 'its our out one two get got let set new more most than then them they their there here just only also very via per off like make makes').split(' '));
/** Lower-case words of three letters or more, without the commonest English ones. */
export function words(t: string): string[] {
  return (lc(t).match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).filter(w => w.length > 2 && !STOP.has(w));
}
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) n++;
  return n / (a.size + b.size - n);
};
const normText = (t: string) => lc(t).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function shingles(t: string): Set<string> {
  const w = t.split(' ').slice(0, 400);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}
const VERSION = /\bv?\d+(?:\.\d+)+\b|\bv\d+\b/gi;
/** Version numbers in a title ("v1.2", "2.0"), for warnings: two versions of a thing are never quietly the same. */
const versionsOf = (t: string) => [...new Set((t.match(VERSION) ?? []).map(v => lc(v).replace(/^v/, '')))].sort().join(',');

/* ---------- sources: site and creator ---------- */
const urlKey = (u: string) => lc(u.trim()).replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[#].*$/, '');
export function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}
/** The site a source came from: its host, or "you" for text you pasted or wrote. */
export function siteOf(src: Source): { key: string; label: string } {
  const h = hostOf(src.url);
  if (h) return { key: `site:${h}`, label: h };
  if (src.kind === 'manual') return { key: 'site:you', label: 'Added by you' };
  return { key: 'site:unknown', label: 'Site not known' };
}
export function creatorOf(src: Source): { key: string; label: string } {
  const a = (src.author ?? '').trim();
  if (src.kind === 'manual' && (!a || a === 'You')) return { key: 'creator:you', label: 'You' };
  if (!a || a === '—' || /^unknown$/i.test(a)) return { key: 'creator:unknown', label: 'Creator not known' };
  return { key: `creator:${lc(a)}`, label: a };
}
/** Library filter by source group (?src=site:github.com, creator:…, or source:<id>): the source ids it covers. */
export function sourcesFor(s: AppState, key: string): Set<string> {
  if (key.startsWith('source:')) return new Set([key.slice(7)]);
  const by = key.startsWith('creator:') ? creatorOf : siteOf;
  return new Set(s.sources.filter(x => by(x).key === key).map(x => x.id));
}
export function sourceKeyLabel(s: AppState, key: string): string {
  if (key.startsWith('source:')) return `From “${s.sources.find(x => x.id === key.slice(7))?.title ?? 'a source'}”`;
  const src = s.sources.find(x => (key.startsWith('creator:') ? creatorOf(x) : siteOf(x)).key === key);
  const label = src ? (key.startsWith('creator:') ? creatorOf(src) : siteOf(src)).label : key.replace(/^\w+:/, '');
  return key.startsWith('creator:') ? `By ${label}` : label === 'Added by you' ? label : `From ${label}`;
}

export interface SourceRow { src: Source; items: Artifact[] }
export interface SourceGroup { key: string; label: string; rows: SourceRow[]; items: number }
/** CUR-11 / DSC-08: every source in the library (including ones with nothing to unpack), grouped by site or creator. */
export function sourceGroups(s: AppState, by: 'site' | 'creator'): SourceGroup[] {
  const itemsOf = new Map<string, Artifact[]>();
  for (const a of s.artifacts) if (a.sourceId) { const xs = itemsOf.get(a.sourceId); if (xs) xs.push(a); else itemsOf.set(a.sourceId, [a]); }
  const groups = new Map<string, SourceGroup>();
  for (const src of s.sources) {
    const g = (by === 'site' ? siteOf : creatorOf)(src);
    const items = itemsOf.get(src.id) ?? [];
    const cur = groups.get(g.key) ?? { key: g.key, label: g.label, rows: [], items: 0 };
    cur.rows.push({ src, items });
    cur.items += items.length;
    groups.set(g.key, cur);
  }
  for (const g of groups.values()) g.rows.sort((x, y) => y.items.length - x.items.length || +new Date(y.src.savedAt) - +new Date(x.src.savedAt));
  const last = (k: string) => (/:(you|unknown)$/.test(k) ? 1 : 0);
  return [...groups.values()].sort((x, y) => last(x.key) - last(y.key) || y.items - x.items || y.rows.length - x.rows.length || x.label.localeCompare(y.label));
}

/* ---------- smart collections (CUR-01) ---------- */
export function smartMatch(a: Artifact, r: SmartRules, src: Source | undefined, now: number): boolean {
  if (r.type && a.type !== r.type) return false;
  if (r.tag && !(a.tags ?? []).some(t => lc(t) === lc(r.tag!))) return false;
  if (r.sourceKind && src?.kind !== r.sourceKind) return false;
  if (r.method && a.evidence?.method !== r.method) return false;
  if (r.bookmarked !== undefined && !!a.starred !== r.bookmarked) return false;
  if (r.tried && triedOf(a) !== r.tried) return false;
  if (r.days && now - +new Date(a.savedAt) > r.days * DAY) return false;
  if (r.text?.trim()) {
    const hay = lc(`${a.title}\n${a.purpose ?? ''}\n${a.exact ?? ''}\n${a.yours ?? ''}\n${a.note ?? ''}`);
    if (!lc(r.text).split(/\s+/).filter(Boolean).every(t => hay.includes(t))) return false;
  }
  return true;
}
export function smartItems(s: AppState, r: SmartRules, now = Date.now()): Artifact[] {
  const src = new Map(s.sources.map(x => [x.id, x]));
  return s.artifacts.filter(a => smartMatch(a, r, src.get(a.sourceId ?? ''), now)).sort((x, y) => +new Date(y.savedAt) - +new Date(x.savedAt));
}
/** "Prompts · tagged “design” · bookmarked · saved in the last 30 days". */
export function smartSummary(r: SmartRules, typeMany: Record<ArtifactType, string>): string[] {
  const out: string[] = [];
  if (r.type) out.push(typeMany[r.type]);
  if (r.tag) out.push(`tagged “${r.tag}”`);
  if (r.sourceKind) out.push(KIND_PHRASE[r.sourceKind]);
  if (r.method) out.push(METHOD_PHRASE[r.method]);
  if (r.bookmarked !== undefined) out.push(r.bookmarked ? 'bookmarked' : 'not bookmarked');
  if (r.tried) out.push(lc(TRIED_LABEL[r.tried]));
  if (r.days) out.push(r.days === 365 ? 'saved this past year' : `saved in the last ${r.days} days`);
  if (r.text?.trim()) out.push(`with “${r.text.trim()}”`);
  if (!out.length) out.push('Everything');
  return out.map((x, i) => (i ? x : x[0].toUpperCase() + x.slice(1)));
}

/* ---------- auto-filing rules (CUR-08) ---------- */
export const RULE_WHEN: Record<FilingRule['when'], string> = { site: 'From', creator: 'By', type: 'Type is', words: 'Has the words' };
export function ruleMatches(r: FilingRule, a: Artifact, src?: Source): boolean {
  const v = r.value.trim();
  if (!v) return false;
  if (r.when === 'type') return a.type === v;
  if (r.when === 'creator') return !!src?.author && lc(src.author).includes(lc(v));
  if (r.when === 'words') {
    const hay = lc(`${a.title}\n${a.purpose ?? ''}\n${a.exact ?? ''}`);
    return lc(v).split(/\s+/).filter(Boolean).every(t => hay.includes(t));
  }
  if (!src?.url) return false;
  const k = urlKey(src.url), p = urlKey(v).replace(/\/+$/, '');
  return k === p || k.startsWith(p + '/') || k.startsWith(p + '?') || (!p.includes('/') && k.split(/[/?]/)[0].endsWith('.' + p));
}
export function ruleLabel(r: FilingRule, s: AppState, typeLabel?: Record<ArtifactType, string>): string {
  const g = (s[r.to.field] as { id: string; name: string }[]).find(x => x.id === r.to.id);
  const what = r.when === 'type' ? (typeLabel?.[r.value as ArtifactType] ?? r.value) : r.when === 'words' ? `“${r.value}”` : r.value;
  return `${RULE_WHEN[r.when]} ${what} → ${g?.name ?? 'a deleted ' + (r.to.field === 'collections' ? 'collection' : 'project')}`;
}
/** Files a newly kept item by every rule that matches it. Additive only: a rule never takes an item out of anything. */
export function fileByRules(s: AppState, src: Source | undefined, a: Artifact): Artifact {
  const rules = org(s).rules ?? [];
  let out = a;
  for (const r of rules) {
    const g = (s[r.to.field] as { id: string; name: string }[]).find(x => x.id === r.to.id);
    if (!g || (out[r.to.field] ?? []).includes(g.id) || !ruleMatches(r, out, src)) continue;
    const at = new Date().toISOString();
    const label = ruleLabel(r, s);
    out = {
      ...out, [r.to.field]: [...(out[r.to.field] ?? []), g.id],
      filedBy: [...(out.filedBy ?? []), { ruleId: r.id, label, at }],
      history: [...(out.history ?? []), { when: at, what: `Filed into ${r.to.field === 'collections' ? 'collection' : 'project'} “${g.name}” by a rule (${label})` }],
    };
  }
  return out;
}

/* ---------- near-duplicates (ORG-04, MNT-06) ---------- */
export interface DupePair { key: string; a: Artifact; b: Artifact; why: string; versions: boolean }
export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
/** Suggestions only: the same text, nearly the same text, or a near-identical title for the same type. Pairs you said
 * aren't duplicates stay hidden. Items whose titles carry different version numbers are flagged, never treated as one. */
export function findDuplicates(s: AppState): DupePair[] {
  const dismissed = new Set(org(s).notDupes ?? []);
  const src = new Map(s.sources.map(x => [x.id, x]));
  const prep = s.artifacts.map(a => {
    const text = normText(a.yours ?? a.exact ?? '');
    return { a, text, title: new Set(words(a.title)), sh: text.length >= 60 ? shingles(text) : null, url: src.get(a.sourceId ?? '')?.url ?? null, ver: versionsOf(a.title) };
  });
  const out: DupePair[] = [];
  // Items that are all copies of one another form a group; each joins it once (with the first one found), so a library
  // with many copies of one text gets one suggestion per copy, not one per pair of copies.
  const parent = prep.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const add = (i: number, j: number, why: string) => {
    const key = pairKey(prep[i].a.id, prep[j].a.id);
    if (dismissed.has(key) || root(i) === root(j)) return;
    parent[root(j)] = root(i);
    out.push({ key, a: prep[i].a, b: prep[j].a, why, versions: prep[i].ver !== prep[j].ver });
  };
  const byText = new Map<string, number[]>();
  prep.forEach((p, i) => { if (p.text.length >= 20) { const xs = byText.get(p.text); if (xs) xs.push(i); else byText.set(p.text, [i]); } });
  for (const xs of byText.values()) for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) add(xs[i], xs[j], 'Same text');
  const byType = new Map<string, number[]>();
  prep.forEach((p, i) => { const xs = byType.get(p.a.type); if (xs) xs.push(i); else byType.set(p.a.type, [i]); });
  for (const xs of byType.values()) {
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
      const p = prep[xs[i]], q = prep[xs[j]];
      if (root(xs[i]) === root(xs[j])) continue;
      const t = jaccard(p.title, q.title);
      if (p.title.size >= 2 && t >= 0.75) { add(xs[i], xs[j], p.url && p.url === q.url ? 'Same source, similar title' : 'Similar title'); continue; }
      if (p.sh && q.sh) {
        const ratio = Math.min(p.sh.size, q.sh.size) / Math.max(p.sh.size, q.sh.size);
        if (ratio >= 0.8 && jaccard(p.sh, q.sh) >= 0.8) add(xs[i], xs[j], 'Nearly the same text');
      }
    }
  }
  return out;
}

/** The kept item after merging `drop` into it: every collection, project, tag, domain, use, note and link of both;
 * the dropped item is kept whole inside it (its evidence, source and history), so it can be separated again. */
export function mergeInto(keep: Artifact, drop: Artifact, at: string): Artifact {
  const uni = (x?: string[], y?: string[]) => [...new Set([...(x ?? []), ...(y ?? [])])];
  const tags = [...(keep.tags ?? [])];
  for (const t of drop.tags ?? []) if (!tags.some(x => lc(x) === lc(t))) tags.push(t);
  const note = [keep.note?.trim(), drop.note?.trim()].filter(Boolean).join('\n\n');
  const links = [...(keep.links ?? []), ...(drop.links ?? [])]
    .filter(l => l.to !== keep.id && l.to !== drop.id)
    .filter((l, i, xs) => xs.findIndex(y => y.rel === l.rel && y.to === l.to) === i);
  const uses = [...(keep.uses ?? []), ...(drop.uses ?? [])].sort((x, y) => x.at.localeCompare(y.at));
  return {
    ...keep,
    collections: uni(keep.collections, drop.collections), projects: uni(keep.projects, drop.projects),
    domains: uni(keep.domains, drop.domains), useCases: uni(keep.useCases, drop.useCases),
    ...(tags.length ? { tags } : {}), ...(keep.starred || drop.starred ? { starred: true } : {}),
    ...(uses.length ? { uses } : {}), ...(note ? { note } : {}), ...(keep.tried ?? drop.tried ? { tried: keep.tried ?? drop.tried } : {}),
    ...(links.length ? { links } : {}),
    merged: [...(keep.merged ?? []), { item: drop, at }],
    history: [...(keep.history ?? []), { when: at, what: `Merged with “${drop.title}” · its evidence and history kept` }],
  };
}
/** The item a merged one now lives in (for links to an item that was merged away). */
export const mergedInto = (s: AppState, id: string) => s.artifacts.find(a => a.merged?.some(m => m.item.id === id));

/* ---------- find similar (FND-09): type, tags, source and words; no vectors ---------- */
export interface Similar { b: Artifact; why: string[]; score: number; versions: boolean }
export function similarTo(s: AppState, a: Artifact, limit = 5): Similar[] {
  const src = new Map(s.sources.map(x => [x.id, x]));
  const bag = (x: Artifact) => new Set(words(`${x.title} ${x.purpose ?? ''} ${(x.yours ?? x.exact ?? '').slice(0, 600)}`));
  const mine = bag(a), myTags = new Set((a.tags ?? []).map(lc)), myDomains = new Set(a.domains ?? []);
  const mySrc = src.get(a.sourceId ?? ''), mySite = mySrc ? siteOf(mySrc).key : null;
  const out: Similar[] = [];
  for (const b of s.artifacts) {
    if (b.id === a.id) continue;
    const why: string[] = [];
    let score = 0;
    if (b.type === a.type) score += 1.5;
    const tags = (b.tags ?? []).filter(t => myTags.has(lc(t)));
    if (tags.length) { score += 3 * Math.min(3, tags.length); why.push(tags.length === 1 ? `Tag “${tags[0]}”` : `${tags.length} tags`); }
    const bs = src.get(b.sourceId ?? '');
    if (b.sourceId && b.sourceId === a.sourceId) { score += 3; why.push('Same source'); }
    else if (bs && mySite && siteOf(bs).key === mySite && !/:(you|unknown)$/.test(mySite)) { score += 1.5; why.push(`Also from ${siteOf(bs).label}`); }
    const doms = (b.domains ?? []).filter(d => myDomains.has(d)).length;
    if (doms) score += Math.min(2, doms);
    const j = jaccard(mine, bag(b));
    if (j >= 0.12) { score += 10 * j; why.push('Similar words'); }
    if (score < 3 || !why.length) continue;
    if (b.type === a.type) why.unshift('Same type');
    out.push({ b, why, score, versions: jaccard(new Set(words(a.title)), new Set(words(b.title))) >= 0.5 && versionsOf(a.title) !== versionsOf(b.title) });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

/* ---------- library health (MNT-07) and insights (INS-02, INS-03, INS-04) ---------- */
export const lastTouched = (a: Artifact) => Math.max(+new Date(a.savedAt), ...(a.history ?? []).map(h => +new Date(h.when)), ...(a.uses ?? []).map(u => +new Date(u.at)));
export function health(s: AppState) {
  const ids = new Set(s.sources.map(x => x.id));
  return {
    neverUsed: s.artifacts.filter(a => !(a.uses ?? []).length),
    waiting: s.sources.filter(x => x.status === 'review'),
    noSource: s.artifacts.filter(a => !a.boardId && (!a.sourceId || !ids.has(a.sourceId))),
    demo: s.artifacts.filter(a => a.demo).length + s.sources.filter(x => x.demo).length + s.boards.filter(b => b.demo).length,
  };
}
export const UNTOUCHED_DAYS = 182;
/** INS-03: items not saved, edited or used for about six months, minus the ones you chose to keep. */
export function untouched(s: AppState, now = Date.now()): Artifact[] {
  const keep = new Set(org(s).keep ?? []);
  return s.artifacts.filter(a => !keep.has(a.id) && now - lastTouched(a) > UNTOUCHED_DAYS * DAY).sort((x, y) => lastTouched(x) - lastTouched(y));
}
export interface SourceValue { key: string; label: string; kept: number; used: number; uses: number }
/** INS-02: which sites or creators the items you reuse came from. Plain counts, no scores. */
export function sourceValue(s: AppState, by: 'site' | 'creator'): SourceValue[] {
  const src = new Map(s.sources.map(x => [x.id, x]));
  const m = new Map<string, SourceValue>();
  for (const a of s.artifacts) {
    const x = src.get(a.sourceId ?? '');
    if (!x) continue;
    const g = (by === 'site' ? siteOf : creatorOf)(x);
    const cur = m.get(g.key) ?? { key: g.key, label: g.label, kept: 0, used: 0, uses: 0 };
    cur.kept++;
    const n = (a.uses ?? []).length;
    if (n) { cur.used++; cur.uses += n; }
    m.set(g.key, cur);
  }
  return [...m.values()].sort((x, y) => y.used - x.used || y.uses - x.uses || y.kept - x.kept || x.label.localeCompare(y.label));
}
/** INS-04: the year in numbers, from this device only. */
export function yearInReview(s: AppState, year: number) {
  const inYear = (iso: string) => new Date(iso).getFullYear() === year;
  const saved = s.artifacts.filter(a => inYear(a.savedAt));
  const usesIn = (a: Artifact) => (a.uses ?? []).filter(u => inYear(u.at)).length;
  const types = new Map<ArtifactType, number>();
  saved.forEach(a => types.set(a.type, (types.get(a.type) ?? 0) + 1));
  const src = new Map(s.sources.map(x => [x.id, x]));
  const sites = new Map<string, number>();
  saved.forEach(a => { const x = src.get(a.sourceId ?? ''); if (x) { const l = siteOf(x).label; sites.set(l, (sites.get(l) ?? 0) + 1); } });
  const top = <K,>(m: Map<K, number>) => [...m].sort((x, y) => y[1] - x[1]).slice(0, 3);
  return {
    saved: saved.length,
    sources: s.sources.filter(x => inYear(x.savedAt)).length,
    uses: s.artifacts.reduce((n, a) => n + usesIn(a), 0),
    tried: s.artifacts.filter(a => a.tried && inYear(a.tried.at)).length,
    types: top(types), sites: top(sites),
    most: s.artifacts.map(a => ({ a, n: usesIn(a) })).filter(x => x.n).sort((x, y) => y.n - x.n).slice(0, 3),
  };
}

/* ---------- context resurfacing (NTF-03): projectFit lives in notifications.ts (the bell uses it; node tests load that file alone) ---------- */
export { projectFit } from './notifications';

/* ---------- domains (CUR-04) ---------- */
export function domainCounts(s: AppState): { domain: string; count: number }[] {
  const m = new Map<string, number>();
  for (const a of s.artifacts) for (const d of a.domains ?? []) m.set(d, (m.get(d) ?? 0) + 1);
  for (const d of org(s).domains ?? []) if (!m.has(d)) m.set(d, 0);
  return [...m].map(([domain, count]) => ({ domain, count })).sort((x, y) => y.count - x.count || x.domain.localeCompare(y.domain));
}

/* ---------- custom types (XEV-19) ---------- */
export const customTypes = (s: AppState): CustomType[] => org(s).types ?? [];
export const customTypeOf = (s: AppState, a: Artifact): CustomType | undefined => (a.customType ? customTypes(s).find(t => t.id === a.customType) : undefined);
/** What an item is called: your type's name when it has one, else its built-in type. */
export const typeLabelOf = (s: AppState, a: Artifact): string => customTypeOf(s, a)?.name ?? TYPE_LABEL[a.type];
/** "Presets"; a type you named in the singular gets an s. */
export const pluralOf = (t: CustomType) => t.plural || (/s$/i.test(t.name) ? t.name : `${t.name}s`);
/** Ready-made starting points (Elvis, 25 Oct: Preset first). Each is a suggestion you add yourself, then edit. */
export const TYPE_STARTERS: { name: string; base: ArtifactType; fields: string[] }[] = [
  { name: 'Preset', base: 'template', fields: ['Made for', 'Version'] },
];
