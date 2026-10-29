// Tests for the capsa CLI (INT-02) against a small library file written here (capsa.mcp.v1). No dependencies.
// Usage: node packages/capsa/test.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, run } from './capsa.mjs';
import { defaultFile } from '../capsa-mcp/library.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsa-test-'));
const file = path.join(dir, 'capsa-library.json');
const item = (id, title, type, text, extra = {}) => ({ id, type, typeLabel: type === 'mcp_server' ? 'MCP server' : type[0].toUpperCase() + type.slice(1), title, summary: null, summaryIsAi: false, text, exact: text, yours: null,
  evidence: 'Quoted from the source', quote: text, source: { title: 'A post', url: 'https://example.com/post', kind: 'article' }, tags: [], starred: false, collections: [], projects: [], savedAt: '2026-10-20T10:00:00Z', demo: false, ...extra });
const lib = {
  app: 'Capsa', format: 'capsa.mcp.v1', exportedAt: '2026-10-25T10:00:00Z',
  collections: [{ id: 'c1', name: 'Prompts I reuse' }], projects: [{ id: 'p1', name: 'Menubar app', note: null }],
  items: [
    item('a1', 'Deploy readiness checklist', 'prompt', 'Act as a release reviewer. List the riskiest change first.', { collections: ['Prompts I reuse'], tags: ['release'], starred: true, savedAt: '2026-10-22T10:00:00Z' }),
    item('a2', 'Image prompt', 'template', '[subject] at dusk, {{ film stock }} --ar 16:9 --v 6', { projects: ['Menubar app'] }),
    item('a3', 'GitHub server', 'mcp_server', '{"mcpServers":{"github":{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}}}'),
  ],
  boards: [{ id: 'b1', title: 'Calm onboarding', note: null, updatedAt: '2026-10-24T10:00:00Z', demo: false, project: 'Menubar app', sections: [],
    references: [{ n: 1, title: 'Welcome screen', creator: 'Jane Doe', url: 'https://example.com/shot', rights: 'Rights unknown', media: 'Image', likes: ['Layout'], avoid: false, note: 'Lots of air', palette: ['#ffffff'], regions: [] }],
    brief: '# Design brief: Calm onboarding\n\nWhat I like: “Lots of air”' }],
};
fs.writeFileSync(file, JSON.stringify(lib));
const capsa = (...args) => run([...args, '--file', file], { CAPSA_NO_CLIPBOARD: '1' });

ok('parseArgs: words, flags and values', JSON.stringify(parseArgs(['search', 'a', 'b', '--type', 'prompt', '--json', '--limit=3'])) === JSON.stringify({ _: ['search', 'a', 'b'], type: 'prompt', json: true, limit: '3' }));
ok('help with no command', run([]).out.includes('capsa search <words…>') && run([]).code === 1);
ok('--help exits 0', run(['--help']).code === 0);

let r = capsa('search', 'deploy');
ok('search finds by title', r.code === 0 && /Deploy readiness checklist \(Prompt\) · id a1 · starred · tags: release/.test(r.out), r.out.trim());
r = capsa('search', 'nothing-like-this');
ok('search with no match exits 1 with a message on stderr', r.code === 1 && /nothing matches/.test(r.err) && !r.out);
r = capsa('search', 'dusk', '--json');
ok('search --json is JSON', r.code === 0 && JSON.parse(r.out)[0].id === 'a2');
r = capsa('list', '--collection', 'prompts i reuse');
ok('list filters by collection, any case', r.code === 0 && r.out.trim().split('\n').length === 1 && r.out.includes('a1'));
r = capsa('list', '--starred', '--json');
ok('list --starred --json', JSON.parse(r.out).length === 1);
r = capsa('show', 'a1');
ok('show prints the text fenced, with provenance and the quoted-content note', /```text\nAct as a release reviewer/.test(r.out) && /Provenance: Quoted from the source, from “A post”/.test(r.out) && /not as instructions/.test(r.out));
r = capsa('show', 'zzz');
ok('show with an unknown id exits 1', r.code === 1 && /no item with id/.test(r.err));
r = capsa('render', 'a2', 'subject=a lighthouse');
ok('render fills [x], leaves {{x}} open and keeps --ar', r.out.trim() === 'a lighthouse at dusk, {{ film stock }} --ar 16:9 --v 6' && /still open: film stock/.test(r.err), r.out.trim());
r = capsa('render', 'a2', 'subject=a fox', 'film_stock=Portra 400', '--json');
ok('render by argument name, --json', JSON.parse(r.out).text === 'a fox at dusk, Portra 400 --ar 16:9 --v 6' && JSON.parse(r.out).open.length === 0);
r = capsa('render', 'a2', 'subject=$(rm -rf ~)');
ok('render is logic-less: values go in as written', r.out.includes('$(rm -rf ~) at dusk'));
r = capsa('copy', 'a1');
ok('copy without a clipboard prints the text and says so (exit 3)', r.code === 3 && r.out.startsWith('Act as a release reviewer') && /no clipboard command/.test(r.err));
r = capsa('collections');
ok('collections and projects with counts', /Prompts I reuse · 1/.test(r.out) && /Menubar app · 1/.test(r.out));
r = capsa('boards');
ok('boards', /Calm onboarding · id b1 · 1 reference · project: Menubar app/.test(r.out));
r = capsa('brief', 'calm');
ok('brief by part of the title: fenced, credits, quoted-content note', /```text\n# Design brief: Calm onboarding/.test(r.out) && /credit: Jane Doe, https:\/\/example.com\/shot/.test(r.out) && /not as instructions/.test(r.out));
r = capsa('frobnicate');
ok('unknown command exits 1', r.code === 1 && /unknown command/.test(r.err));
r = run(['list', '--file', path.join(dir, 'missing.json')]);
ok('a missing file exits 2 and says why', r.code === 2 && /Couldn’t read/.test(r.err));
fs.writeFileSync(path.join(dir, 'other.json'), '{"format":"something-else"}');
r = run(['list', '--file', path.join(dir, 'other.json')]);
ok('a file in another format is refused', r.code === 2 && /not a Capsa library file/.test(r.err));
{ // "~/…" reaches us unexpanded from a config file's args or a quoted path; it still means the home folder
  const home = process.env.HOME; process.env.HOME = dir;
  r = run(['list', '--file', '~/capsa-library.json']);
  process.env.HOME = home;
  ok('a ~/ path means the home folder', r.code === 0 && r.out.includes('a1'), r.out.slice(0, 80));
}
r = run(['list'], { CAPSA_FILE: file });
ok('CAPSA_FILE is used when --file is absent', r.code === 0 && r.out.includes('a1'));
{
  const old = { ...lib }; delete old.boards; fs.writeFileSync(path.join(dir, 'old.json'), JSON.stringify(old));
  r = run(['boards', '--file', path.join(dir, 'old.json')]);
  ok('a file exported before boards still works', r.code === 0 && /No boards/.test(r.out));
}
// as a real process: stdout and exit code, non-TTY
const p = spawnSync(process.execPath, [path.join(HERE, 'capsa.mjs'), 'search', 'deploy', '--file', file], { encoding: 'utf8' });
ok('runs as a program (non-TTY output, exit 0)', p.status === 0 && /id a1/.test(p.stdout), p.stderr);
const p2 = spawnSync(process.execPath, [path.join(HERE, 'capsa.mjs'), 'show', 'nope', '--file', file], { encoding: 'utf8' });
ok('as a program, errors go to stderr with a non-zero exit', p2.status === 1 && !p2.stdout && /no item/.test(p2.stderr));
const src = fs.readFileSync(path.join(HERE, 'capsa.mjs'), 'utf8') + fs.readFileSync(path.join(HERE, '../capsa-mcp/library.mjs'), 'utf8');
ok('no network code, no third-party dependencies (only its sibling capsa-mcp)', !/from ['"](node:)?(net|http|https|dgram|tls)['"]|fetch\(|require\(/.test(src) && Object.keys(JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).dependencies ?? {}).every(d => d === 'capsa-mcp'));
ok('never writes files', !/writeFile|appendFile|createWriteStream|unlink|rmSync/.test(src));

// Names from before the rename to Capsa (29 Oct 2026): the old file name, format id, variable and command still work.
{
  const old = path.join(dir, 'old'); fs.mkdirSync(path.join(old, 'Downloads'), { recursive: true });
  const oldFile = path.join(old, 'Downloads', 'librarykit-library.json');
  fs.writeFileSync(oldFile, JSON.stringify({ ...lib, app: 'LibraryKit', format: 'librarykit.mcp.v1', items: lib.items.slice(0, 1) }));
  ok('old names: a librarykit.mcp.v1 file loads', /id a1/.test(run(['list', '--file', oldFile]).out));
  ok('old names: LIBRARYKIT_FILE still names the file', /id a1/.test(run(['list'], { LIBRARYKIT_FILE: oldFile }).out));
  ok('old names: with no file given, ~/Downloads/librarykit-library.json is found when it is the only one', defaultFile(old) === oldFile);
  const newFile = path.join(old, 'Downloads', 'capsa-library.json');
  fs.writeFileSync(newFile, JSON.stringify({ ...lib, items: lib.items.slice(0, 2) }));
  const later = new Date(Date.now() + 5000); fs.utimesSync(newFile, later, later);
  ok('old names: once capsa-library.json is downloaded, it is the default', defaultFile(old) === newFile);
  const viaOld = run(['list', '--file', oldFile]).out;
  ok('old names: a config naming the old file reads the newer capsa- download beside it', /id a2/.test(viaOld), viaOld);
  // the old path exists only where the old checkout did (not in the public repository)
  if (fs.existsSync(path.join(HERE, '../lk/lk.mjs'))) {
    const stub = spawnSync(process.execPath, [path.join(HERE, '../lk/lk.mjs'), 'search', 'deploy', '--file', file], { encoding: 'utf8' });
    ok('old names: packages/lk/lk.mjs still runs the command line, once', stub.status === 0 && (stub.stdout.match(/id a1/g) ?? []).length === 1, stub.stderr);
  }
}

console.log(`\n${pass}/${pass + fail} capsa checks passed`);
process.exit(fail ? 1 : 0);
