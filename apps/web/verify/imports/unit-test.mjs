// Track A unit checks (25 Oct): canonical links, bulk paste, transcripts, files and the import parsers. Runs the
// TypeScript sources directly in Node 24.  Usage: node verify/imports/unit-test.mjs
import './_ts.mjs';
const { canonicalUrl, findSavedLink, bulkLines, isBulkLinks } = await import('../../src/lib/capture/links.ts');
const { detectTranscript, parseTranscript, transcriptPieces, stamp } = await import('../../src/lib/capture/transcript.ts');
const { docKind, piecesFromTextFile, piecesFromPages, pageText } = await import('../../src/lib/capture/documents.ts');
const P = await import('../../src/lib/imports/parse.ts');
const { fetchStars, validUser } = await import('../../src/lib/imports/github.ts');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}${JSON.stringify(got) === JSON.stringify(want) ? '' : `, want ${JSON.stringify(want)}`}`);

/* ---------- CAP-04 canonical addresses ---------- */
const same = [
  ['http://www.example.com/post/', 'https://example.com/post'],
  ['https://example.com/post?utm_source=x&utm_medium=y', 'https://example.com/post'],
  ['https://example.com/post?fbclid=abc#section', 'https://example.com/post'],
  ['https://m.example.com/post', 'https://example.com/post'],
  ['example.com/post', 'https://example.com/post'],
  ['https://youtu.be/dQw4w9WgXcQ?si=abc&t=42', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://twitter.com/jack/status/20?s=20&t=abc', 'https://x.com/jack/status/20'],
  ['https://example.com/news/story/amp/', 'https://example.com/news/story'],
  ['https://example.com/a?b=2&a=1', 'https://example.com/a?a=1&b=2'],
  ['HTTPS://EXAMPLE.COM/Post', 'https://example.com/Post'],
];
for (const [a, b] of same) check(`canonical: ${a} = ${b}`, canonicalUrl(a) === canonicalUrl(b) && !!canonicalUrl(a), `${canonicalUrl(a)} vs ${canonicalUrl(b)}`);
const different = [
  ['https://example.com/post-1', 'https://example.com/post-2'],
  ['https://example.com/page?id=1', 'https://example.com/page?id=2'],
  ['https://example.com/Post', 'https://example.com/post'], // paths keep their case: don't merge distinct pages
  ['https://youtube.com/watch?v=aaaaaaaaaaa', 'https://youtube.com/watch?v=bbbbbbbbbbb'],
  ['https://github.com/a/b', 'https://github.com/a/c'],
];
for (const [a, b] of different) check(`canonical: ${a} ≠ ${b}`, canonicalUrl(a) !== canonicalUrl(b));
for (const bad of ['', 'not a link', 'javascript:alert(1)', 'ftp://example.com/x', 'mailto:a' + '@b.co', 'https://localhost/x']) check(`canonical: "${bad}" is not a web address`, canonicalUrl(bad) === null);
const saved = [{ id: 's1', url: 'https://www.example.com/post/?utm_campaign=z', title: 'Post', status: 'queued' }, { id: 's2', url: null, title: 'Note', status: 'nothing' }];
eq('findSavedLink finds the same page', findSavedLink(saved, 'http://example.com/post#top')?.id, 's1');
eq('findSavedLink: a different page is new', findSavedLink(saved, 'https://example.com/other')?.id, undefined);

/* ---------- CPT-16 bulk paste ---------- */
const paste = `https://example.com/a
- [B](https://example.com/b?utm_source=t)
not a link at all

www.example.com/c
https://example.com/a/
See https://example.com/d).`;
const lines = bulkLines(paste);
eq('bulk: kinds per line', lines.map(l => l.kind), ['link', 'link', 'invalid', 'link', 'repeat', 'link']);
eq('bulk: line numbers', lines.map(l => l.line), [1, 2, 3, 5, 6, 7]);
eq('bulk: markdown link and trailing punctuation trimmed', [lines[1].url, lines[5].url], ['https://example.com/b?utm_source=t', 'https://example.com/d']);
eq('bulk: www gets https', lines[3].url, 'https://www.example.com/c');
eq('bulk: repeat points at the first line', lines[4].firstLine, 1);
check('bulk: a list of links is a bulk paste', isBulkLinks(paste));
check('bulk: one link is not a bulk paste', !isBulkLinks('https://example.com/a'));
check('bulk: a prompt with one link is not a bulk paste', !isBulkLinks('You are a careful editor.\nRewrite this post: https://example.com/a\nKeep it short and keep the tone.\nReturn only the result.'));

/* ---------- EXT-05 transcripts ---------- */
const SRT = `1
00:00:01,000 --> 00:00:04,000
Welcome back to the channel.

2
00:00:04,500 --> 00:00:07,000
Today I'll show you my review prompt.

3
00:01:10,000 --> 00:01:14,500
You are a senior engineer reviewing a pull request.

4
00:01:14,600 --> 00:01:19,000
Point out bugs first, then style, and keep it short.

5
00:02:30,000 --> 00:02:33,000
That's it for today.`;
eq('srt detected', detectTranscript(SRT), 'srt');
const tr = parseTranscript(SRT);
eq('srt: 5 cues', tr.cues.length, 5);
check('srt: a pause starts a paragraph', tr.text.includes('my review prompt.\n\nYou are a senior engineer'), JSON.stringify(tr.text.slice(0, 120)));
const tp = transcriptPieces(tr);
eq('srt: one prompt found', tp.map(p => p.type), ['prompt']);
eq('srt: the prompt keeps its time', [tp[0]?.t, tp[0]?.tEnd], ['01:10', '01:19']);
check('srt: exact words are in the stored text', tp[0] && tr.text.slice(tp[0].start, tp[0].end) === tp[0].exact);

const VTT = `WEBVTT
Kind: captions

NOTE made by hand

intro
00:00:00.000 --> 00:00:02.000
<v Ana>Here are the steps I use.</v>

00:00:02.000 --> 00:00:05.000 align:start
<v Ana>Here are the steps I use.
1. Write the brief.

00:00:05.000 --> 00:00:08.000
1. Write the brief.
2. Ask for three options.

00:00:08.000 --> 00:00:11.000
2. Ask for three options.
3. Pick one and refine it.`;
eq('vtt detected', detectTranscript(VTT), 'vtt');
const tv = parseTranscript(VTT);
eq('vtt: rolling captions keep only new lines', tv.cues.map(c => c.text), ['Here are the steps I use.', '1. Write the brief.', '2. Ask for three options.', '3. Pick one and refine it.']);
const vp = transcriptPieces(tv);
eq('vtt: a workflow with its time span', vp.map(p => [p.type, p.t, p.tEnd]), [['workflow', '00:02', '00:11']]);

const YT = `0:00
so today we're looking at prompts
0:04
the one I use every day goes like this
0:09
act as a copy editor and rewrite my draft so it reads clearly
0:15
keep my voice and don't add new claims
1:02:03
thanks for watching`;
eq('timestamps (time on its own line) detected', detectTranscript(YT), 'timestamps');
const ty = parseTranscript(YT);
eq('timestamps: cue starts', ty.cues.map(c => c.start), [0, 4, 9, 15, 3723]);
const yp = transcriptPieces(ty);
check('timestamps: the spoken prompt is found with its time', yp.some(p => p.type === 'prompt' && p.t === '00:09'), JSON.stringify(yp.map(p => [p.type, p.t, p.title])));
eq('stamp over an hour', stamp(3723), '1:02:03');
const INLINE = `[00:05] Speaker: welcome
[00:12] Speaker: today a template
[00:20] Write a cold email to [name] about [topic].
[00:31] that's all`;
eq('timestamps ([mm:ss] text) detected', detectTranscript(INLINE), 'timestamps');
check('timestamps: a template keeps its blanks and time', transcriptPieces(parseTranscript(INLINE)).some(p => p.type === 'template' && p.t === '00:20'));
for (const [label, text] of [
  ['numbered steps', '1. Open the file\n2. Edit it\n3. Save it'],
  ['times of day', 'Standup at 9:30\nLunch at 12:15\nReview at 4:45\nDone by 5:30 pm'],
  ['a prompt', 'You are a helpful assistant. Summarise the text below in three bullet points.'],
]) check(`not a transcript: ${label}`, detectTranscript(text) === null, String(detectTranscript(text)));

/* ---------- CAP-06 files ---------- */
eq('file kinds', ['a.md', 'b.TXT', 'c.pdf', 'd.srt', 'e.vtt', 'f.docx'].map(n => docKind(n)), ['md', 'txt', 'pdf', 'transcript', 'transcript', null]);
const MD = '# My prompts\n\nSome intro.\n\n## Editor\n\nYou are a copy editor. Rewrite the text below so it reads clearly.\n\n## Steps\n\n1. Draft\n2. Review\n3. Ship\n';
const fm = piecesFromTextFile('prompts.md', MD);
eq('md: types', fm.pieces.map(p => p.type), ['prompt', 'workflow']);
eq('md: line anchors', fm.pieces.map(p => p.locator), ['from prompts.md, line 7', 'from prompts.md, lines 11–13']);
check('md: quotes are verbatim in the stored text', fm.pieces.every(p => fm.segments[0].text.slice(p.start, p.end) === p.exact));
const ft = piecesFromTextFile('talk.srt', SRT);
check('srt file: time-linked finds', ft.transcript && ft.pieces[0]?.t === '01:10' && ft.pieces[0].locator === 'from talk.srt, 01:10–01:19', JSON.stringify(ft.pieces[0]));
const pp = piecesFromPages('guide.pdf', [{ n: 1, text: 'Intro page' }, { n: 2, text: '' }, { n: 3, text: 'Notes\n\nAct as a reviewer and list the three biggest risks in this plan.' }]);
eq('pdf: page anchors', pp.pieces.map(p => [p.segId, p.locator]), [['p3', 'from guide.pdf, page 3, line 3']]);
eq('pdf: pages without text are counted', pp.textless, 1);
const items = [
  { str: 'Title', hasEOL: true, transform: [1, 0, 0, 1, 0, 700], height: 12 },
  { str: 'First line of a', hasEOL: false, transform: [1, 0, 0, 1, 0, 660], height: 10 },
  { str: ' paragraph', hasEOL: true, transform: [1, 0, 0, 1, 80, 660], height: 10 },
  { str: 'second line', hasEOL: true, transform: [1, 0, 0, 1, 0, 648], height: 10 },
  { str: 'Next paragraph', hasEOL: true, transform: [1, 0, 0, 1, 0, 620], height: 10 },
];
eq('pdf: page text with paragraphs', pageText(items), 'Title\n\nFirst line of a paragraph\nsecond line\n\nNext paragraph');

/* ---------- IMP-01 / IMP-07 links ---------- */
const NETSCAPE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://example.com/a" ADD_DATE="1700000001">A &amp; B</A>
        <DT><H3>AI</H3>
        <DL><p>
            <DT><A HREF="https://github.com/anthropics/skills" ADD_DATE="1700000002" TAGS="skills,claude">anthropics/skills</A>
            <DT><A HREF="javascript:void(0)">Bookmarklet</A>
        </DL><p>
        <DT><A HREF="https://example.com/c">C</A>
    </DL><p>
    <DT><A HREF="place:sort=8">Recent</A>
</DL><p>`;
const nb = P.parseBookmarksHtml(NETSCAPE);
eq('bookmarks: links', nb.links.map(l => l.url), ['https://example.com/a', 'https://github.com/anthropics/skills', 'https://example.com/c']);
eq('bookmarks: folders', nb.links.map(l => l.folder), ['Bookmarks bar', 'Bookmarks bar / AI', 'Bookmarks bar']);
eq('bookmarks: titles decoded, tags and dates', [nb.links[0].title, nb.links[1].tags, nb.links[1].addedAt], ['A & B', ['skills', 'claude'], new Date(1700000002000).toISOString()]);
eq('bookmarks: non-web addresses skipped', nb.skipped, 2);
const POCKET_HTML = `<!DOCTYPE html><html><head><title>Pocket Export</title></head><body><h1>Unread</h1><ul>
<li><a href="https://example.com/p1" time_added="1600000000" tags="ai">Pocket one</a></li></ul><h1>Read Archive</h1><ul>
<li><a href="https://example.com/p2" time_added="1600000001" tags="">Pocket two</a></li></ul></body></html>`;
const ph = P.parseLinkFile('ril_export.html', POCKET_HTML);
eq('pocket html', [ph.service, ph.links.map(l => l.title), ph.links[0].tags], ['pocket', ['Pocket one', 'Pocket two'], ['ai']]);
const RAINDROP = 'id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite\n1,"Prompt guide, part 1","my note",,https://example.com/guide,AI,"prompts, guides",2024-03-01T10:00:00.000Z,,,false\n2,No url,,,,Unsorted,,,,,\n';
const rd = P.parseLinkFile('export.csv', RAINDROP);
eq('raindrop csv', [rd.service, rd.links.length, rd.skipped, rd.links[0].title, rd.links[0].folder, rd.links[0].tags, rd.links[0].note], ['raindrop', 1, 1, 'Prompt guide, part 1', 'AI', ['prompts', 'guides'], 'my note']);
const INSTA = 'URL,Title,Selection,Folder,Timestamp\nhttps://example.com/i1,Insta one,"a highlight",Unread,1650000000\nhttps://example.com/i2,Insta two,,Archive,1650000001\n';
const ip = P.parseLinkFile('instapaper-export.csv', INSTA);
eq('instapaper csv', [ip.service, ip.links.map(l => l.folder), ip.links[0].note], ['instapaper', [undefined, 'Archive'], 'a highlight']);
const POCKET_CSV = 'title,url,time_added,tags,status\nPocket three,https://example.com/p3,1700000000,ai|prompts,unread\n';
eq('pocket csv', [P.parseLinkFile('part_000000.csv', POCKET_CSV).service, P.parseLinkFile('part_000000.csv', POCKET_CSV).links[0].tags], ['pocket', ['ai', 'prompts']]);

/* ---------- IMP-08 prompts ---------- */
eq('csv: quotes, commas and newlines in fields', P.parseCsv('a,b\n"x, y","line 1\nline ""2"""\n'), [['a', 'b'], ['x, y', 'line 1\nline "2"']]);
eq('csv: semicolons', P.parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
const ACT = 'act,prompt\n"Linux Terminal","I want you to act as a linux terminal. I will type commands and you will reply with what the terminal should show."\n"Translator","I want you to act as a translator for [language]."\n"Empty",\n';
const tb = P.promptTable('prompts.csv', ACT);
const mp = P.guessMapping(tb);
eq('mapping guessed: title=act, text=prompt', [tb.columns[mp.title], tb.columns[mp.text], mp.tags], ['act', 'prompt', -1]);
const pr = P.promptsFromTable('prompts.csv', tb, mp);
eq('prompts: rows to prompts, empty rows counted', [pr.prompts.length, pr.empty], [2, 1]);
eq('prompts: row anchors and templates', pr.prompts.map(p => [p.title, p.where, p.template]), [['Linux Terminal', 'prompts.csv, row 2', false], ['Translator', 'prompts.csv, row 3', true]]);
const JS = JSON.stringify({ prompts: [{ name: 'Summarise', content: 'Summarise this in {{count}} bullets.', tags: ['work', 'writing'] }, { name: 'Empty', content: '' }] });
const jt = P.promptTable('lib.json', JS);
const jm = P.guessMapping(jt);
const jp = P.promptsFromTable('lib.json', jt, jm);
eq('json: mapping and {{variables}}', [jt.columns[jm.title], jt.columns[jm.text], jt.columns[jm.tags], jp.prompts[0].tags, jp.prompts[0].template, jp.empty], ['name', 'content', 'tags', ['work', 'writing'], true, 1]);
eq('json: array of strings', P.promptsFromTable('x.json', P.promptTable('x.json', '["Write a haiku about autumn leaves."]'), { title: -1, text: 0, tags: -1 }).prompts.map(p => [p.title, p.where]), [['Write a haiku about autumn leaves', 'x.json, item 1']]);
const mdp = P.promptsFromFiles([
  { path: 'prompts/review.md', text: '---\ntitle: Code review\ntags: [code, review]\n---\nReview this diff for bugs.\n' },
  { path: 'prompts/email.md', text: '# Cold email\n\nWrite a cold email to [name].\n' },
  { path: 'prompts/empty.md', text: '---\ntitle: x\n---\n' },
]);
eq('markdown folder: one prompt per file', mdp.map(p => [p.title, p.text, p.tags, p.template]), [['Code review', 'Review this diff for bugs.', ['code', 'review'], false], ['Cold email', 'Write a cold email to [name].', [], true]]);

/* ---------- IMP-10 notes ---------- */
const NOTE = '---\ntags:\n  - ai\n  - "work"\n---\n# Daily\n\nSee [[Other note|this]].\n\nAct as my editor and tighten this paragraph without changing its meaning.\n';
const nn = P.piecesFromNotes([{ path: 'Vault/Daily.md', text: NOTE }, { path: 'Vault/Empty.md', text: 'Just a thought.' }]);
eq('notes: finds and empties', [nn.pieces.length, nn.empty], [1, 1]);
eq('notes: line anchors count the front matter', nn.pieces[0].locator, 'Vault/Daily.md, line 10');
check('notes: quote is verbatim in the file', NOTE.slice(nn.pieces[0].start, nn.pieces[0].end) === nn.pieces[0].exact);
eq('front matter tags', P.frontMatter(NOTE).tags, ['ai', 'work']);
eq('note files: hidden folders skipped', ['Vault/a.md', 'Vault/.obsidian/x.md', 'Vault/b.txt', 'Vault/c.png'].map(P.isNoteFile), [true, false, true, false]);

/* ---------- IMP-05 GitHub stars (network stubbed) ---------- */
const reqs = [];
const stub = (status, body) => async (url, init) => { reqs.push({ url, init }); return new Response(JSON.stringify(body), { status }); };
const page = Array.from({ length: 100 }, (_, i) => ({ html_url: `https://github.com/o/r${i}`, full_name: `o/r${i}`, language: i % 2 ? 'TypeScript' : null, archived: i === 3, fork: i === 4, topics: ['mcp'] }));
const s1 = await fetchStars('octocat', 1, stub(200, page));
eq('stars: a full page means more', [s1.ok, s1.links.length, s1.more, s1.links[3].labels, s1.links[1].labels, s1.links[0].tags], [true, 100, true, ['TypeScript', 'archived'], ['TypeScript'], ['mcp']]);
check('stars: only the username is sent, without credentials', reqs[0].url === 'https://api.github.com/users/octocat/starred?per_page=100&page=1' && reqs[0].init.credentials === 'omit');
const s2 = await fetchStars('octocat', 2, stub(200, page.slice(0, 7)));
eq('stars: a short page is the last', [s2.links.length, s2.more], [7, false]);
eq('stars: unknown user', (await fetchStars('nobody-here', 1, stub(404, {}))).ok, false);
eq('stars: hourly limit pauses', (await fetchStars('octocat', 1, stub(403, {}))).limit, true);
eq('stars: usernames checked', ['octocat', 'a-b', '-bad', 'bad-', 'x'.repeat(40), 'ok_no'].map(validUser), [true, true, false, false, false, false]);

console.log(`\n${pass}/${pass + fail} Track A unit checks passed`);
process.exit(fail ? 1 : 0);
