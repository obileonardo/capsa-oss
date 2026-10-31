/* Search inside Settings (Elvis, 26 Oct: "we need to be able to search within settings as well, because there's a lot of
 * settings"). Every group, section and setting in sections.ts is one entry; a query matches by name first, then by the
 * other words people use for it, then by its one-line explanation. Every word of the query has to match somewhere. */
import { SETTINGS_GROUPS } from './sections';

export interface SettingsHit { key: string; kind: 'group' | 'section' | 'setting'; label: string; path: string; group: string; anchor: string; score: number }

const norm = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase();

interface Entry { key: string; kind: SettingsHit['kind']; label: string; path: string; group: string; anchor: string; name: string; words: string; blurb: string }
const ENTRIES: Entry[] = SETTINGS_GROUPS.flatMap(g => [
  { key: `g:${g.id}`, kind: 'group' as const, label: g.label, path: 'Settings', group: g.id, anchor: '', name: norm(g.label), words: norm(g.words ?? ''), blurb: norm(g.blurb) },
  ...g.sections.flatMap(sec => [
    { key: `s:${sec.id}`, kind: 'section' as const, label: sec.label, path: g.label, group: g.id, anchor: sec.id, name: norm(sec.label), words: norm(sec.words ?? ''), blurb: norm(sec.blurb) },
    ...sec.settings.map(x => ({ key: `x:${x.id}`, kind: 'setting' as const, label: x.label, path: `${g.label} › ${sec.label}`, group: g.id, anchor: x.id, name: norm(x.label), words: norm(x.words ?? ''), blurb: '' })),
  ]),
]);

const KIND_ORDER = { section: 0, setting: 1, group: 2 } as const;
const wordStart = (hay: string, w: string) => hay.startsWith(w) || hay.includes(` ${w}`);

/** The matches for a query, best first. */
export function searchSettings(query: string, limit = 24): SettingsHit[] {
  const q = norm(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const hits: SettingsHit[] = [];
  for (const e of ENTRIES) {
    let score = 0;
    if (e.name === q) score += 100;
    else if (e.name.startsWith(q)) score += 80;
    else if (wordStart(e.name, q)) score += 60;
    let all = true;
    for (const w of words) {
      if (wordStart(e.name, w)) score += 20;
      else if (wordStart(e.words, w)) score += 14;
      else if (e.name.includes(w)) score += 8;
      else if (wordStart(e.blurb, w)) score += 6;
      else { all = false; break; }
    }
    if (!all) continue;
    hits.push({ key: e.key, kind: e.kind, label: e.label, path: e.path, group: e.group, anchor: e.anchor, score });
  }
  return hits.sort((a, b) => b.score - a.score || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, limit);
}
