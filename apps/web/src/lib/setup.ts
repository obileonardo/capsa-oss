/* Setting up a saved MCP server or skill (Track C, 25 Oct). Pure, worked out on this device from the saved text only.
 *   USE-03  copyable setup for Claude Code, Codex, Cursor and VS Code. Capsa never runs them.
 *   RUS-08  what a setup changes, with any secret shown as a placeholder (values in the saved text are never repeated).
 *   LRN-08  plain-language permission notes, worked out by rules from names in the config, labelled "publisher states".
 * Formats checked against each vendor's docs on 25 Oct 2026 (SETUP_CHECKED); they change, so re-check with the list:
 *   Claude Code  https://code.claude.com/docs/en/mcp
 *   Codex        https://learn.chatgpt.com/docs/extend/mcp?surface=cli
 *   Cursor       https://cursor.com/docs/context/mcp and https://cursor.com/docs/mcp/install-links
 *   VS Code      https://code.visualstudio.com/docs/agents/reference/mcp-configuration */
import { cautionsFor } from './capture/extract';
import { maskSensitive } from './capture/sensitive';

export const SETUP_CHECKED = '25 Oct 2026';

export interface ServerSpec {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args: string[];
  /** environment variable names; their values are never carried over */
  env: string[];
  url?: string;
  /** header names; their values are never carried over */
  headers: string[];
}

/* ---------- reading a config ---------- */
const nameOk = (n: string) => n.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'server';

function fromObject(name: string, o: Record<string, unknown>): ServerSpec | null {
  if (!o || typeof o !== 'object') return null;
  const url = [o.url, o.serverUrl, o.httpUrl].find(v => typeof v === 'string') as string | undefined;
  const command = typeof o.command === 'string' ? o.command : undefined;
  if (!url && !command) return null;
  const args = Array.isArray(o.args) ? o.args.filter((a): a is string => typeof a === 'string') : [];
  const env = o.env && typeof o.env === 'object' ? Object.keys(o.env as object) : [];
  const headers = o.headers && typeof o.headers === 'object' ? Object.keys(o.headers as object) : [];
  return { name: nameOk(name), transport: url && !command ? 'http' : 'stdio', command, args, env, url, headers };
}

/** Split a shell line into words, keeping quoted parts together. */
export function shellWords(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function fromAddCommand(line: string): ServerSpec | null {
  const w = shellWords(line.replace(/\\\n\s*/g, ' '));
  const at = w.findIndex((x, i) => (x === 'claude' || x === 'codex') && w[i + 1] === 'mcp' && w[i + 2] === 'add');
  if (at < 0) return null;
  const rest = w.slice(at + 3);
  const dash = rest.indexOf('--');
  const opts = dash < 0 ? rest : rest.slice(0, dash);
  const cmd = dash < 0 ? [] : rest.slice(dash + 1);
  const env: string[] = [], headers: string[] = [], pos: string[] = [];
  let url: string | undefined, transport: string | undefined;
  for (let i = 0; i < opts.length; i++) {
    const o = opts[i];
    const val = () => opts[++i] ?? '';
    if (o === '-e' || o === '--env') { while (opts[i + 1] && /^[A-Za-z_][\w]*=/.test(opts[i + 1])) env.push(opts[++i].split('=')[0]); }
    else if (o.startsWith('--env=')) env.push(o.slice(6).split('=')[0]);
    else if (o === '-H' || o === '--header') headers.push(val().split(':')[0].trim());
    else if (o === '-t' || o === '--transport') transport = val();
    else if (o === '-s' || o === '--scope' || o === '--bearer-token-env-var') val();
    else if (o === '--url') url = val();
    else if (!o.startsWith('-')) pos.push(o);
  }
  const name = pos[0];
  if (!name) return null;
  if (!url && pos[1] && /^https?:\/\//.test(pos[1])) url = pos[1];
  if (url || transport === 'http' || transport === 'sse') return url ? { name: nameOk(name), transport: 'http', args: [], env, url, headers } : null;
  if (!cmd.length) return null;
  return { name: nameOk(name), transport: 'stdio', command: cmd[0], args: cmd.slice(1), env, headers: [] };
}

function fromToml(text: string): ServerSpec[] {
  const out: ServerSpec[] = [];
  const re = /^\[mcp_servers\.([\w-]+)\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/gm;
  for (const m of text.matchAll(re)) {
    const body = m[2];
    const str = (k: string) => body.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];
    const args = [...(body.match(/^args\s*=\s*\[([^\]]*)\]/m)?.[1] ?? '').matchAll(/"([^"]*)"/g)].map(x => x[1]);
    const envLine = body.match(/^env\s*=\s*\{([^}]*)\}/m)?.[1] ?? '';
    const env = [...envLine.matchAll(/"?([A-Za-z_]\w*)"?\s*=/g)].map(x => x[1]);
    const command = str('command'), url = str('url');
    if (command || url) out.push({ name: nameOk(m[1]), transport: url && !command ? 'http' : 'stdio', command, args, env, url, headers: [] });
  }
  return out;
}

/** The MCP servers a saved text sets up: a JSON config (mcpServers, servers, mcp.servers, mcp_servers), a
 * `claude mcp add` or `codex mcp add` line, or a Codex config.toml. Empty when the text doesn't say. */
export function parseServers(text: string | null | undefined, fallbackName = 'server'): ServerSpec[] {
  if (!text?.trim()) return [];
  const t = text.trim();
  const jsonish = t.match(/[{[][\s\S]*[}\]]/)?.[0];
  if (jsonish) {
    try {
      const j = JSON.parse(jsonish) as Record<string, unknown>;
      const map = (j.mcpServers ?? j.servers ?? (j.mcp as Record<string, unknown> | undefined)?.servers ?? j.mcp_servers ?? j['mcp.servers']) as Record<string, Record<string, unknown>> | undefined;
      if (map && typeof map === 'object') return Object.entries(map).map(([n, o]) => fromObject(n, o)).filter((x): x is ServerSpec => !!x);
      const one = fromObject(typeof j.name === 'string' ? j.name : fallbackName, j);
      if (one) return [one];
    } catch { /* not JSON */ }
  }
  const toml = fromToml(t);
  if (toml.length) return toml;
  return t.split('\n').filter(l => /\b(?:claude|codex)\s+mcp\s+add\b/.test(l)).map(fromAddCommand).filter((x): x is ServerSpec => !!x);
}

/* ---------- writing setup for each client ---------- */
export type Client = 'claude' | 'codex' | 'cursor' | 'vscode';
export const CLIENTS: { id: Client; label: string; docs: string }[] = [
  { id: 'claude', label: 'Claude Code', docs: 'https://code.claude.com/docs/en/mcp' },
  { id: 'codex', label: 'Codex', docs: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli' },
  { id: 'cursor', label: 'Cursor', docs: 'https://cursor.com/docs/context/mcp' },
  { id: 'vscode', label: 'VS Code', docs: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration' },
];
export interface Snippet { label: string; text: string }

const q = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
/** Arguments with any secret in them (a password in a database URL, a key) shown as a placeholder. */
const safeArgs = (xs: string[]) => xs.map(a => maskSensitive(a));
const ph = (k: string) => `<${k}>`;
const b64 = (s: string) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'));

export function setupFor(client: Client, sp: ServerSpec): Snippet[] {
  const args = safeArgs(sp.args);
  const cmdLine = [sp.command ?? '', ...args].map(q).join(' ');
  if (client === 'claude') {
    if (sp.transport === 'http') return [{ label: 'Terminal', text: `claude mcp add --transport http ${q(sp.name)} ${q(sp.url!)}${sp.headers.map(h => ` --header ${q(`${h}: ${ph('value')}`)}`).join('')}` }];
    // --env takes several KEY=value pairs, so another option goes between it and the name (Claude Code docs)
    return [{ label: 'Terminal', text: `claude mcp add ${sp.env.map(k => `--env ${k}=${ph(k)} `).join('')}--transport stdio ${q(sp.name)} -- ${cmdLine}` }];
  }
  if (client === 'codex') {
    if (sp.transport === 'http') {
      const auth = sp.headers.some(h => /^authorization$/i.test(h));
      return [{ label: 'Terminal', text: `codex mcp add ${q(sp.name)} --url ${q(sp.url!)}${auth ? ' --bearer-token-env-var <TOKEN_ENV_VAR>' : ''}` }];
    }
    return [{ label: 'Terminal', text: `codex mcp add ${q(sp.name)} ${sp.env.map(k => `--env ${k}=${ph(k)} `).join('')}-- ${cmdLine}` }];
  }
  if (client === 'cursor') {
    // Cursor reads ${env:NAME} from your environment, so no value goes in the file
    const obj: Record<string, unknown> = sp.transport === 'http'
      ? { url: sp.url, ...(sp.headers.length ? { headers: Object.fromEntries(sp.headers.map(h => [h, `\${env:${h.toUpperCase().replace(/\W+/g, '_')}}`])) } : {}) }
      : { command: sp.command, args, ...(sp.env.length ? { env: Object.fromEntries(sp.env.map(k => [k, `\${env:${k}}`])) } : {}) };
    return [
      { label: '.cursor/mcp.json', text: JSON.stringify({ mcpServers: { [sp.name]: obj } }, null, 2) },
      { label: 'Install link', text: `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(sp.name)}&config=${b64(JSON.stringify(obj))}` },
    ];
  }
  // VS Code: secrets come from an input VS Code asks for (password: true), never from the file
  const inputs = [...sp.env, ...sp.headers].map(k => ({ type: 'promptString', id: k.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: k, password: true }));
  const ref = (k: string) => `\${input:${k.toLowerCase().replace(/[^a-z0-9]+/g, '-')}}`;
  const server: Record<string, unknown> = sp.transport === 'http'
    ? { type: 'http', url: sp.url, ...(sp.headers.length ? { headers: Object.fromEntries(sp.headers.map(h => [h, ref(h)])) } : {}) }
    : { type: 'stdio', command: sp.command, args, ...(sp.env.length ? { env: Object.fromEntries(sp.env.map(k => [k, ref(k)])) } : {}) };
  const cli = { name: sp.name, ...server, ...(sp.env.length && sp.transport === 'stdio' ? { env: Object.fromEntries(sp.env.map(k => [k, ph(k)])) } : {}) };
  return [
    { label: '.vscode/mcp.json', text: JSON.stringify({ ...(inputs.length ? { inputs } : {}), servers: { [sp.name]: server } }, null, 2) },
    { label: 'Terminal', text: `code --add-mcp ${q(JSON.stringify(cli))}` },
  ];
}

export function removeFor(client: Client, sp: ServerSpec): string {
  if (client === 'claude') return `claude mcp remove ${q(sp.name)}`;
  if (client === 'codex') return `codex mcp remove ${q(sp.name)}`;
  if (client === 'cursor') return `Delete “${sp.name}” from .cursor/mcp.json`;
  return `Delete “${sp.name}” from .vscode/mcp.json`;
}

/* ---------- RUS-08: what it changes ---------- */
const WHERE: Record<Client, string> = {
  claude: 'Claude Code, for this project only (local scope, the default)',
  codex: 'Codex, in ~/.codex/config.toml',
  cursor: 'Cursor, in this project’s .cursor/mcp.json',
  vscode: 'VS Code, in this workspace’s .vscode/mcp.json (Terminal: your user profile)',
};
/** Who publishes it, as far as the config says: an npm scope or package, a PyPI package, an image or a web address.
 * Taken from the names only; not checked. */
export function publisherOf(sp: ServerSpec): string | null {
  if (sp.transport === 'http' && sp.url) { try { return new URL(sp.url).hostname; } catch { return null; } }
  const pkg = sp.args.find(a => !a.startsWith('-') && /^(@[\w.-]+\/)?[\w.-]+(@[\w.^~-]+)?$/.test(a) && !/^\d/.test(a));
  if (sp.command && /^(npx|bunx|pnpm|yarn|uvx|pipx)$/.test(sp.command) && pkg) return pkg.startsWith('@') ? pkg.split('/')[0] : pkg.replace(/@[\w.^~-]+$/, '');
  if (sp.command === 'docker') { const img = sp.args.find(a => /^[\w.-]+\/[\w.-]+/.test(a)); return img ? img.split('/')[0] : null; }
  return null;
}
export interface Change { text: string; code?: string }
export function changesFor(client: Client, sp: ServerSpec): Change[] {
  const out: Change[] = [{ text: `Adds “${sp.name}” to ${WHERE[client]}` }];
  if (sp.transport === 'http') out.push({ text: 'Connects to', code: sp.url });
  else {
    out.push({ text: 'Runs on your computer', code: [sp.command ?? '', ...safeArgs(sp.args)].join(' ') });
    if (sp.command === 'npx' && sp.args.includes('-y')) out.push({ text: 'Downloads the package from npm without asking (npx -y)' });
    else if (sp.command === 'npx' || sp.command === 'bunx' || sp.command === 'pnpm') out.push({ text: 'Downloads the package from npm' });
    if (sp.command === 'uvx' || sp.command === 'pipx') out.push({ text: 'Downloads the package from PyPI' });
    if (sp.command === 'docker') out.push({ text: 'Runs a Docker container' });
  }
  for (const k of sp.env) out.push({ text: 'Needs a value you add yourself', code: `${k}=<${k}>` });
  for (const h of sp.headers) out.push({ text: 'Sends a header you add yourself', code: `${h}: <value>` });
  out.push({ text: 'Remove with', code: removeFor(client, sp) });
  return out;
}

/* ---------- LRN-08: permission notes, by rules ---------- */
const RULES: [RegExp, string][] = [
  [/file[-_ ]?system|\bfs\b|server-filesystem/i, 'Read and change files in the folders it’s given'],
  [/github|gitlab|bitbucket/i, 'Read and change repositories, issues and pull requests'],
  [/slack|discord|\bteams\b|telegram|whatsapp/i, 'Read and send messages'],
  [/gmail|\bemail\b|\bmail\b|smtp|imap|outlook/i, 'Read and send email'],
  [/postgres|mysql|sqlite|database|supabase|mongo|redis|\bsql\b/i, 'Read and change a database'],
  [/puppeteer|playwright|browser|chrome|selenium/i, 'Open web pages and act in a browser'],
  [/server-fetch|\bfetch\b|web[-_ ]?search|brave|tavily|\bexa\b|firecrawl|scrape/i, 'Fetch pages from the internet'],
  [/\bshell\b|terminal|\bexec\b|desktop-commander|run[-_ ]?command/i, 'Run commands on your computer'],
  [/server-memory|\bmemory\b|knowledge[-_ ]?graph/i, 'Keep notes on your computer'],
  [/calendar|gcal/i, 'Read and change your calendar'],
  [/google[-_ ]?drive|gdrive|dropbox|onedrive|\bbox\b/i, 'Read and change files in cloud storage'],
  [/stripe|paypal|payments?\b|billing/i, 'Act on payments'],
  [/\baws\b|gcloud|\bgcp\b|azure|cloudflare|vercel|netlify|kubernetes|kubectl/i, 'Manage cloud resources'],
  [/notion|linear|jira|asana|trello|airtable/i, 'Read and change your workspace (pages, issues or tasks)'],
];
const SKILL_TOOLS: [RegExp, string][] = [
  [/\bBash\b/, 'Run commands'], [/\b(?:Write|Edit|MultiEdit|NotebookEdit)\b/, 'Change files'], [/\b(?:Read|Glob|Grep|LS)\b/, 'Read files'],
  [/\bWeb(?:Fetch|Search)\b/, 'Fetch pages from the internet'],
];
export interface PermissionNotes { notes: string[]; credentials: string[]; scripts: boolean; stated: boolean }
/** What the saved text says it can do, in plain words. `stated` is false when no rule matched ("not stated by publisher"). */
export function permissionNotes(text: string | null | undefined, type: string, specs: ServerSpec[] = parseServers(text)): PermissionNotes {
  const t = text ?? '';
  const notes: string[] = [];
  if (type === 'skill') {
    const allowed = t.match(/^allowed[-_]tools\s*:\s*(.+(?:\n\s+-\s*.+)*)/im)?.[1] ?? '';
    for (const [re, n] of SKILL_TOOLS) if (re.test(allowed) && !notes.includes(n)) notes.push(n);
  }
  const hay = [t, ...specs.flatMap(s => [s.name, s.command ?? '', ...s.args, s.url ?? ''])].join('\n');
  for (const [re, n] of RULES) if (re.test(hay) && !notes.includes(n)) notes.push(n);
  const credentials = [...new Set(specs.flatMap(s => [...s.env, ...s.headers]).filter(k => /token|key|secret|pass|auth|credential|pat\b/i.test(k)))];
  const scripts = type === 'skill' && (/```(?:bash|sh|zsh|python|py|js|node|ts)\b/i.test(t) || /\bscripts?\//.test(t));
  return { notes, credentials, scripts, stated: notes.length > 0 || credentials.length > 0 };
}

/** Cautions found by rule in the saved text (XEV-16), for the panel. Empty: none found by rule. */
export const setupCautions = (text: string | null | undefined) => cautionsFor(text ?? '');
