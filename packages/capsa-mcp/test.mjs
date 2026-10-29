// Tests for the Capsa MCP server over stdio (newline-delimited JSON-RPC 2.0), against examples/sample-library.json.
// No dependencies and no browser: the client below follows the MCP specification directly.
// Usage: node packages/capsa-mcp/test.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, 'server.mjs');
const SAMPLE = path.join(HERE, 'examples', 'sample-library.json');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

function client(args, env = {}, server = SERVER) {
  const proc = spawn(process.execPath, [server, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CAPSA_FILE: '', LIBRARYKIT_FILE: '', ...env } });
  let buf = '', nextId = 1, stderr = '', badLines = 0;
  const waiting = new Map();
  proc.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { badLines++; continue; } // stdout must carry only JSON-RPC messages
      waiting.get(msg.id)?.(msg); waiting.delete(msg.id);
    }
  });
  proc.stderr.on('data', d => { stderr += d; });
  const send = obj => proc.stdin.write(JSON.stringify(obj) + '\n');
  const request = (method, params) => new Promise((res, rej) => {
    const id = nextId++;
    const t = setTimeout(() => rej(new Error(`timeout: ${method}`)), 5000);
    waiting.set(id, m => { clearTimeout(t); res(m); });
    send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
  });
  const raw = (line, id) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout: raw')), 5000);
    waiting.set(id, m => { clearTimeout(t); res(m); });
    proc.stdin.write(line + '\n');
  });
  const notify = (method, params) => send({ jsonrpc: '2.0', method, ...(params ? { params } : {}) });
  const close = () => new Promise(res => { proc.on('exit', code => res(code)); proc.stdin.end(); });
  return { request, raw, notify, close, stderr: () => stderr, badLines: () => badLines };
}
const textOf = r => r.result?.content?.map(c => c.text).join('\n') ?? '';

// A copy of the sample in a temp folder, so the reload test can change it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsa-mcp-test-'));
const file = path.join(dir, 'capsa-library.json');
fs.copyFileSync(SAMPLE, file);

const c = client([file]);
let r = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
ok('initialize: protocol, server name, read-only tools capability', r.result?.protocolVersion === '2025-06-18' && r.result?.serverInfo?.name === 'capsa' && !!r.result?.capabilities?.tools);
ok('initialize: an older protocol version is accepted', (await c.request('initialize', { protocolVersion: '2024-11-05' })).result?.protocolVersion === '2024-11-05');
ok('initialize: an unknown version falls back to the newest', (await c.request('initialize', { protocolVersion: '1999-01-01' })).result?.protocolVersion === '2025-06-18');
c.notify('notifications/initialized');

r = await c.request('tools/list');
const names = (r.result?.tools ?? []).map(t => t.name);
ok('tools/list: seven tools', names.length === 7 && ['search_library', 'list_items', 'get_item', 'list_collections', 'render_prompt', 'list_boards', 'get_board_brief'].every(n => names.includes(n)), names.join(', '));
ok('tools/list: every tool is marked read-only and closed-world', r.result.tools.every(t => t.annotations?.readOnlyHint === true && t.annotations?.openWorldHint === false));

r = await c.request('tools/call', { name: 'search_library', arguments: { query: 'release review' } });
ok('search_library finds by title words', /Release review checklist/.test(textOf(r)) && r.result.structuredContent?.items?.[0]?.id === 's-review');
r = await c.request('tools/call', { name: 'search_library', arguments: { query: 'nothing-like-this' } });
ok('search_library with no match says so', /Nothing matches/.test(textOf(r)) && !r.result.isError);
r = await c.request('tools/call', { name: 'list_items', arguments: { type: 'mcp_server' } });
ok('list_items filters by type', r.result.structuredContent?.items?.length === 1 && r.result.structuredContent.items[0].id === 's-files');
r = await c.request('tools/call', { name: 'list_items', arguments: { project: 'Notes app' } });
ok('list_items filters by project', r.result.structuredContent?.items?.length === 2);
r = await c.request('tools/call', { name: 'get_item', arguments: { id: 's-review' } });
ok('get_item returns the text and where it came from', /Act as a release reviewer/.test(textOf(r)) && /example\.com\/release-reviews/.test(textOf(r)));
r = await c.request('tools/call', { name: 'get_item', arguments: { id: 'nope' } });
ok('get_item with an unknown id is a tool error, not a crash', r.result?.isError === true);
r = await c.request('tools/call', { name: 'list_collections' });
ok('list_collections counts items', /Prompts I reuse · 1 item/.test(textOf(r)) && /Notes app · 2 items/.test(textOf(r)));
r = await c.request('tools/call', { name: 'render_prompt', arguments: { id: 's-cover', vars: { subject: 'a lighthouse' } } });
ok('render_prompt fills a blank and lists the open one', r.result.structuredContent?.text?.startsWith('a lighthouse at dusk') && r.result.structuredContent.open.includes('film stock'));
ok('render_prompt keeps model parameters', /--ar 16:9/.test(r.result.structuredContent?.text ?? ''));
r = await c.request('tools/call', { name: 'list_boards' });
ok('list_boards lists the board', /Calm onboarding/.test(textOf(r)) && r.result.structuredContent?.boards?.[0]?.references === 1);
r = await c.request('tools/call', { name: 'get_board_brief', arguments: { board: 'calm' } });
ok('get_board_brief by part of the title', /Design brief: Calm onboarding/.test(textOf(r)));
r = await c.request('tools/call', { name: 'no_such_tool' });
ok('an unknown tool is a JSON-RPC error', r.error?.code === -32602);

r = await c.request('prompts/list');
ok('prompts/list: saved prompts with their blanks as arguments', (r.result?.prompts ?? []).some(p => (p.arguments ?? []).some(a => a.name.includes('film'))));
r = await c.request('resources/list');
ok('resources/list: items and board briefs', (r.result?.resources ?? []).some(x => x.uri === 'capsa://item/s-review') && r.result.resources.some(x => x.uri === 'capsa://board/b-calm/brief'));
r = await c.request('resources/read', { uri: 'capsa://item/s-files' });
ok('resources/read returns an item as Markdown', r.result?.contents?.[0]?.mimeType === 'text/markdown' && /Filesystem server/.test(r.result.contents[0].text));
r = await c.request('resources/read', { uri: 'file:///etc/passwd' });
ok('resources/read refuses any other URI', r.error?.code === -32002);

r = await c.request('no/such/method');
ok('an unknown method is -32601', r.error?.code === -32601);
r = await c.raw('{not json', null);
ok('a line that is not JSON is a parse error', r.error?.code === -32700);

// The server re-reads the file when it changes on disk.
const lib = JSON.parse(fs.readFileSync(file, 'utf8'));
lib.items.push({ ...lib.items[0], id: 's-new', title: 'Freshly added item' });
fs.writeFileSync(file, JSON.stringify(lib));
const later = new Date(Date.now() + 2000); fs.utimesSync(file, later, later);
r = await c.request('tools/call', { name: 'search_library', arguments: { query: 'freshly added' } });
ok('a changed file is read again', r.result.structuredContent?.items?.[0]?.id === 's-new');

ok('stdout carried only JSON-RPC lines', c.badLines() === 0);
ok('logs go to stderr', /ready \(read-only\)/.test(c.stderr()));
ok('exits 0 when stdin closes', (await c.close()) === 0);

// No file, and a file that isn't a library: clear errors, no crash.
const none = client([]);
r = await none.request('tools/call', { name: 'list_items' });
ok('no library file: a tool error that says what to pass', r.result?.isError === true && /No library file given/.test(textOf(r)));
await none.close();
const bad = path.join(dir, 'other.json'); fs.writeFileSync(bad, '{"format":"something-else","items":[]}');
const wrong = client([bad]);
r = await wrong.request('tools/call', { name: 'list_items' });
ok('a file in another format is refused', r.result?.isError === true && /not a Capsa library file/.test(textOf(r)));
await wrong.close();

// Names from before the rename to Capsa (29 Oct 2026): configs naming the old server path, the old format id and the old
// resource addresses keep working.
{
  const oldFile = path.join(dir, 'librarykit-library.json');
  fs.writeFileSync(oldFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(SAMPLE, 'utf8')), app: 'LibraryKit', format: 'librarykit.mcp.v1' }));
  // the old server path exists only where the old checkout did (not in the public repository)
  const stub = path.join(HERE, '../librarykit-mcp/server.mjs');
  const old = client([oldFile], {}, fs.existsSync(stub) ? stub : SERVER);
  const init = await old.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  ok(`old names: ${fs.existsSync(stub) ? 'packages/librarykit-mcp/server.mjs still starts' : 'it starts'} the server`, init.result?.serverInfo?.name === 'capsa');
  const listed = await old.request('tools/call', { name: 'list_items', arguments: {} });
  ok('old names: a librarykit.mcp.v1 file loads', listed.result && !listed.result.isError && /id /.test(textOf(listed)), textOf(listed).slice(0, 120));
  const first = JSON.parse(fs.readFileSync(SAMPLE, 'utf8')).items[0].id;
  const res = await old.request('resources/read', { uri: `librarykit://item/${encodeURIComponent(first)}` });
  ok('old names: a librarykit:// item address still reads', !!res.result?.contents?.[0]?.text);
  await old.close();
  const viaEnv = client([], { LIBRARYKIT_FILE: oldFile });
  const r2 = await viaEnv.request('tools/call', { name: 'list_items', arguments: {} });
  ok('old names: LIBRARYKIT_FILE still names the file', r2.result && !r2.result.isError, textOf(r2).slice(0, 120));
  await viaEnv.close();
}

// Never writes, never opens a network connection, no dependencies.
const src = fs.readFileSync(SERVER, 'utf8') + fs.readFileSync(path.join(HERE, 'library.mjs'), 'utf8');
ok('no network modules, no fetch, no require', !/from ['"](node:)?(net|http|https|http2|dgram|tls)['"]|fetch\(|require\(/.test(src));
ok('no file writes', !/writeFile|appendFile|createWriteStream|mkdir|unlink|rmSync|renameSync/.test(src));
ok('no dependencies', !JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).dependencies);
ok('the sample file is a valid library file', JSON.parse(fs.readFileSync(SAMPLE, 'utf8')).format === 'capsa.mcp.v1');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} MCP server checks passed`);
process.exit(fail ? 1 : 0);
