/* GitHub stars (IMP-05, Track A 25 Oct). The same free public REST API as reading GitHub links (lib/capture/github.ts),
 * behind the same Settings switch, which asks first: only the username is sent, a page of 100 stars at a time, with no
 * key or account. Without an account GitHub allows 60 requests an hour from one network, so 6,000 stars an hour. */
import { GITHUB_API } from '../capture/github';
import type { ImportLink } from './parse';

export const STARS_PER_PAGE = 100;
export const validUser = (u: string) => /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(u.trim());

interface Repo { html_url: string; full_name: string; language?: string | null; archived?: boolean; fork?: boolean; topics?: string[]; created_at?: string }
export type StarsPage = { ok: true; links: ImportLink[]; more: boolean } | { ok: false; reason: string; limit?: boolean };

/** One page of a user's public stars. `fetchImpl` lets tests stub the network. */
export async function fetchStars(user: string, page: number, fetchImpl: typeof fetch = fetch): Promise<StarsPage> {
  const url = `${GITHUB_API}/users/${encodeURIComponent(user.trim())}/starred?per_page=${STARS_PER_PAGE}&page=${page}`;
  let r: Response;
  try { r = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }); }
  catch { return { ok: false, reason: 'Couldn’t reach GitHub. Check your connection and try again.' }; }
  if (r.status === 404) return { ok: false, reason: `GitHub has no user “${user.trim()}”.` };
  if (r.status === 403 || r.status === 429) return { ok: false, limit: true, reason: 'GitHub’s free limit for reading without an account (60 an hour from your network) is used up. Resume later.' };
  if (!r.ok) return { ok: false, reason: `GitHub couldn’t send the stars (status ${r.status}).` };
  let repos: Repo[];
  try { repos = await r.json() as Repo[]; } catch { return { ok: false, reason: 'GitHub sent something that isn’t a list of stars.' }; }
  if (!Array.isArray(repos)) return { ok: false, reason: 'GitHub sent something that isn’t a list of stars.' };
  const links: ImportLink[] = repos.filter(x => x && typeof x.html_url === 'string').map(x => ({
    url: x.html_url, title: x.full_name,
    labels: [x.language ?? '', x.archived ? 'archived' : '', x.fork ? 'fork' : ''].filter(Boolean),
    tags: (x.topics ?? []).slice(0, 8),
  }));
  return { ok: true, links, more: repos.length === STARS_PER_PAGE };
}
