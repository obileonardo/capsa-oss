/* Links (Track A, 25 Oct): one canonical form per address, so a link that's already saved is spotted (CAP-04), and the
 * list of links in a bulk paste (CPT-16). Read from the address only; nothing is fetched.
 *
 * Canonical form: https, no "www." or mobile subdomain, no #fragment, no trailing slash, tracking parameters removed and
 * the rest sorted. youtu.be/ID, /shorts/ID and m.youtube.com become youtube.com/watch?v=ID; twitter.com becomes x.com;
 * AMP paths and ?amp go. Over-merging is the risk (PD CAP-04), so the path keeps its case and only known trackers go,
 * and the person can always "Save anyway".
 *
 * Pure functions and type-only imports, so the tests run this file directly in Node. */
import type { Source } from '../types';

/** Query parameters that only say where a click came from. Matched exactly, plus any utm_* or mc_* parameter. */
const TRACKERS = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id', 'igshid', 'igsh', 'si',
  'ref', 'ref_src', 'ref_url', 'referrer', 'cmpid', 'mkt_tok', '_hsenc', '_hsmi', 'hsctatracking', 'oly_anon_id', 'oly_enc_id',
  'vero_id', 'spm', 'share_id', 'feature', 'trk', 'trkcampaign', 'sr_share',
]);
const isTracker = (k: string) => {
  const n = k.toLowerCase();
  return TRACKERS.has(n) || n.startsWith('utm_') || n.startsWith('mc_') || n.startsWith('pk_') || n.startsWith('hmb_');
};

/** The canonical form of an address, or null when it isn't a web address. */
export function canonicalUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let u: URL;
  // another scheme (mailto:, javascript:, ftp://…) isn't a web address; "host:8080/x" is a port, not a scheme
  if (/^[a-z][\w+.-]*:(?!\d)/i.test(t) && !/^https?:\/\//i.test(t)) return null;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let host = u.hostname.toLowerCase().replace(/\.$/, '').replace(/^(www\d?|m|mobile|amp)\./, '');
  if (!host.includes('.')) return null;
  let path = u.pathname.replace(/\/{2,}/g, '/');
  const params = new URLSearchParams(u.search);

  // site rules
  if (host === 'twitter.com' || host === 'mobile.twitter.com') host = 'x.com';
  if (host === 'youtu.be') {
    const id = path.split('/').filter(Boolean)[0];
    if (id) { host = 'youtube.com'; path = '/watch'; params.set('v', id); }
  }
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    const shorts = path.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/);
    if (shorts) { path = '/watch'; params.set('v', shorts[1]); }
    // the moment (t, start) and the playlist position don't make it a different video
    for (const k of ['t', 'start', 'index', 'list', 'ab_channel', 'pp']) if (path === '/watch') params.delete(k);
  }
  if (host === 'x.com') for (const k of ['t', 's']) params.delete(k);
  // AMP pages: /amp, /amp/, .amp and ?amp=1 are the same article
  path = path.replace(/\/amp\/?$/, '/').replace(/\.amp(\.html?)?$/, '$1');
  params.delete('amp');

  for (const k of [...params.keys()]) if (isTracker(k)) params.delete(k);
  const sorted = [...params.entries()].sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));
  const q = sorted.length ? `?${new URLSearchParams(sorted).toString()}` : '';
  path = path.replace(/\/+$/, '') || '';
  return `https://${host}${path}${q}`;
}

/** The saved source with the same canonical address, if any (the newest first, as sources are stored). */
export function findSavedLink(sources: Pick<Source, 'id' | 'url' | 'title' | 'status'>[], url: string): Pick<Source, 'id' | 'url' | 'title' | 'status'> | undefined {
  const c = canonicalUrl(url);
  if (!c) return undefined;
  return sources.find(s => !!s.url && canonicalUrl(s.url) === c);
}

/* ---------- bulk paste (CPT-16) ---------- */
export type BulkLine =
  | { kind: 'link'; line: number; raw: string; url: string; canonical: string }
  | { kind: 'repeat'; line: number; raw: string; url: string; canonical: string; firstLine: number }
  | { kind: 'invalid'; line: number; raw: string };

const URL_IN = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/gi;
/** Trailing punctuation that belongs to the sentence, not the address ("see https://x.com/a)." → https://x.com/a). */
const trimUrl = (u: string) => {
  let x = u.replace(/[.,;:!?'"’”]+$/, '');
  if (x.endsWith(')') && (x.match(/\(/g)?.length ?? 0) < (x.match(/\)/g)?.length ?? 0)) x = x.slice(0, -1);
  if (x.endsWith(']') && !x.includes('[')) x = x.slice(0, -1);
  return x;
};

/** Each non-empty line of a paste: a link (the first address on that line), a repeat of an earlier line, or not a link.
 * Markdown list markers and "- [title](url)" lines are fine. */
export function bulkLines(text: string): BulkLine[] {
  const out: BulkLine[] = [];
  const seen = new Map<string, number>();
  text.replace(/\r\n?/g, '\n').split('\n').forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const m = raw.match(URL_IN);
    const found = m ? trimUrl(m[0]) : null;
    const url = found ? (/^https?:\/\//i.test(found) ? found : `https://${found}`) : null;
    const canonical = url ? canonicalUrl(url) : null;
    if (!url || !canonical) { out.push({ kind: 'invalid', line, raw: raw.trim() }); return; }
    let full: string;
    try { full = new URL(url).toString(); } catch { out.push({ kind: 'invalid', line, raw: raw.trim() }); return; }
    const first = seen.get(canonical);
    if (first) out.push({ kind: 'repeat', line, raw: raw.trim(), url: full, canonical, firstLine: first });
    else { seen.set(canonical, line); out.push({ kind: 'link', line, raw: raw.trim(), url: full, canonical }); }
  });
  return out;
}

/** A paste is a bulk paste of links when it has two or more lines and most of them are links (at least two). */
export function isBulkLinks(text: string): boolean {
  const lines = bulkLines(text);
  const links = lines.filter(l => l.kind !== 'invalid').length;
  return lines.length >= 2 && links >= 2 && links >= lines.length * 0.6;
}
