// No stray LibraryKit (issue #113). Lists every tracked file whose path or text still says LibraryKit, librarykit,
// Library Kit or uses the old lk- / lk_ / LK_ / lk. prefixes, and fails on any outside the allowed list below.
// Usage: node verify/rename/leftovers.mjs        (from apps/web; reads the whole repository through git)
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20, cwd: ROOT });
// Names of kept historical files and folders: a current file may point at them by path (a link, a source note).
const HISTORICAL_PATH = /librarykit-ui-v1|v2-librarykit-pixel|LibraryKit_[A-Za-z0-9_.\-]+\.(md|pdf|html)/g;
const NAME = /library\s?kit/i;
const PREFIX = /(?<![A-Za-z0-9_$-])(lk[-_.]|LK_|--lk-)|(?<![A-Za-z0-9_$])lk(?![A-Za-z0-9_])/;

/** [path pattern, why it may keep the old name] */
const ALLOWED = [
  // dated records keep their wording, with a note at the top
  [/^docs\/(planning|product)\//, 'historical record'],
  [/^docs\/specs\/LibraryKit_/, 'historical record'],
  [/^docs\/design\/ux-audit-2026-10-22\.md$/, 'historical record'],
  [/^docs\/open-source\/STAGE_A_AUDIT\.md$/, 'historical record (title renamed)'],
  [/^prototypes\/librarykit-ui-v1\//, 'historical prototype'],
  [/^tools\/prd-pdf\//, 'renders the historical PRD'],
  [/^design-references\/design-system\/retired\//, 'retired pixel face'],
  [/^design-references\/brand\/identity\/retired\//, 'retired marks'],
  [/^design-references\/mockups\/brand\.html$/, 'historical mark exploration'],
  [/^apps\/web\/src\/lib\/changelog\.ts$/, 'past changelog entries, and the rename entry'],
  // the code that reads the old names, and its tests
  [/^apps\/web\/src\/lib\/legacy\.ts$/, 'migration: old database and key names'],
  [/^apps\/web\/public\/sw\.js$/, 'migration: old cache prefix'],
  [/^packages\/capsa-mcp\/(library|server|test)\.mjs$/, 'compatibility: old file name, format id, variable, addresses'],
  [/^packages\/capsa-mcp\/package\.json$/, 'compatibility: librarykit-mcp bin alias'],
  [/^packages\/capsa\/(capsa|test)\.mjs$/, 'compatibility: old variable and command'],
  [/^packages\/capsa\/package\.json$/, 'compatibility: lk bin alias'],
  [/^packages\/(librarykit-mcp|lk)\//, 'compatibility: the old paths, kept for existing configs'],
  [/^packages\/(capsa-mcp|capsa)\/README\.md$/, 'npm READMEs: the old command, file and format names still work'],
  [/^apps\/web\/verify\/rename\//, 'the migration test and this check'],
  // where the old name is the point
  [/^README\.md$/, 'says the project was called LibraryKit; the current Vercel address'],
  [/^TRADEMARKS\.md$/, 'reserves the old name and marks too'],
  [/^SECURITY\.md$/, 'the current Vercel address'],
  [/^docs\/GIT\.md$/, 'the repository name until it is renamed'],
  [/^design-references\/README\.md$/, 'the current Vercel address'],
  [/^docs\/release\/(CAPSA_RENAME_EXTERNAL|PUBLIC_RELEASE_PLAN)\.md$/, 'external steps still to run; the old repo name'],
  [/^tools\/vercel\/deploy\.sh$/, 'the Vercel project and alias until they are renamed'],
  [/^tools\/reference-board\/sync-picks\.mjs$/, 'the Vercel project until it is renamed'],
  [/^tools\/release\/public\/README\.md$/, 'says old files still load'],
  // third-party code (minified OCR engine) where "lk" is a variable
  [/^apps\/web\/public\/typehints\//, 'third-party'],
  // a variable named for a lower-cased key, not the old name
  [/^apps\/web\/src\/components\/easel\/Canvas\.tsx$/, 'lk = lower-cased key'],
  [/^tools\/component-study\/crawl\.mjs$/, 'lk = the look setting'],
];

const files = git('ls-files', '-z').split('\0').filter(Boolean).filter(f => !/^(private|\.claude)\//.test(f));
const hits = new Map();
for (const f of files) if (NAME.test(f) || PREFIX.test(f.split('/').pop())) hits.set(f, ['path']);
const grep = (re, flags) => { try { return git('grep', '-I', '-l', flags, '-e', re, '--', '.', ':!private', ':!.claude').split('\n').filter(Boolean); } catch { return []; } };
for (const f of grep('library ?kit', '-iE')) hits.set(f, [...(hits.get(f) ?? []), 'name']);
for (const f of grep('(^|[^A-Za-z0-9_$-])(lk[-_.]|LK_)|--lk-|(^|[^A-Za-z0-9_$])lk([^A-Za-z0-9_]|$)', '-E')) hits.set(f, [...(hits.get(f) ?? []), 'prefix']);

const stray = [], allowed = {};
for (const [f, why] of [...hits].sort()) {
  const a = ALLOWED.find(([re]) => re.test(f));
  if (a) { (allowed[a[1]] ??= []).push(f); continue; }
  // only paths to historical files? then it isn't a leftover
  const text = why.includes('path') ? f : fs.readFileSync(path.join(ROOT, f), 'utf8');
  const rest = text.replace(HISTORICAL_PATH, '');
  if (!NAME.test(rest) && !(why.includes('prefix') && PREFIX.test(rest))) { (allowed['points at a historical file by its path'] ??= []).push(f); continue; }
  stray.push(`${f} (${why.join(', ')})`);
}
for (const [why, fs] of Object.entries(allowed)) console.log(`allowed  ${String(fs.length).padStart(3)}  ${why}`);
console.log(`\n${hits.size} files mention an old name; ${hits.size - stray.length} are allowed; ${stray.length} stray`);
if (stray.length) { console.log('\nStray:\n' + stray.map(s => '  ' + s).join('\n')); process.exit(1); }
