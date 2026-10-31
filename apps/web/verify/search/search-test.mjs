// Unit checks for "search everything" (build-out Stage 5). Runs the TypeScript sources directly (Node 24 strips types).
// Usage: node verify/search/search-test.mjs
import '../_ts.mjs'; // search.ts asks lib/features.ts which features this build has
const { DEMO } = await import('../../src/lib/demo-data.ts');
const { searchAll, searchIndex } = await import('../../src/lib/search.ts');
const { has } = await import('../../src/lib/features.ts'); // a release snapshot can lack a feature (lib/features.ts)

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const state = {
  v: 1, sources: structuredClone(DEMO.sources), artifacts: structuredClone(DEMO.artifacts).map((a, i) => i === 0 ? { ...a, tags: ['release', 'checklists'] } : a),
  projects: DEMO.projects, collections: DEMO.collections, prefs: { theme: 'system', reviewView: 'auto' }, seededDemo: true,
  boards: [{ id: 'b-1', title: 'Calm onboarding', note: 'Soft, quiet first run', sections: [{ id: 'sec-1', title: 'Hero', note: '' }], createdAt: '', updatedAt: '' }],
  references: [{ id: 'r-1', boardId: 'b-1', sectionId: 'sec-1', order: 0, title: 'Welcome screen', sourceUrl: 'https://example.com/shot', creator: 'Ada Example', capturedAt: '', rights: 'own',
    likes: ['Typography'], note: 'Love the generous line height', avoid: false, imageKey: '', mime: 'image/png', width: 10, height: 10,
    regions: [{ id: 'g-1', x: 0, y: 0, w: 1, h: 1, likes: [], avoid: false, note: 'the pill-shaped skip button' }], notes: [{ id: 'n-1', t: 1.2, text: 'easing settles slowly' }] }],
};
const first = (q, kind) => searchAll(state, q).find(h => !kind || h.kind === kind);

const deploy = state.artifacts[0];
check('a title word finds the item first', searchAll(state, 'deploy')[0]?.id === deploy.id, searchAll(state, 'deploy')[0]?.title);
const quote = deploy.evidence?.quote;
const qWords = quote.split(/\s+/).slice(2, 5).join(' ').replace(/[“”".,]/g, '');
const q = first(qWords, 'quote');
check(`a phrase from an evidence quote finds the quote ("${qWords}")`, q && q.href === `/library/${deploy.id}` && q.field === 'evidence quote', JSON.stringify(q));
check('words inside the exact text match, and say so', (() => { const h = first('migrations rolled', 'item'); return h?.id === deploy.id && h.field === 'exact text'; })());
check('a tag is found, linking to the tag filter', first('checklists', 'tag')?.href === '/library?tag=checklists');
check('a tag also finds the items carrying it', (() => { const h = searchAll(state, 'checklists').find(x => x.kind === 'item'); return h?.id === deploy.id && h.field === 'tags'; })());
check('a collection by name', first('prompts reuse', 'collection')?.href === '/collections/c-reuse');
check('a project by name', first('menu bar', 'project')?.href === '/projects/p-menubar');
check('a source by its author or address', !!searchAll(state, 'youtube').find(h => h.kind === 'source'));
if (has('playground')) {
  check('a board by its note', first('quiet first run', 'board')?.id === 'b-1');
  check('a board reference by its note', (() => { const h = first('generous line height', 'reference'); return h?.id === 'r-1' && h.field === 'your note' && h.href === '/boards/b-1?ref=r-1'; })());
  check('a board reference by a region note', first('pill-shaped skip', 'reference')?.field === 'region note');
  check('a board reference by a timed note', first('easing settles', 'reference')?.field === 'timed note');
} else check('without Playground, boards and their references are not searched', !first('quiet first run', 'board') && !first('generous line height', 'reference'));
check('every word must match (AND)', searchAll(state, 'deploy zzzz').length === 0);
check('nothing for an empty query', searchAll(state, '   ').length === 0);
check('candidate quotes still in review are found, pointing at the review', !!searchAll(state, 'rubric goal constraint').find(h => h.kind === 'quote' && h.href.startsWith('/inbox/')));
// Speed budget for one keystroke of ⌘K with 1,000 items and 300 sources: the search work alone (no browser).
// The browser check (verify/perf) allows 400 ms end to end; this keeps the JS part far below it.
{
  const words = ['deploy', 'review', 'agent', 'design', 'release', 'docs', 'image', 'plan', 'test', 'search', 'brief', 'prompt'];
  const big = { ...state, artifacts: Array.from({ length: 1000 }, (_, i) => ({ ...DEMO.artifacts[i % DEMO.artifacts.length], id: `p${i}`, title: `${DEMO.artifacts[i % DEMO.artifacts.length].title} ${i} ${words[i % 12]}`, tags: [words[i % 12]] })),
    sources: Array.from({ length: 300 }, (_, i) => ({ ...DEMO.sources[i % DEMO.sources.length], id: `ps${i}`, title: `${DEMO.sources[i % DEMO.sources.length].title} ${i}` })) };
  const ix = searchIndex(big);
  check('the search index is built once per library state and reused', searchIndex(big) === ix && searchIndex({ ...big, artifacts: [...big.artifacts] }) !== ix);
  const q = 'deploy release', per = [];
  for (let rep = 0; rep < 5; rep++) for (let k = 1; k <= q.length; k++) { const t = performance.now(); searchAll(big, q.slice(0, k), 200); per.push(performance.now() - t); }
  per.sort((a, b) => a - b);
  const median = per[Math.floor(per.length / 2)], p90 = per[Math.floor(per.length * 0.9)];
  check('one keystroke of search over 1,000 items + 300 sources: median under 3 ms, 90th percentile under 8 ms', median < 3 && p90 < 8, `median ${median.toFixed(2)} ms, p90 ${p90.toFixed(2)} ms`);
}
console.log(`\n${pass}/${pass + fail} search checks passed`);
process.exit(fail ? 1 : 0);
