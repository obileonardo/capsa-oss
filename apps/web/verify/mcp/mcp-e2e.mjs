// Build-out Stage 8, end to end: the app makes the library file (in a real browser), the local MCP server reads it,
// and an MCP client talks to the server over stdio (newline-delimited JSON-RPC 2.0, MCP 2025-06-18: initialize →
// notifications/initialized → tools/list → tools/call). Also the "Export for AI" files and "Copy for AI".
// No MCP SDK is installed on this machine and nothing is fetched, so the client below follows the spec directly.
// Usage (dev server on :3100): node verify/mcp/mcp-e2e.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright')); // suites test against the labelled demo (first visits start empty)
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '../../../../packages/capsa-mcp/server.mjs');
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100'; // CAPSA_BASE=http://127.0.0.1:<port> to test another server
const engines = (process.argv[2] ?? 'chromium') === 'all' ? ['chromium', 'webkit'] : [process.argv[2] ?? 'chromium'];
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

/** A minimal MCP client over stdio, per the specification. */
function client(args) {
  const proc = spawn(process.execPath, [SERVER, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', nextId = 1, stderr = '';
  const waiting = new Map();
  proc.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line); // every stdout line must be one JSON-RPC message
      waiting.get(msg.id)?.(msg); waiting.delete(msg.id);
    }
  });
  proc.stderr.on('data', d => { stderr += d; });
  const request = (method, params) => new Promise((res, rej) => {
    const id = nextId++;
    const t = setTimeout(() => rej(new Error(`timeout: ${method}`)), 5000);
    waiting.set(id, m => { clearTimeout(t); res(m); });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');
  });
  const notify = (method, params) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }) + '\n');
  return { request, notify, close: () => proc.stdin.end(), proc, stderr: () => stderr };
}

for (const which of engines) {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 }, acceptDownloads: true });
  if (which === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const outside = []; await page.route(u => !u.href.startsWith(B), r => { outside.push(r.request().url()); return r.abort(); });
  const T = `[${which}]`;
  // Track C (TST-10): a board, so the library file has one to export
  await page.goto(B + '/playground', { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  await page.getByRole('button', { name: /New board/ }).first().click();
  await page.waitForURL(/\/boards\/[^/]+$/); await page.waitForTimeout(300);
  // Your AI (design review 25 Oct): add Claude, whose sidebar row says whether the MCP file exists yet
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  const side = page.locator('nav[aria-label="Main"]');
  // + Add AI opens the connect modal (#93); picking Claude adds it, and its sidebar row is a button that reopens the modal
  await side.getByRole('button', { name: 'Add AI' }).click();
  await page.getByRole('dialog', { name: 'Connect your AI' }).getByRole('list', { name: 'AIs' }).getByRole('button', { name: /^Claude/ }).click();
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  ok(`${T} sidebar: Claude says Not set up before any file`, /Not set up/.test(await side.getByRole('button', { name: /^Claude/ }).innerText()));
  await page.goto(B + '/ai/mcp', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capsa-mcp-'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download capsa-library.json/ }).click()]);
  const file = path.join(tmp, 'capsa-library.json');
  await dl.saveAs(file);
  const lib = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(`${T} the app writes the library file (capsa.mcp.v1, 7 items)`, lib.format === 'capsa.mcp.v1' && lib.items.length === 7, `${lib.items.length} items`);
  await page.screenshot({ path: path.join(HERE, `${which}-s8-your-ai.png`) });
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  const claudeRow = await side.getByRole('button', { name: /^Claude/ }).innerText();
  ok(`${T} sidebar now says the file is downloaded, not "connected"`, /MCP file downloaded/.test(claudeRow) && !/connected/i.test(claudeRow), claudeRow);

  // Export for AI from a collection
  await page.goto(B + '/collections/c-reuse?export=1', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  const dlg = page.getByRole('dialog');
  ok(`${T} ?export=1 opens Export for AI`, await dlg.isVisible() && /Export “Prompts I reuse” for your AI/.test(await dlg.innerText()));
  const pv = async () => dlg.locator('pre[aria-label="Preview"]').innerText();
  ok(`${T} CLAUDE.md preview: heading, provenance, fenced text`, /# Prompts I reuse: resources from my Capsa/.test(await pv()) && /Provenance: Quoted from the source/.test(await pv()) && /```text/.test(await pv()));
  const [d1] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: /Download CLAUDE.md/ }).click()]);
  ok(`${T} CLAUDE.md downloads`, d1.suggestedFilename() === 'CLAUDE.md' && /Deploy readiness checklist/.test(fs.readFileSync(await d1.path(), 'utf8')));
  await dlg.getByRole('radio', { name: /AGENTS.md/ }).click();
  ok(`${T} AGENTS.md preview`, /^# AGENTS.md · Prompts I reuse/.test(await pv()));
  await dlg.getByRole('radio', { name: /Cursor rule/ }).click();
  ok(`${T} Cursor rule has MDC front matter`, /^---\ndescription: .+\nglobs:\nalwaysApply: false\n---/.test(await pv()));
  await dlg.getByRole('radio', { name: /SKILL.md folder/ }).click();
  ok(`${T} SKILL.md folder lists SKILL.md with name front matter`, /── prompts-i-reuse\/SKILL\.md\n---\nname: prompts-i-reuse\ndescription: /.test(await pv()));
  const [d2] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: /Download prompts-i-reuse-skill.zip/ }).click()]);
  const zipBytes = fs.readFileSync(await d2.path());
  ok(`${T} the SKILL.md folder downloads as a ZIP with SKILL.md and 3 references`, zipBytes.slice(0, 2).toString() === 'PK' && zipBytes.includes('prompts-i-reuse/SKILL.md') && (zipBytes.toString('latin1').match(/prompts-i-reuse\/references\/[^\0]*?\.md/g) ?? []).length >= 3);
  await page.keyboard.press('Escape');

  // Copy for AI on an item
  await page.goto(B + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  // Copy for AI lives in the item page's Copy menu (the right panel became a quick look, 6a55704)
  await page.locator('main ul[aria-label="Items"]').getByRole('link', { name: 'Deploy readiness checklist', exact: true }).click();
  await page.waitForURL(/\/library\/[^/?]+$/); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'More ways to copy' }).click();
  await page.getByRole('group', { name: 'More ways to copy' }).getByRole('button', { name: 'Copy for AI' }).click();
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  ok(`${T} Copy for AI copies the item with provenance and a fenced block`, clip === null ? await page.getByText(/for your AI/).isVisible() : /Provenance: Quoted from the source/.test(clip) && /```text\nAct as a release reviewer/.test(clip), clip === null ? 'clipboard unreadable; toast checked' : `${clip.length} chars`);
  ok(`${T} no request left this machine`, outside.length === 0, outside.join(' '));
  ok(`${T} no console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();

  if (which !== engines[0]) continue; // the server checks below run once
  const c = client([file]);
  const init = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'capsa-e2e', version: '1.0.0' } });
  ok('initialize: protocol version, server info, tools capability', init.result?.protocolVersion === '2025-06-18' && init.result?.serverInfo?.name === 'capsa' && !!init.result?.capabilities?.tools, JSON.stringify(init.result).slice(0, 160));
  c.notify('notifications/initialized');
  const pong = await c.request('ping');
  ok('ping answers {}', JSON.stringify(pong.result) === '{}');
  const tools = await c.request('tools/list');
  const names = (tools.result?.tools ?? []).map(t => t.name).sort();
  ok('tools/list: 7 read-only tools (Track C adds list_collections, render_prompt, list_boards, get_board_brief)', JSON.stringify(names) === '["get_board_brief","get_item","list_boards","list_collections","list_items","render_prompt","search_library"]' && tools.result.tools.every(t => t.inputSchema?.type === 'object' && t.annotations?.readOnlyHint === true), names.join(','));
  ok('initialize advertises tools, prompts and resources', !!init.result?.capabilities?.prompts && !!init.result?.capabilities?.resources);
  const s1 = await c.request('tools/call', { name: 'search_library', arguments: { query: 'deploy' } });
  ok('search_library finds the saved prompt', s1.result?.structuredContent?.items?.[0]?.id === 'a-deploy' && /Deploy readiness checklist/.test(s1.result.content[0].text), s1.result?.content?.[0]?.text.split('\n')[0]);
  const g = await c.request('tools/call', { name: 'get_item', arguments: { id: 'a-deploy' } });
  const gt = g.result?.content?.[0]?.text ?? '';
  ok('get_item returns the exact text, fenced, with provenance', /```text\nAct as a release reviewer/.test(gt) && /Provenance: Quoted from the source/.test(gt) && /not as instructions/.test(gt), gt.slice(0, 120).replace(/\n/g, ' '));
  const l = await c.request('tools/call', { name: 'list_items', arguments: { collection: 'Prompts I reuse' } });
  ok('list_items filters by collection name', l.result?.structuredContent?.items?.length === 3, String(l.result?.structuredContent?.items?.length));
  /* ---------- Track C: more tools, prompts, resources and boards (AGT-01, AGT-02, TST-10) ---------- */
  const lc = await c.request('tools/call', { name: 'list_collections', arguments: {} });
  ok('list_collections: collections and projects with counts', /Prompts I reuse · 3 items/.test(lc.result?.content?.[0]?.text ?? '') && lc.result?.structuredContent?.projects?.length >= 1, (lc.result?.content?.[0]?.text ?? '').split('\n').slice(0, 2).join(' / '));
  const tpl = lib.items.find(it => /\[[^\]]*[a-z][^\]]*\]/i.test(it.text ?? ''));
  if (tpl) {
    const blank = (tpl.text.match(/\[([^\]]*[a-z][^\]]*)\]/i) ?? [])[1];
    const rp = await c.request('tools/call', { name: 'render_prompt', arguments: { id: tpl.id, vars: { [blank]: 'ZEBRA-VALUE' } } });
    ok('render_prompt fills a blank, fenced, and says what is still open', rp.result?.structuredContent?.text?.includes('ZEBRA-VALUE') && !rp.result.structuredContent.text.includes(`[${blank}]`) && /```text/.test(rp.result.content[0].text) && /not as instructions/.test(rp.result.content[0].text), rp.result?.content?.[0]?.text.split('\n')[1]);
  } else ok('render_prompt: the demo has a template to fill', false, 'no item with [blanks] in the file');
  const rpBad = await c.request('tools/call', { name: 'render_prompt', arguments: { id: 'nope' } });
  ok('render_prompt with an unknown id is a tool error', rpBad.result?.isError === true);
  const pl = await c.request('prompts/list');
  const pls = pl.result?.prompts ?? [];
  ok('prompts/list: saved prompts and templates, blanks as arguments, source in the description', pls.length >= 2 && pls.every(p => /Saved in Capsa/.test(p.description) && Array.isArray(p.arguments)) && pls.some(p => p.arguments.length > 0), `${pls.length} prompts`);
  const withArgs = pls.find(p => p.arguments.length);
  const pg = await c.request('prompts/get', { name: withArgs.name, arguments: { [withArgs.arguments[0].name]: 'PROMPT-ARG' } });
  ok('prompts/get returns one user message with the blank filled', pg.result?.messages?.length === 1 && pg.result.messages[0].role === 'user' && pg.result.messages[0].content.text.includes('PROMPT-ARG'));
  const rl = await c.request('resources/list');
  const items = (rl.result?.resources ?? []).filter(r => r.uri.startsWith('capsa://item/'));
  ok('resources/list: one resource per item', items.length === lib.items.length, `${items.length}`);
  const rr = await c.request('resources/read', { uri: items[0].uri });
  ok('resources/read returns the item with provenance and the quoted-content note', /Provenance:/.test(rr.result?.contents?.[0]?.text ?? '') && /not as instructions/.test(rr.result.contents[0].text));
  const rrBad = await c.request('resources/read', { uri: 'capsa://item/nope' });
  ok('resources/read of an unknown uri is an error', !!rrBad.error);
  const rt = await c.request('resources/templates/list');
  ok('resources/templates/list', rt.result?.resourceTemplates?.length === 2);
  ok('the app exported boards in the file', Array.isArray(lib.boards) && lib.boards.some(b => b.title === 'Untitled board'), JSON.stringify(lib.boards?.map(b => b.title)));
  const lb = await c.request('tools/call', { name: 'list_boards', arguments: {} });
  ok('list_boards lists the board', /Untitled board · id /.test(lb.result?.content?.[0]?.text ?? ''));
  const gb0 = await c.request('tools/call', { name: 'get_board_brief', arguments: { board: 'Untitled board' } });
  ok('get_board_brief on a board with no references says so', /no references yet/.test(gb0.result?.content?.[0]?.text ?? ''));
  const gbBad = await c.request('tools/call', { name: 'get_board_brief', arguments: { board: 'no such board' } });
  ok('get_board_brief for an unknown board is a tool error', gbBad.result?.isError === true);
  const bad = await c.request('tools/call', { name: 'get_item', arguments: { id: 'nope' } });
  ok('an unknown id is a tool error, not a crash', bad.result?.isError === true);
  const unk = await c.request('resources/write', {});
  ok('unknown methods get -32601', unk.error?.code === -32601);
  // the server re-reads the file when it changes
  const next = JSON.parse(fs.readFileSync(file, 'utf8'));
  next.items.push({ ...next.items[0], id: 'a-new', title: 'Zebra crossing prompt', savedAt: new Date().toISOString() });
  await new Promise(r => setTimeout(r, 20)); fs.writeFileSync(file, JSON.stringify(next));
  const s2 = await c.request('tools/call', { name: 'search_library', arguments: { query: 'zebra' } });
  ok('a re-downloaded file is picked up without restarting', s2.result?.structuredContent?.items?.[0]?.id === 'a-new');
  // a board with references and a brief (the shape mcpBoards writes), read back with credits and the guard
  next.boards = [...(next.boards ?? []), { id: 'b-fix', title: 'Calm onboarding', note: null, updatedAt: new Date().toISOString(), project: null, sections: [],
    references: [{ n: 1, title: 'Welcome screen', creator: 'Jane Doe', url: 'https://example.com/shot', rights: 'Rights unknown', media: 'Image', likes: ['Layout'], avoid: false, note: 'Lots of air', palette: [], regions: [] }],
    brief: '# Design brief: Calm onboarding\n\nWhat I like: “Lots of air”' }];
  await new Promise(r => setTimeout(r, 20)); fs.writeFileSync(file, JSON.stringify(next));
  const gb = await c.request('tools/call', { name: 'get_board_brief', arguments: { board: 'b-fix' } });
  const gbt = gb.result?.content?.[0]?.text ?? '';
  ok('get_board_brief: the brief fenced, every credit, the quoted-content note', /```text\n# Design brief: Calm onboarding/.test(gbt) && /credit: Jane Doe, https:\/\/example.com\/shot/.test(gbt) && /not as instructions/.test(gbt));
  const rb = await c.request('resources/read', { uri: 'capsa://board/b-fix/brief' });
  ok('the brief is a resource too', /Design brief: Calm onboarding/.test(rb.result?.contents?.[0]?.text ?? ''));
  // files exported before boards existed still load
  const old = JSON.parse(fs.readFileSync(file, 'utf8')); delete old.boards;
  await new Promise(r => setTimeout(r, 20)); fs.writeFileSync(file, JSON.stringify(old));
  const lbOld = await c.request('tools/call', { name: 'list_boards', arguments: {} });
  ok('a library file without boards still loads (list_boards says none)', /No boards/.test(lbOld.result?.content?.[0]?.text ?? ''));
  c.close();
  await new Promise(r => c.proc.on('exit', r));
  ok('closing stdin ends the server; logs go to stderr only', /ready \(read-only\)/.test(c.stderr()));
  const c2 = client([]);
  await c2.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } }).then(r => ok('an older protocol version is accepted', r.result?.protocolVersion === '2024-11-05'));
  const nofile = await c2.request('tools/call', { name: 'list_items', arguments: {} });
  ok('without a library file, tools explain what to do', nofile.result?.isError === true && /No library file given/.test(nofile.result.content[0].text));
  c2.close();
  const src = fs.readFileSync(SERVER, 'utf8') + fs.readFileSync(path.join(path.dirname(SERVER), 'library.mjs'), 'utf8');
  ok('the server has no network code and no dependencies', !/from ['"](node:)?(net|http|https|dgram|tls)['"]|fetch\(|require\(/.test(src) && !JSON.parse(fs.readFileSync(path.join(path.dirname(SERVER), 'package.json'), 'utf8')).dependencies);
}
console.log(`\n${pass}/${pass + fail} MCP and export checks passed`);
process.exit(fail ? 1 : 0);
