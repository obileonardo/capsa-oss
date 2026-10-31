// Unit checks for on-device extraction against the fixture set. Runs the TypeScript source directly (Node 24 strips types).
// Usage: node verify/capture/extract-test.mjs
import { describeLink, findPieces, normalisePaste, blanksIn } from '../../src/lib/capture/extract.ts';
import { FIXTURES, LINKS } from './fixtures.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

for (const f of FIXTURES) {
  const text = normalisePaste(f.input);
  const got = findPieces(f.input, f.mode ?? 'auto');
  const summary = got.map(p => `${p.type}:“${p.title}”`).join(', ') || 'none';
  check(`${f.id}: ${f.expect.length} candidate(s)`, got.length === f.expect.length, summary);
  f.expect.forEach((e, i) => {
    const p = got[i];
    if (!p) return;
    check(`${f.id} #${i + 1}: type ${e.type}`, p.type === e.type, p.type);
    if (e.title) check(`${f.id} #${i + 1}: title`, e.title.test(p.title), p.title);
    // The exact words must be a verbatim slice of what was pasted (normalised line endings only).
    check(`${f.id} #${i + 1}: exact words are verbatim`, text.slice(p.start, p.end) === p.exact && text.includes(p.exact));
    if (e.exact !== undefined) check(`${f.id} #${i + 1}: exact span`, p.exact === e.exact, JSON.stringify(p.exact).slice(0, 90));
    if (e.exactIsWhole) check(`${f.id} #${i + 1}: exact is the whole paste`, p.exact === text.trim());
    if (e.exactStartsWith) check(`${f.id} #${i + 1}: exact starts right`, p.exact.startsWith(e.exactStartsWith), JSON.stringify(p.exact.slice(0, 40)));
    if (e.exactEndsWith) check(`${f.id} #${i + 1}: exact ends right`, p.exact.endsWith(e.exactEndsWith), JSON.stringify(p.exact.slice(-20)));
    if (e.blanks !== undefined) check(`${f.id} #${i + 1}: ${e.blanks} blanks`, blanksIn(p.exact).length === e.blanks, String(blanksIn(p.exact).length));
    check(`${f.id} #${i + 1}: says why`, typeof p.why === 'string' && p.why.length > 10);
  });
}

for (const l of LINKS) {
  const d = describeLink(l.url);
  check(`link ${l.url}: ${l.kind} · “${l.title}” · ${l.host}`, d.kind === l.kind && d.title === l.title && d.host === l.host, JSON.stringify(d));
}

console.log(`\n${pass}/${pass + fail} extraction checks passed`);
process.exit(fail ? 1 : 0);
