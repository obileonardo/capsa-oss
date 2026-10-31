/* Citation export (RUS-13, Track C): BibTeX, CSL-JSON and APA 7 text for the sources behind the chosen items. Pure.
 * One citation per source (items from the same source share it). Only what Capsa knows is written: the source's
 * title, author, address, site and the day it was saved (as the access date). Nothing is looked up, so the publication
 * date is always missing, and missing fields are listed rather than invented. Items with no source (pasted or written
 * by you) can't be cited and are counted. */
import type { AppState, Artifact, Source } from './types';

export type CiteFormat = 'bibtex' | 'csl' | 'apa';
export interface CiteResult { text: string; cited: number; notCitable: number; missing: { field: string; count: number }[] }

const host = (u?: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };
const SITE: Record<string, string> = { 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'vimeo.com': 'Vimeo', 'x.com': 'X', 'twitter.com': 'X', 'github.com': 'GitHub', 'gist.github.com': 'GitHub' };
const siteOf = (s: Source) => SITE[host(s.url)] ?? host(s.url);
const realAuthor = (s: Source) => { const a = s.author?.trim(); return a && !/^(—|unknown|you)$/i.test(a) ? a : ''; };
const ymd = (iso: string) => iso.slice(0, 10);
const keyOf = (s: Source, used: Set<string>) => {
  const base = ((realAuthor(s).split(/\s+/).pop() || siteOf(s) || 'source').toLowerCase().replace(/[^a-z0-9]/g, '') || 'source') + 'nd';
  let k = base, i = 1; while (used.has(k)) k = `${base}${String.fromCharCode(96 + ++i)}`;
  used.add(k); return k;
};
const bib = (v: string) => v.replace(/[{}\\]/g, '').replace(/([&%$#_])/g, '\\$1');

/** The sources behind these items, once each, in the order first met; and how many items had none. */
export function citableSources(items: Artifact[], s: AppState): { sources: Source[]; notCitable: number } {
  const seen = new Map<string, Source>();
  let notCitable = 0;
  for (const a of items) {
    const src = a.sourceId ? s.sources.find(x => x.id === a.sourceId) : undefined;
    if (!src || (!src.url && src.kind === 'manual')) { notCitable++; continue; }
    if (!seen.has(src.id)) seen.set(src.id, src);
  }
  return { sources: [...seen.values()], notCitable };
}

function missingOf(src: Source): string[] {
  const m = ['date published'];
  if (!realAuthor(src)) m.unshift('author');
  if (!src.url) m.push('address');
  return m;
}

export function citations(items: Artifact[], s: AppState, fmt: CiteFormat): CiteResult {
  const { sources, notCitable } = citableSources(items, s);
  const counts = new Map<string, number>();
  for (const src of sources) for (const f of missingOf(src)) counts.set(f, (counts.get(f) ?? 0) + 1);
  const missing = [...counts.entries()].map(([field, count]) => ({ field, count }));
  const used = new Set<string>();
  let text: string;
  if (fmt === 'csl') {
    text = JSON.stringify(sources.map(src => ({
      id: keyOf(src, used),
      type: src.kind === 'video' ? 'motion_picture' : src.kind === 'x' ? 'post' : src.kind === 'github' ? 'software' : 'webpage',
      title: src.title,
      ...(realAuthor(src) ? { author: [{ literal: realAuthor(src) }] } : {}),
      ...(siteOf(src) ? { 'container-title': siteOf(src) } : {}),
      ...(src.url ? { URL: src.url } : {}),
      accessed: { 'date-parts': [ymd(src.savedAt).split('-').map(Number)] },
      note: `Missing: ${missingOf(src).join(', ')}`,
    })), null, 2) + '\n';
  } else if (fmt === 'bibtex') {
    text = sources.map(src => {
      const fields = [
        `  title = {${bib(src.title)}}`,
        realAuthor(src) ? `  author = {{${bib(realAuthor(src))}}}` : null,
        siteOf(src) ? `  howpublished = {${bib(siteOf(src))}}` : null,
        src.url ? `  url = {${src.url}}` : null,
        `  urldate = {${ymd(src.savedAt)}}`,
        `  note = {Missing: ${missingOf(src).join(', ')}}`,
      ].filter(Boolean);
      return `@misc{${keyOf(src, used)},\n${fields.join(',\n')}\n}`;
    }).join('\n\n') + (sources.length ? '\n' : '');
  } else {
    // APA 7: Author. (n.d.). Title [Format]. Site. Retrieved Month D, YYYY, from URL
    const kindTag = (src: Source) => (src.kind === 'video' ? ' [Video]' : src.kind === 'x' ? ' [Post]' : src.kind === 'github' ? ' [Computer software]' : '');
    const retrieved = (src: Source) => new Date(src.savedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    text = sources.map(src => {
      const who = realAuthor(src);
      const site = siteOf(src);
      const head = who ? `${who}. (n.d.). ${src.title}${kindTag(src)}.` : `${src.title}${kindTag(src)}. (n.d.).`;
      return [head, site && site !== who ? `${site}.` : '', src.url ? `Retrieved ${retrieved(src)}, from ${src.url}` : ''].filter(Boolean).join(' ');
    }).join('\n\n') + (sources.length ? '\n' : '');
  }
  return { text, cited: sources.length, notCitable, missing };
}
