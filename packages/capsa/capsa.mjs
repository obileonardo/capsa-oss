#!/usr/bin/env node
/* capsa: Capsa in your terminal (INT-02, Track C, 25 Oct). Reads the same library file as the local MCP server
 * (Your AI › Download capsa-library.json). Read-only, offline, no dependencies. `copy` hands text to your
 * system's clipboard command (pbcopy, wl-copy, xclip, xsel or clip); nothing else runs.
 *
 *   capsa search <words…> [--type t] [--limit n]
 *   capsa list [--type t] [--collection name] [--project name] [--tag t] [--starred] [--limit n]
 *   capsa show <id>
 *   capsa render <id> [name=value …]
 *   capsa copy <id> [name=value …]
 *   capsa collections · capsa boards · capsa brief <board id or title>
 *   Options: --file <path> (or CAPSA_FILE; default ~/Downloads/capsa-library.json), --json */
import { spawnSync } from 'node:child_process';
// In this repository the reader sits beside us; installed from npm it comes from the capsa-mcp package.
const { blanks, boardLine, briefText, defaultFile, findBoard, findItem, full, groups, line, list, loadLibrary, render, search } =
  await import('../capsa-mcp/library.mjs').catch(() => import('capsa-mcp/library.mjs'));

const HELP = `capsa: Capsa in your terminal (read-only, offline)

Usage
  capsa search <words…>          Find items; every word must match
  capsa list                     Newest first (--type, --collection, --project, --tag, --starred)
  capsa show <id>                One item: its text and where it came from
  capsa render <id> [k=v …]      Fill the item's [blanks] or {{blanks}} and print it
  capsa copy <id> [k=v …]        The same, onto the clipboard
  capsa collections              Collections and projects
  capsa boards                   Boards
  capsa brief <board>            A board's design brief (id or title)

Options
  --file <path>   The library file (or CAPSA_FILE). Default: ~/Downloads/capsa-library.json
  --json          Machine-readable output
  --limit <n>     How many results
  -h, --help      This help
`;

export function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--starred') opts[a.slice(2)] = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (/^--(file|type|collection|project|tag|limit)$/.test(a)) opts[a.slice(2)] = argv[++i];
    else if (/^--(file|type|collection|project|tag|limit)=/.test(a)) { const [k, ...v] = a.slice(2).split('='); opts[k] = v.join('='); }
    else opts._.push(a);
  }
  return opts;
}
const varsOf = xs => Object.fromEntries(xs.filter(x => x.includes('=')).map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));

function clip(textOut) {
  const tries = process.platform === 'darwin' ? [['pbcopy', []]] : process.platform === 'win32' ? [['clip', []]] : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];
  for (const [cmd, args] of tries) {
    const r = spawnSync(cmd, args, { input: textOut });
    if (!r.error && r.status === 0) return cmd;
  }
  return null;
}

/** Runs one command. Returns { code, out, err } so the tests can call it without a process. */
export function run(argv, env = process.env) {
  const o = parseArgs(argv);
  const [cmd, ...rest] = o._;
  if (o.help || !cmd) return { code: cmd || o.help ? 0 : 1, out: HELP, err: '' };
  const file = o.file || env.CAPSA_FILE || env.LIBRARYKIT_FILE || defaultFile();
  const { lib, error } = loadLibrary(file);
  if (!lib) return { code: 2, out: '', err: `capsa: ${error}\n` };
  const json = v => ({ code: 0, out: JSON.stringify(v, null, 2) + '\n', err: '' });
  const ok = t => ({ code: 0, out: t.endsWith('\n') ? t : t + '\n', err: '' });
  const bad = (t, code = 1) => ({ code, out: '', err: `capsa: ${t}\n` });
  const limit = o.limit ? Math.max(1, Number(o.limit) || 10) : undefined;
  const brief = it => ({ id: it.id, title: it.title, type: it.type, tags: it.tags ?? [], starred: !!it.starred, savedAt: it.savedAt });

  switch (cmd) {
    case 'search': {
      if (!rest.length) return bad('search needs some words, e.g. capsa search deploy checklist');
      const r = search(lib, { query: rest.join(' '), type: o.type, limit: limit ?? 10 });
      if (o.json) return json(r.map(brief));
      return r.length ? ok(r.map(line).join('\n')) : { code: 1, out: '', err: `capsa: nothing matches “${rest.join(' ')}”\n` };
    }
    case 'list': case 'ls': {
      const r = list(lib, { type: o.type, collection: o.collection, project: o.project, tag: o.tag, starred: o.starred, limit: limit ?? 25 });
      return o.json ? json(r.map(brief)) : r.length ? ok(r.map(line).join('\n')) : ok('No items match.');
    }
    case 'show': case 'get': {
      const it = findItem(lib, rest[0]);
      if (!it) return bad(`no item with id “${rest[0] ?? ''}”. Find ids with capsa search or capsa list`);
      return o.json ? json(it) : ok(full(it));
    }
    case 'render': case 'copy': {
      const it = findItem(lib, rest[0]);
      if (!it) return bad(`no item with id “${rest[0] ?? ''}”. Find ids with capsa search or capsa list`);
      if (!it.text) return bad(`“${it.title}” has no saved text`);
      const r = render(it.text, varsOf(rest.slice(1)));
      if (cmd === 'render') return o.json ? json({ id: it.id, text: r.text, blanks: blanks(it.text), open: r.open }) : { code: 0, out: r.text + '\n', err: r.open.length ? `capsa: still open: ${r.open.join(', ')}\n` : '' };
      const used = env.CAPSA_NO_CLIPBOARD ? null : clip(r.text);
      if (!used) return { code: 3, out: r.text + '\n', err: 'capsa: no clipboard command found (pbcopy, wl-copy, xclip, xsel or clip), so the text is printed instead\n' };
      return { code: 0, out: o.json ? JSON.stringify({ copied: true, id: it.id, open: r.open }) + '\n' : '', err: `capsa: copied “${it.title}”${r.open.length ? ` · still open: ${r.open.join(', ')}` : ''}\n` };
    }
    case 'collections': case 'projects': {
      const g = groups(lib);
      if (o.json) return json(g);
      return ok([
        'Collections', ...(g.collections.length ? g.collections.map(c => `- ${c.name} · ${c.items}`) : ['- none']),
        '', 'Projects', ...(g.projects.length ? g.projects.map(p => `- ${p.name} · ${p.items}`) : ['- none']),
      ].join('\n'));
    }
    case 'boards': return o.json ? json(lib.boards.map(b => ({ id: b.id, title: b.title, references: b.references.length, project: b.project ?? null }))) : ok(lib.boards.length ? lib.boards.map(boardLine).join('\n') : 'No boards in this library file.');
    case 'brief': {
      const b = findBoard(lib, rest.join(' '));
      if (!b) return bad(`no board matches “${rest.join(' ')}”. See capsa boards`);
      return o.json ? json(b) : ok(briefText(b));
    }
    default: return bad(`unknown command “${cmd}”. Try capsa --help`);
  }
}

// Run as a program (not when imported by the tests)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/capsa') || process.argv[1]?.endsWith('/lk') || process.argv[1]?.endsWith('capsa.mjs')) {
  const r = run(process.argv.slice(2));
  if (r.out) process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  process.exitCode = r.code;
}
