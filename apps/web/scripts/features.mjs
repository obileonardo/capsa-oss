// The feature registry's generated files (src/lib/features.ts says what they are and why). Finds every feature.ts
// under src/ (its id is the folder's name) and every <id>.feature.ts, and writes the registry, the ids, a module per
// slot, the global stylesheets and the service worker's offline pages. npm runs it before dev, build, typecheck and
// sandbox; the Node checks run it through verify/_ts.mjs. A file is rewritten only when its text changes, so a running
// dev server isn't reloaded for nothing.
//
//   node scripts/features.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(WEB, 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'feature.ts' || e.name.endsWith('.feature.ts')) out.push(p);
  }
  return out;
}

/** A plain list a feature.ts exports (routes, offline, css): `export const routes = ['/a', '/b'] as const;`. */
export function listIn(text, name) {
  const m = text.match(new RegExp(`export const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]) : [];
}

/** The slots: FeatureDef's members in src/lib/features.ts, the ones indented two spaces, less the three lists. */
function slotNames() {
  const def = fs.readFileSync(path.join(SRC, 'lib/features.ts'), 'utf8').match(/export interface FeatureDef \{\n([\s\S]*?)\n\}/);
  if (!def) throw new Error('features.mjs: no FeatureDef in src/lib/features.ts');
  return [...def[1].matchAll(/^ {2}(\w+)\?:/gm)].map(m => m[1]).filter(n => !['routes', 'offline', 'css'].includes(n));
}

/** The slots a feature.ts fills: `export { A, B as C, default as D } from './X';` lines, each with its module. */
function slotsIn(f) {
  const out = [];
  for (const m of f.text.matchAll(/export\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const from = m[2].startsWith('@/') ? m[2].slice(2) : path.posix.join(path.posix.dirname(f.file), m[2]);
    for (const part of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
      const [name, as = name] = part.split(/\s+as\s+/);
      out.push({ slot: as, name, from });
    }
  }
  return out;
}

/** Every feature under <src>: its id, its file (relative to src, no extension) and its text. */
export function findFeatures(src = SRC) {
  return walk(src).map(f => {
    const id = path.basename(f) === 'feature.ts' ? path.basename(path.dirname(f)) : path.basename(f, '.feature.ts');
    return { id, file: path.relative(src, f).split(path.sep).join('/').replace(/\.ts$/, ''), text: fs.readFileSync(f, 'utf8') };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function generate() {
  const features = findFeatures();
  const twice = features.find((f, i) => features.findIndex(g => g.id === f.id) !== i);
  if (twice) throw new Error(`features.mjs: two features are called "${twice.id}"`);
  const head = '// Written by scripts/features.mjs before dev, build and typecheck. Not committed; see src/lib/features.ts.\n';
  const name = id => id.replace(/\W/g, '_');
  const ids = features.map(f => `'${f.id}'`).join(', ');
  const css = features.flatMap(f => listIn(f.text, 'css'));
  // one module per slot, so each hub imports what it always imported, at the same place (same bundles, same CSS order)
  const slots = slotNames(), filled = new Map();
  for (const f of features) for (const s of slotsIn(f)) {
    if (!slots.includes(s.slot)) throw new Error(`features.mjs: ${f.file}.ts exports ${s.slot}, which isn't a slot in FeatureDef`);
    if (filled.has(s.slot)) throw new Error(`features.mjs: ${s.slot} is filled twice`);
    filled.set(s.slot, s);
  }
  const slotFiles = Object.fromEntries(slots.map(n => {
    const s = filled.get(n);
    return [`src/slots.gen/${n}.ts`, s
      ? `${head}export { ${s.name === 'default' ? 'default' : `${s.name} as default`} } from '../${s.from}';\n`
      : `${head}import type { FeatureDef } from '../lib/features';\n\nconst none: FeatureDef['${n}'] = undefined;\nexport default none;\n`];
  }));
  const out = {
    ...slotFiles,
    'src/feature-ids.gen.ts': `${head}import type { FeatureId } from './lib/features';\n\nexport const FEATURE_IDS: readonly FeatureId[] = [${ids}];\n`,
    'src/features.gen.ts': `${head}import type { FeatureDef, FeatureId } from './lib/features';\n`
      + features.map(f => `import * as ${name(f.id)} from './${f.file}';\n`).join('')
      + `\nexport const FEATURES = {${features.map(f => ` ${name(f.id)}`).join(',')} } satisfies Partial<Record<FeatureId, FeatureDef>>;\n`,
    'src/features.gen.css': `/* Written by scripts/features.mjs. Not committed; see src/lib/features.ts. */\n${css.map(c => `@import './${c}';\n`).join('')}`,
    'public/sw-features.gen.js': `${head}self.FEATURE_PAGES = ${JSON.stringify(features.flatMap(f => listIn(f.text, 'offline')))};\n`,
  };
  fs.mkdirSync(path.join(SRC, 'slots.gen'), { recursive: true });
  for (const f of fs.readdirSync(path.join(SRC, 'slots.gen'))) if (!out[`src/slots.gen/${f}`]) fs.rmSync(path.join(SRC, 'slots.gen', f));
  for (const [rel, text] of Object.entries(out)) {
    const file = path.join(WEB, rel);
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) continue;
    fs.writeFileSync(file, text);
  }
  return features.map(f => f.id);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) console.log(`features: ${generate().join(', ') || 'none'}`);
