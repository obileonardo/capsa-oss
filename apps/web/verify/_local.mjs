// Machine settings for the verify suites and tools, kept out of git. A setting comes from the environment first, then
// from private/local.env at the root of the main checkout (gitignored; private/local.env.example lists the keys).
// Worktrees read the main checkout's file, found through git, so a new worktree needs no setup.
import { execFileSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');

/** <main checkout>/private, or this checkout's private/ when git isn't available. */
export function privateDir() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return path.join(path.dirname(common), 'private');
  } catch {
    return path.resolve(WEB, '../../private');
  }
}

/** KEY=value lines; # comments; optional quotes around the value. */
export function localSetting(key) {
  if (process.env[key]) return process.env[key];
  let text;
  try { text = fs.readFileSync(path.join(privateDir(), 'local.env'), 'utf8'); } catch { return undefined; }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^(['"])(.*)\1$/, '$2') || undefined;
  }
  return undefined;
}

/** A path for createRequire: Playwright and axe-core resolve from PW_FROM's node_modules, else the normal way from
 * apps/web (its node_modules, a parent folder's, or NODE_PATH), so `npm i --no-save playwright axe-core` works too. */
export function playwrightFrom() {
  const dir = localSetting('PW_FROM');
  const from = path.join(dir ? path.resolve(dir) : WEB, 'package.json');
  try { createRequire(from).resolve('playwright'); } catch {
    console.error(dir
      ? `verify: Playwright not found in PW_FROM (${dir}). Its node_modules needs playwright and axe-core.`
      : 'verify: Playwright not found. Set PW_FROM to a folder whose node_modules has playwright and axe-core (env, or private/local.env), or install them in apps/web with npm i --no-save.');
  }
  return from;
}
