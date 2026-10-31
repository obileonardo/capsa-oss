/* Reading public GitHub links (build-out Stage 2). OFF by default: the store only calls this when the user has switched
 * "Reading public GitHub links (asks first)" on in Settings AND pressed "Read from GitHub" on that source.
 * It uses GitHub's free public REST API with no key or account: at most two requests per source (a SKILL.md and the
 * README, or the one file the link points to). Nothing else about the library is sent. */
import { findPieces, lineRange, type Piece } from './extract';

export const GITHUB_API = 'https://api.github.com';

export interface GithubTarget { owner: string; repo: string; ref?: string; path?: string; isFile: boolean }

export function parseGithub(url: string): GithubTarget | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname.replace(/^www\./, '') !== 'github.com') return null;
  const [owner, repo, kind, ref, ...rest] = u.pathname.split('/').filter(Boolean);
  if (!owner || !repo) return null;
  const name = repo.replace(/\.git$/, '');
  if ((kind === 'blob' || kind === 'tree') && ref) return { owner, repo: name, ref, path: rest.join('/') || undefined, isFile: kind === 'blob' };
  return { owner, repo: name, isFile: false };
}

export interface GithubFile { path: string; text: string }
export type GithubRead =
  | { ok: true; files: GithubFile[]; requests: string[] }
  | { ok: false; reason: string; status: 'failed' | 'nothing'; requests: string[] };

const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** Fetches the README and SKILL.md (or the linked file). `fetchImpl` lets tests stub the network. */
export async function readGithub(t: GithubTarget, fetchImpl: typeof fetch = fetch): Promise<GithubRead> {
  const requests: string[] = [];
  const base = `${GITHUB_API}/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}`;
  const q = t.ref ? `?ref=${encodeURIComponent(t.ref)}` : '';
  const get = async (endpoint: string): Promise<string | null> => {
    const url = `${base}/${endpoint}${q}`;
    requests.push(url);
    const r = await fetchImpl(url, { headers: { Accept: 'application/vnd.github.raw+json' }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    if (r.status === 404) return null;
    if (r.status === 403 || r.status === 429) throw Object.assign(new Error('limit'), { kind: 'limit' });
    if (!r.ok) throw Object.assign(new Error(`GitHub answered ${r.status}`), { kind: 'http' });
    return r.text();
  };
  const plan: { label: string; endpoint: string }[] = t.isFile && t.path
    ? [{ label: t.path, endpoint: `contents/${enc(t.path)}` }]
    : t.path
      ? [{ label: `${t.path}/SKILL.md`, endpoint: `contents/${enc(t.path)}/SKILL.md` }, { label: `${t.path}/README.md`, endpoint: `contents/${enc(t.path)}/README.md` }]
      : [{ label: 'SKILL.md', endpoint: 'contents/SKILL.md' }, { label: 'README', endpoint: 'readme' }];
  const files: GithubFile[] = [];
  try {
    for (const p of plan) {
      const text = await get(p.endpoint);
      if (text != null && text.trim()) files.push({ path: p.label === 'README' ? 'README.md' : p.label, text: text.replace(/\r\n?/g, '\n') });
    }
  } catch (e) {
    const kind = (e as { kind?: string }).kind;
    const reason = kind === 'limit'
      ? 'GitHub’s free limit for reading without an account (60 an hour from your network) is used up. Try again later.'
      : kind === 'http' ? `GitHub couldn’t send the files (${(e as Error).message.replace('GitHub answered ', 'status ')}).`
      : 'Couldn’t reach GitHub. Check your connection and try again.';
    return { ok: false, status: 'failed', reason, requests };
  }
  if (!files.length) {
    return { ok: false, status: 'nothing', reason: t.isFile ? 'GitHub has no such file, or the repository is private.' : 'No README or SKILL.md was found. The repository may be empty or private.', requests };
  }
  return { ok: true, files, requests };
}

export interface FoundInFile extends Piece { file: string; segId: string; locator: string }

/** Candidates from the fetched files, each with its file and lines. A README's install commands count too; the user
 * skips what they don't want. At most 15, so a long README doesn't flood the review. */
export function piecesFromFiles(files: GithubFile[], max = 15): { pieces: FoundInFile[]; capped: boolean } {
  const all = files.flatMap((f, i) => {
    const text = f.text.trim();
    return findPieces(text).map(p => ({ ...p, file: f.path, segId: `gh-${i}`, locator: `${f.path}, ${lineRange(text, p.start, p.end)}` }));
  });
  return { pieces: all.slice(0, max), capped: all.length > max };
}
