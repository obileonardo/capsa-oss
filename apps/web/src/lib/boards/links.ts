/* Link-only references (B12). A link the user pastes or drops becomes either an official player embed or an
 * "Open original ↗" card. Nothing is fetched: no thumbnails, no titles, no page reads. The address is only turned into
 * the provider's documented embed URL:
 *   YouTube → youtube-nocookie.com/embed/ID?start=…   (privacy-enhanced mode)
 *   Vimeo   → player.vimeo.com/video/ID?dnt=1#t=…s
 *   Behance → behance.net/embed/project/ID              (the project's official embed)
 * Every other site, Dribbble included, is a link card only. */
import type { EmbedProvider } from '@/lib/types';

export interface ParsedLink { url: string; media: 'embed' | 'link'; provider?: EmbedProvider; embedUrl?: string; startS?: number; host: string }

export const PROVIDER_NAME: Record<EmbedProvider, string> = { youtube: 'YouTube', vimeo: 'Vimeo', behance: 'Behance' };
export const PROVIDER_HOST: Record<EmbedProvider, string> = { youtube: 'youtube-nocookie.com', vimeo: 'player.vimeo.com', behance: 'behance.net' };

/** "1h2m3s", "62s", "62" or "1:02" → seconds. */
export function parseStart(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (/^\d+(\.\d+)?s?$/.test(s)) return Math.floor(parseFloat(s));
  const hms = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (hms && (hms[1] || hms[2] || hms[3])) return (+(hms[1] ?? 0)) * 3600 + (+(hms[2] ?? 0)) * 60 + (+(hms[3] ?? 0));
  const colon = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (colon) return (+(colon[1] ?? 0)) * 3600 + (+colon[2]) * 60 + (+colon[3]);
  return undefined;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseLink(raw: string): ParsedLink | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const url = u.href;
  const hashParams = new URLSearchParams(u.hash.replace(/^#/, ''));

  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    let id: string | undefined;
    if (host === 'youtu.be') id = parts[0];
    else if (parts[0] === 'watch') id = u.searchParams.get('v') ?? undefined;
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
    if (id && YT_ID.test(id)) {
      const startS = parseStart(u.searchParams.get('t') ?? u.searchParams.get('start') ?? hashParams.get('t'));
      const q = new URLSearchParams({ rel: '0' });
      if (startS) q.set('start', String(startS));
      return { url, host, media: 'embed', provider: 'youtube', startS, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${q}` };
    }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const idAt = parts.findIndex(p => /^\d{5,12}$/.test(p));
    if (idAt >= 0) {
      const id = parts[idAt];
      const next = parts[idAt + 1];
      const h = u.searchParams.get('h') ?? (next && /^[0-9a-f]{6,20}$/i.test(next) ? next : null); // unlisted videos carry a hash
      const startS = parseStart(hashParams.get('t') ?? u.searchParams.get('t'));
      const q = new URLSearchParams({ dnt: '1' });
      if (h) q.set('h', h);
      return { url, host, media: 'embed', provider: 'vimeo', startS, embedUrl: `https://player.vimeo.com/video/${id}?${q}${startS ? `#t=${startS}s` : ''}` };
    }
  }

  if (host === 'behance.net') {
    const m = u.pathname.match(/^\/(?:gallery|embed\/project)\/(\d{4,12})(?:\/|$)/);
    if (m) return { url, host, media: 'embed', provider: 'behance', embedUrl: `https://www.behance.net/embed/project/${m[1]}?ilo0=1` };
  }

  return { url, host, media: 'link' };
}

/** Only these player addresses are ever put in an iframe, whatever is stored (backups can be edited by hand). */
const SAFE_EMBED = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?|player\.vimeo\.com\/video\/\d{5,12}\?|www\.behance\.net\/embed\/project\/\d{4,12}\?)[^\s"'<>]*$/;
export const safeEmbed = (u?: string) => (u && SAFE_EMBED.test(u) ? u : null);

export const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
