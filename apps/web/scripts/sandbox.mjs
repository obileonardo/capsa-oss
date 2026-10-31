// A dev server for testing with a known library, on its own address so its data never mixes with another library.
// The app keeps everything in the browser, per address, so each port below is a separate, persistent sandbox.
//
//   npm run sandbox             neutral demo data, at http://127.0.0.1:3481
//   npm run sandbox -- private  your own data from private/sandbox/*.zip, at http://127.0.0.1:3480
//
// Private sandbox files are backups made by the app (Settings › Data › Back up). They live in private/sandbox/ at the
// main checkout's root, which git ignores, and are loaded with the app's own Restore, so nothing here can commit them.
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { privateDir } from '../verify/_local.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'demo';
if (!['demo', 'private'].includes(mode)) { console.error('usage: npm run sandbox [-- demo|private]'); process.exit(2); }
const port = mode === 'private' ? 3480 : 3481;
const base = `http://127.0.0.1:${port}`;

const free = await new Promise(ok => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(port, '127.0.0.1'); });
if (!free) { console.error(`sandbox: port ${port} is in use. Open ${base}, or stop what is running there.`); process.exit(1); }

if (mode === 'private') {
  const dir = path.join(privateDir(), 'sandbox');
  // a guard, not a fix: private/ must stay untracked apart from its README and example
  const tracked = execFileSync('git', ['ls-files', '--full-name', '--', ':/private'], { cwd: WEB, encoding: 'utf8' }).split('\n').filter(f => f && !/^private\/(README\.md|local\.env\.example)$/.test(f));
  if (tracked.length) { console.error(`sandbox: git tracks private files, remove them from git first:\n  ${tracked.join('\n  ')}`); process.exit(1); }
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.zip')).sort() : [];
  console.log(files.length
    ? `sandbox: private data in ${dir}:\n${files.map(f => `  ${f}`).join('\n')}\n` +
      `First time on this address: open ${base}/settings/data#restore, choose one of these files, then Replace everything.\n` +
      'It stays loaded on this address until you replace it or start over.'
    : `sandbox: no backups in ${dir} yet.\n` +
      'Make one in the app you test with (Settings › Data › Back up), save the .zip there, then run this again.');
} else {
  console.log(`sandbox: demo data. Open ${base}/library and choose Try with sample data (it is labelled Demo data).\n` +
    `Remove it in ${base}/settings/data#demo-data.`);
}

const next = spawn(path.join(WEB, 'node_modules/.bin/next'), ['dev', '-H', '127.0.0.1', '-p', String(port)], { cwd: WEB, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => next.kill(sig));
next.on('exit', code => process.exit(code ?? 0));
