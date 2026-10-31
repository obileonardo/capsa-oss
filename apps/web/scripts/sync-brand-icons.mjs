// Copies the brand icon set from design-references/brand/icons/ into the app. Re-run whenever icons land or change:
//   node apps/web/scripts/sync-brand-icons.mjs
// Reads (never writes) the icon agent's files: manifest.json (names, if present), glyph/{solid,line}/<name>.svg (the two
// sets behind Settings > Appearance > Icon style), glyph/<name>-{glass,rose}.svg (menu tints, not part of the setting) and
// hero/{glass,rose}/<name>.svg. Writes:
//   public/icons/brand/hero/{glass,rose}/<name>.svg   heroes, served as files (cache-first in the service worker)
//   public/icons/brand/files.json                      the hero URLs, precached by public/sw.js for offline use
//   src/components/ui/brand-icons.gen.ts               glyph path data and tint stops, inlined by <BrandIcon>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(APP, '../../design-references/brand/icons');
const PUB = path.join(APP, 'public/icons/brand');
const GEN = path.join(APP, 'src/components/ui/brand-icons.gen.ts');
const PALETTES = ['glass', 'rose'];
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const read = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
const list = d => (fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)) : []);

// Names: the manifest (any of: ["a", ...], [{ name }], { icons: [...] }, { a: {...} }) plus whatever files exist.
function manifestNames() {
  const raw = read(path.join(SRC, 'manifest.json'));
  if (!raw) return [];
  const m = JSON.parse(raw);
  const arr = Array.isArray(m) ? m : Array.isArray(m.icons) ? m.icons : Object.keys(m.icons ?? m);
  return arr.map(x => (typeof x === 'string' ? x : x?.name ?? x?.id)).filter(Boolean);
}
const glyphFiles = list(path.join(SRC, 'glyph'));
const STYLES = ['solid', 'line'];
const names = [...new Set([
  ...manifestNames(),
  ...glyphFiles.map(f => f.replace(/-(glass|rose)$/, '')),
  ...STYLES.flatMap(st => list(path.join(SRC, 'glyph', st))),
  ...PALETTES.flatMap(p => list(path.join(SRC, 'hero', p))),
])].filter(n => NAME_RE.test(n)).sort();

// Glyph shapes: each mask path with its role: '+' adds (#fff, or a plain filled path), '-' knocks out (#000). A filled
// path is [role, d]; a stroked one is [role, d, width, linecap, linejoin].
const BLACK = c => c === '#000' || c === '#000000' || c === 'black';
const paths = svg => [...svg.matchAll(/<path\b([^>]*)>/g)].map(m => {
  const at = k => new RegExp(`\\b${k}="([^"]+)"`).exec(m[1])?.[1]?.toLowerCase();
  const d = /\bd="([^"]+)"/.exec(m[1])?.[1]; if (!d) return null;
  // Line-drawn utility glyphs: a stroked path (fill none, stroke #fff adds / #000 knocks out) keeps its stroke.
  const stroke = at('stroke');
  if (stroke && stroke !== 'none') return [BLACK(stroke) ? '-' : '+', d, Number(at('stroke-width') ?? 1), at('stroke-linecap') ?? 'butt', at('stroke-linejoin') ?? 'miter'];
  return [BLACK(at('fill')) ? '-' : '+', d];
}).filter(Boolean);
const stops = svg => [...svg.matchAll(/stop-color="(#[0-9a-fA-F]{3,8})"/g)].map(m => m[1].toLowerCase());
// The clear-glass tint's effects (glyph/<name>-glass.svg): data-fx="edge <colour> <opacity> <d>" and
// data-fx="hi <colour> <opacity> <inset> <width>". One recipe for the whole set; the build fails if two files disagree.
const fxOf = svg => Object.fromEntries([...svg.matchAll(/data-fx="(\w+) ([^"]+)"/g)].map(m => {
  const [c, ...n] = m[2].trim().split(/\s+/); return [m[1], [c.toLowerCase(), ...n.map(Number)]];
}));

const sets = { solid: {}, line: {} }, tints = {}, heroes = {}, files = [];
const glyphs = sets.solid; // the default style; every name the app can ask for
const tintFx = {};
const uiAliases = (() => { const m = JSON.parse(read(path.join(SRC, 'manifest.json')) ?? '{}'); return Object.fromEntries(Object.entries(m.ui ?? {}).filter(([, v]) => v?.alias).map(([k, v]) => [k, v.alias])); })();
for (const n of names) {
  // an aliased ui name has its own file in each set, but it's the concept's drawing: ICON_GLYPH points at it instead
  for (const st of uiAliases[n] && uiAliases[n] !== n ? [] : STYLES) {
    const svg = read(path.join(SRC, 'glyph', st, `${n}.svg`));
    if (!svg) continue;
    if (!/viewBox="0 0 20 20"/.test(svg)) throw new Error(`glyph/${st}/${n}.svg is not on the 20 grid`);
    sets[st][n] = paths(svg);
  }
  for (const p of PALETTES) {
    const t = read(path.join(SRC, 'glyph', `${n}-${p}.svg`));
    const s = t && stops(t);
    if (s && s.length >= 2) (tints[n] ??= {})[p] = [s[0], s[s.length - 1]];
    const fx = t && fxOf(t);
    if (fx && Object.keys(fx).length) {
      if (tintFx[p] && JSON.stringify(tintFx[p]) !== JSON.stringify(fx)) throw new Error(`glyph/${n}-${p}.svg has a different glass recipe from the rest`);
      tintFx[p] = fx;
    }
    const hero = path.join(SRC, 'hero', p, `${n}.svg`);
    if (fs.existsSync(hero)) {
      const out = path.join(PUB, 'hero', p, `${n}.svg`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(hero, out);
      (heroes[n] ??= {})[p] = true;
      files.push(`/icons/brand/hero/${p}/${n}.svg`);
    }
  }
}
// The two sets must cover the same names: switching the style can never leave an icon without a drawing.
const only = (a, b) => Object.keys(sets[a]).filter(n => !sets[b][n]);
if (only('solid', 'line').length || only('line', 'solid').length) throw new Error(`solid and line sets differ: solid only ${only('solid', 'line')}; line only ${only('line', 'solid')}`);
// A hero needs both palettes (light and dark); a half-drawn pair falls back to the line drawing.
for (const n of Object.keys(heroes)) if (!PALETTES.every(p => heroes[n][p])) delete heroes[n];
// Drop copied heroes that no longer exist upstream.
for (const p of PALETTES) for (const f of list(path.join(PUB, 'hero', p))) if (!fs.existsSync(path.join(SRC, 'hero', p, `${f}.svg`))) fs.rmSync(path.join(PUB, 'hero', p, `${f}.svg`));

// The icon shim (src/components/ui/icons.tsx) asks for glyphs by its own kebab names (data-ic). A glyph file with that
// name is used directly; otherwise the manifest's "lucide" field (a Lucide name or a list of them) points a shim name
// at a brand glyph, and SEED covers the brand concepts drawn before that field existed.
const SEED = {
  'library-big': 'library', 'swatch-book': 'board', 'square-pen': 'capture', 'message-square-text': 'prompt', blocks: 'skill',
  plug: 'mcp', lightbulb: 'technique', 'file-code-2': 'template', 'app-window': 'app-tool', wrench: 'app-tool',
  'square-terminal': 'config', 'book-open': 'reference', check: 'done',
};
const kebab = n => String(n).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([a-zA-Z])([0-9])/g, '$1-$2').toLowerCase();
function manifestAliases() {
  const raw = read(path.join(SRC, 'manifest.json'));
  const m = raw ? JSON.parse(raw) : {};
  const out = {};
  // concept entries list the Lucide names they stand for
  for (const [n, v] of Object.entries(Array.isArray(m.icons) ? {} : m.icons ?? {})) for (const l of [v?.lucide].flat().filter(Boolean)) out[kebab(l)] = n;
  // the ui map: one entry per shim name, with an optional alias to a concept glyph
  for (const [n, v] of Object.entries(m.ui ?? {})) if (v?.alias) out[n] = v.alias;
  return { out, hasUi: !!m.ui };
}
const { out: aliases, hasUi } = manifestAliases();
// a glyph drawn under the shim's own name wins over SEED (used only before the manifest had a ui map)
const iconGlyph = Object.fromEntries(Object.entries({ ...(hasUi ? {} : SEED), ...aliases })
  .filter(([k, g]) => glyphs[g] && k !== g && !(glyphs[k] && !aliases[k])).sort());

fs.mkdirSync(PUB, { recursive: true });
fs.writeFileSync(path.join(PUB, 'files.json'), JSON.stringify(files.sort(), null, 2) + '\n');
fs.writeFileSync(GEN, `// Generated by scripts/sync-brand-icons.mjs from design-references/brand/icons. Don't edit; re-run the script.
/* eslint-disable */
export const BRAND_ICON_NAMES = ${JSON.stringify(names)} as const;
export type GlyphLayer = ['+' | '-', string] | ['+' | '-', string, number, string, string];
/** Flat UI glyphs on the 20 grid, the Solid set (the default style): [role, path] pairs, '+' adds and '-' knocks out
 * (drawn as a mask over currentColor); a stroked layer adds width, linecap and linejoin. From glyph/solid/<name>.svg. */
export const GLYPHS: Record<string, GlyphLayer[]> = ${JSON.stringify(sets.solid, null, 1)};
/** The Line set, same names (glyph/line/<name>.svg): shown when <html data-icons="line"> (Settings > Appearance > Icon style). */
export const GLYPHS_LINE: Record<string, GlyphLayer[]> = ${JSON.stringify(sets.line, null, 1)};
/** Tinted glyphs: the one top-to-bottom gradient of glyph/<name>-<palette>.svg. glass = light UI, rose = dark UI. */
export const TINTS: Record<string, { glass?: [string, string]; rose?: [string, string] }> = ${JSON.stringify(tints)};
/** The tint's glass effects per palette (glass only): edge [colour, opacity, d], hi [colour, opacity, inset, width], in 20-grid units. */
export const TINT_FX: Record<string, { edge?: [string, number, number]; hi?: [string, number, number, number] }> = ${JSON.stringify(tintFx)};
/** Icon shim name -> brand glyph, where the names differ (a glyph named like the shim export is used as is). */
export const ICON_GLYPH: Record<string, string> = ${JSON.stringify(iconGlyph)};
/** Heroes with both palettes, served from /icons/brand/hero/{glass,rose}/<name>.svg. */
export const HEROES: Record<string, true> = ${JSON.stringify(Object.fromEntries(Object.keys(heroes).map(n => [n, true])))};
`);
console.log(`brand icons: ${names.length} names · ${Object.keys(glyphs).length} glyphs × ${STYLES.join(' + ')} · ${Object.keys(iconGlyph).length} shim aliases · ${Object.keys(tints).length} tinted · ${Object.keys(heroes).length} heroes`);
