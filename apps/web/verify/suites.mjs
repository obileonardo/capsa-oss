// Runs a set of browser suites against one server, one after another (or two at a time), and prints how each went. Used
// by CI (.github/workflows/checks.yml) and handy locally. Every suite still runs on its own as before.
//
//   CAPSA_BASE=http://127.0.0.1:3100 node verify/suites.mjs pr [chromium|webkit|all]
//   CAPSA_BASE=http://127.0.0.1:3100 node verify/suites.mjs full [chromium|webkit|all]
//   CAPSA_BASE=http://127.0.0.1:3100 node verify/suites.mjs shell,library/verify.mjs [chromium|webkit|all]
//   add --jobs 2 to run two suites at a time (each still in its own browser); output is printed per suite when it ends
//
// pr    the quick set every pull request runs (CI, against `next start`): the shell, the accessibility sweep, capture
//       attachments and the MCP end-to-end test.
// full  every browser suite that needs nothing but the app, against `next dev` (several suites find CSS-module classes
//       by their dev names). Left out: board-study (needs the reference board built, its local server and a Blob token)
//       and pwa (needs a production server; run it on its own after `next build`).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** [file, takes an engine argument] */
const PR = [
  ['verify/a11y/sweep.mjs', true],
  ['verify/shell/verify.mjs', true],
  ['verify/capture/attach.mjs', true],
  ['verify/mcp/mcp-e2e.mjs', true],
];
const REST = [
  ['verify/library/verify.mjs', true],
  // its last part plays the videos in WebKit (H.264), so it needs WebKit installed even in a Chromium run
  ['verify/learn-connect/verify.mjs', false],
  ['verify/sidebar/verify.mjs', true], ['verify/inbox/verify.mjs', true], ['verify/boards/verify.mjs', true],
  ['verify/settings/verify.mjs', true], ['verify/press/verify.mjs', true], ['verify/review/verify.mjs', true],
  ['verify/style/style-test.mjs', true], ['verify/brand/verify.mjs', true], ['verify/paper/verify.mjs', true],
  ['verify/ask/verify.mjs', true], ['verify/organise/verify.mjs', true], ['verify/imports/verify.mjs', true],
  ['verify/libraries/verify.mjs', true], ['verify/rename/verify.mjs', true], ['verify/library-panel/verify.mjs', true], ['verify/activity-learn/verify.mjs', true],
  ['verify/learn-guides/verify.mjs', true], ['verify/invite/verify.mjs', true], ['verify/libimage/verify.mjs', true],
  ['verify/settings-profile/verify.mjs', true], ['verify/easel/verify.mjs', true], ['verify/easel/tools.mjs', true],
  ['verify/trackc/verify.mjs', true], ['verify/typehints/verify.mjs', true], ['verify/a11y/zoom.mjs', true],
  ['verify/perf/perf-1000.mjs', true], ['verify/avatar/verify.mjs', true], ['verify/d1/verify.mjs', true],
  ['verify/design-system/verify.mjs', true], ['verify/playground/verify.mjs', false], ['verify/lab/verify.mjs', false],
];

const argv = process.argv.slice(2);
const ji = argv.indexOf('--jobs');
const JOBS = ji >= 0 ? Math.max(1, Number(argv.splice(ji, 2)[1]) || 1) : 1;
const [set = 'pr', engine = 'chromium'] = argv;
const all = [...PR, ...REST];
const chosen = set === 'pr' ? PR : set === 'full' ? all
  : set.split(',').map(s => all.find(([f]) => f === s || f === `verify/${s}` || f === `verify/${s}/verify.mjs`) ?? [s.startsWith('verify/') ? s : `verify/${s}`, true]);

const run = ([file, takesEngine]) => new Promise(resolve => {
  const t0 = Date.now();
  let text = '';
  const p = spawn(process.execPath, [file, ...(takesEngine ? [engine] : [])], { cwd: WEB, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = d => { if (JOBS === 1) process.stdout.write(d); text += d; };
  p.stdout.on('data', out); p.stderr.on('data', out);
  p.on('close', code => {
    const lines = text.trim().split('\n');
    resolve({ file, code, s: Math.round((Date.now() - t0) / 1000), last: (lines[lines.length - 1] || '').slice(0, 160), text });
  });
});

const results = [];
const queue = [...chosen];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) {
    const s = queue.shift();
    if (JOBS === 1) console.log(`\n::group::${s[0]}`);
    const r = await run(s);
    if (JOBS > 1) console.log(`\n::group::${s[0]}\n${r.text}`);
    console.log('::endgroup::');
    results.push(r);
  }
}));
results.sort((a, b) => chosen.findIndex(([f]) => f === a.file) - chosen.findIndex(([f]) => f === b.file));
console.log('\nSuite results');
for (const r of results) console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${String(r.s).padStart(4)} s  ${r.file}  ${r.last}`);
const failed = results.filter(r => r.code !== 0);
console.log(`${results.length - failed.length}/${results.length} suites passed`);
process.exit(failed.length ? 1 : 0);
