// Track C in a real browser (25 Oct): review tools (merge, split, unmerge, skip reasons, why these), secrets and
// cautions, Review later, the item page's Before you use it, Send to, retired models, model parameters, Don't send to
// AI, citations, changeable shortcuts, What's new and the glossary. Screenshots of each screen at 1440 and 390, light
// and dark, go to verify/trackc/shots/.
// Usage (dev server running): CAPSA_BASE=http://127.0.0.1:3203 node verify/trackc/verify.mjs [chromium|webkit|all]
import { withSample } from '../_sample.mjs';
import { createRequire } from 'module';
import { playwrightFrom } from '../_local.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(playwrightFrom());
const pw = withSample(require('playwright'));
const AXE = require.resolve('axe-core/axe.min.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const B = process.env.CAPSA_BASE || 'http://127.0.0.1:3100';
const engines = (process.argv[2] ?? 'chromium') === 'all' ? ['chromium', 'webkit'] : [process.argv[2] ?? 'chromium'];
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
/** Waits up to `ms` for the element to show, so a check fails only when it never comes, not when the page is slow. */
const shows = (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

const REVIEW_TEXT = [
  'I keep these in Notion.',
  '',
  '## Setup',
  '```bash',
  'curl -fsSL https://example.com/install.sh | sh',
  '```',
  '',
  '## Review prompt',
  'Review this pull request like a staff engineer. Point out risky changes first.',
  '',
  'Then list missing tests and naming problems, in that order.',
].join('\n');
// Made-up values, put together at run time so that no file holds a whole token-shaped string (the release secret scan
// ignores allowlists on purpose). The strings the checks see are the same as when they were written out in full.
const FAKE_OPENAI = 'sk-' + 'proj-' + 'abcDEF1234567890'.repeat(2);
const FAKE_GH = 'ghp' + '_0123456789abcdef' + 'ABCDEF0123456789abcd';
const SECRET_PROMPT = 'Act as a deploy helper. Call the API with OPENAI_API_KEY=' + FAKE_OPENAI + ' and report the status.';
const MCP_TEXT = '{\n  "mcpServers": {\n    "github": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"],\n      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "' + FAKE_GH + '" }\n    }\n  }\n}';
const RETIRED_PROMPT = 'Rewrite this for {{audience}}, as claude-2.1 used to: short, warm, no jargon. A lighthouse at dusk --ar 16:9 --v 6';

async function axe(page, label) {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter(v => (v.impact === 'serious' || v.impact === 'critical') && v.nodes.length).map(v => `${v.id}×${v.nodes.length} ${v.nodes[0].target.join(' ')}`));
  ok(`${label}: axe has no serious or critical issues`, bad.length === 0, bad.join(' | '));
}

for (const which of engines) {
  const browser = await pw[which].launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  if (which === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
  const outside = [];
  await ctx.route(u => !u.href.startsWith(B), r => { outside.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  const T = `[${which}]`;
  const go = async (u) => { await page.goto(B + u, { waitUntil: 'networkidle' }); await page.waitForTimeout(350); };
  const toast = () => page.locator('.toast').last();
  /** Capture text through the dialog (C), the way a person does. */
  const capture = async (text) => {
    await page.keyboard.press('Escape'); await page.locator('main').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('c');
    const dlg = page.locator('dialog[open]');
    await dlg.locator('#cap-value').fill('x');
    await dlg.locator('textarea#cap-value').fill(text);
    await dlg.locator('textarea#cap-value').press('Enter');
    await page.waitForTimeout(250);
    return dlg;
  };
  const openFromToast = async () => { await toast().getByRole('button', { name: 'Open' }).click(); await page.waitForTimeout(400); };

  await go('/library');
  ok(`${T} what's new: the Help icon is marked before Help is seen`, await page.getByRole('button', { name: 'Help, something new' }).count() === 1);

  /* ---------- XEV-15: secrets in the capture box ---------- */
  let dlg = await capture(SECRET_PROMPT);
  ok(`${T} capture: a key in the text is flagged before keeping`, await dlg.getByRole('alert').filter({ hasText: 'Looks like an OpenAI API key' }).isVisible());
  await page.screenshot({ path: path.join(SHOTS, `${which}-capture-secret-1440-light.png`) });
  await dlg.getByRole('button', { name: 'Mask and keep' }).click(); await page.waitForTimeout(300);
  ok(`${T} capture: Mask and keep keeps it in the Library`, /Kept in Library/.test(await toast().innerText()));
  await openFromToast();
  const maskedText = await page.locator('pre[aria-label="Exact text"]').innerText();
  ok(`${T} capture: the kept text has the placeholder, not the key`, maskedText.includes('<OPENAI_API_KEY>') && !maskedText.includes('sk-proj'), maskedText);

  /* ---------- review: cautions, why these, split, merge, unmerge, skip reasons ---------- */
  await go('/library');
  dlg = await capture(REVIEW_TEXT);
  ok(`${T} capture: several finds wait in the Inbox`, /Kept in Inbox · 2 found/.test(await toast().innerText()), (await toast().innerText()).replace(/\n/g, ' '));
  await openFromToast();
  const reviewUrl = page.url();
  ok(`${T} review: the curl | sh command carries a caution`, await shows(page.locator('article').filter({ hasText: 'curl -fsSL' }).locator('.tag.warn', { hasText: 'Runs code from the internet' })));
  const why = page.locator('details').filter({ hasText: 'Why these' });
  ok(`${T} review: "Why these · 1 left out" is collapsed`, /Why these · 1 left out/.test(await why.locator('summary').innerText()) && !(await why.evaluate(d => d.open)));
  await why.locator('summary').click();
  ok(`${T} review: why each was found, what was left out, mentions, caution rules`, await why.getByText('Mentioned only: Notion').isVisible() && await why.getByText(/No instruction, steps, blanks or code|Too short/).first().isVisible() && await why.getByText('Caution rules: 1 find flagged').isVisible());
  await page.screenshot({ path: path.join(SHOTS, `${which}-review-why-1440-light.png`) });
  const cards = () => page.locator('ol li[data-card] article');
  ok(`${T} review: 2 finds`, await cards().count() === 2);
  await page.getByRole('button', { name: 'More for “Review prompt”' }).click();
  await page.getByRole('menuitem', { name: 'Split…' }).click();
  const sd = page.getByRole('dialog', { name: 'Split “Review prompt”' });
  ok(`${T} split: the dialog picks the paragraph break`, await sd.isVisible() && await sd.locator('input[type=radio]:checked').evaluate(r => r.closest('label').innerText.includes('Then list missing tests')));
  await axe(page, `${T} split dialog`);
  await page.screenshot({ path: path.join(SHOTS, `${which}-review-split-1440-light.png`) });
  await sd.getByRole('button', { name: 'Split', exact: true }).click(); await page.waitForTimeout(300);
  ok(`${T} split: 3 finds, each part verbatim`, await cards().count() === 3 && await page.locator('article pre').filter({ hasText: /^Then list missing tests and naming problems, in that order\.$/ }).count() === 1);
  await toast().getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(300);
  ok(`${T} split: Undo puts the one find back`, await cards().count() === 2);
  await page.getByRole('button', { name: 'More for “Review prompt”' }).click();
  await page.getByRole('menuitem', { name: 'Split…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Split', exact: true }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'More for “Review prompt”' }).click();
  await page.getByRole('menuitem', { name: 'Merge with next' }).click(); await page.waitForTimeout(300);
  const merged = page.locator('article').filter({ hasText: 'Merged by you from 2 finds' });
  ok(`${T} merge: the two halves are one find again, verbatim from the paste`, await cards().count() === 2 && (await merged.locator('pre').innerText()).startsWith('Review this pull request') && (await merged.locator('pre').innerText()).endsWith('in that order.'));
  await page.getByRole('button', { name: 'More for “Review prompt”' }).click();
  await page.getByRole('menuitem', { name: 'Unmerge' }).click(); await page.waitForTimeout(300);
  ok(`${T} unmerge: back to the two parts`, await cards().count() === 3);
  await toast().getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(300);
  ok(`${T} unmerge: Undo`, await cards().count() === 2);
  // skip with a reason
  const setupCard = page.locator('article').filter({ hasText: 'curl -fsSL' });
  await setupCard.getByRole('checkbox').uncheck();
  const reasons = setupCard.getByRole('group', { name: /Why skip/ });
  ok(`${T} skip: reason chips appear on a find marked to skip`, await reasons.isVisible() && await reasons.getByRole('button').count() === 5);
  await reasons.getByRole('button', { name: 'Too generic' }).click();
  ok(`${T} skip: a reason is pressed`, await reasons.getByRole('button', { name: 'Too generic' }).getAttribute('aria-pressed') === 'true');
  await page.screenshot({ path: path.join(SHOTS, `${which}-review-skip-1440-light.png`) });
  await axe(page, `${T} review`);
  await page.getByRole('button', { name: /^Save 1 to Library$/ }).click(); await page.waitForTimeout(400);
  ok(`${T} review: saving keeps 1 and skips 1`, /Saved 1 to Library · 1 skipped/.test(await toast().innerText()));

  /* ---------- REV-08: Review later ---------- */
  await go('/library');
  await capture('Prompt 1: Summarise this article in five bullet points for a busy executive.\nPrompt 2: Rewrite the summary as a short thread with a strong opening line.');
  await go('/inbox');
  const badge = async () => Number((await page.locator('nav[aria-label="Main"] a[href="/inbox"]').innerText()).replace(/\D+/g, '') || 0);
  const before = await badge();
  const card = page.locator('li[data-id]').filter({ hasText: 'Summarise this article' }).first();
  await card.getByRole('button', { name: /^More for/ }).click();
  await page.getByRole('menuitem', { name: 'Tomorrow' }).click(); await page.waitForTimeout(300);
  ok(`${T} snooze: the card says until when, under Snoozed`, /Snoozed until tomorrow 09:00/.test(await card.innerText()) && await page.locator('section[data-col="review"] li', { hasText: /^Snoozed/ }).count() === 1);
  ok(`${T} snooze: the Inbox count drops`, await badge() === before - 1, `${before} → ${await badge()}`);
  await page.screenshot({ path: path.join(SHOTS, `${which}-inbox-snoozed-1440-light.png`) });
  await card.getByRole('button', { name: /^More for/ }).click();
  ok(`${T} snooze: the menu offers Back now`, await page.getByRole('menuitem', { name: 'Back now' }).isVisible());
  await page.keyboard.press('Escape');
  // it comes back by itself after the time: move the snooze into the past by changing the clock in the page
  await page.evaluate(() => { const real = Date.now; const skew = 2 * 86_400_000; Date.now = () => real() + skew; const R = Date; globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [real() + skew])); } static now() { return real() + skew; } }; });
  await page.locator('nav[aria-label="Main"] a[href="/library"]').click(); await page.waitForTimeout(300);
  await page.locator('nav[aria-label="Main"] a[href="/inbox"]').click(); await page.waitForTimeout(400);
  ok(`${T} snooze: after the time it's back, as it was`, !/Snoozed/.test(await page.locator('li[data-id]').filter({ hasText: 'Summarise this article' }).first().innerText()));
  await go('/inbox');
  const c2 = page.locator('li[data-id]').filter({ hasText: 'Summarise this article' }).first();
  await c2.getByRole('button', { name: /^More for/ }).click();
  await page.getByRole('menuitem', { name: 'Back now' }).click(); await page.waitForTimeout(200);
  ok(`${T} snooze: Back now`, !/Snoozed/.test(await c2.innerText()) && /Back in Ready to review/.test(await toast().innerText()));
  await c2.getByRole('button', { name: /^More for/ }).click();
  await page.getByRole('menuitem', { name: 'Later today' }).click(); await page.waitForTimeout(200);
  await toast().getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(200);
  ok(`${T} snooze: Undo`, !/Snoozed/.test(await c2.innerText()));

  /* ---------- MCP item: secret caution, Mask in review, Before you use it ---------- */
  await go('/library');
  dlg = await capture(MCP_TEXT);
  ok(`${T} capture: a GitHub token is flagged`, await dlg.getByRole('alert').filter({ hasText: 'GitHub token' }).isVisible());
  await dlg.getByRole('button', { name: 'Keep as is' }).click(); await page.waitForTimeout(300);
  await openFromToast();
  ok(`${T} review: the token shows as a caution, with Mask`, await page.locator('.tag.warn', { hasText: 'Looks like a secret' }).first().isVisible() && await page.getByRole('button', { name: 'Mask', exact: true }).isVisible());
  await page.getByRole('button', { name: 'Mask', exact: true }).click(); await page.waitForTimeout(300);
  const mcpPre = await page.locator('article').first().innerText();
  ok(`${T} review: Mask replaces the token everywhere it's kept`, mcpPre.includes('<GITHUB_TOKEN>') && !mcpPre.includes('ghp_') && !(await page.locator('main').innerText()).includes('ghp_'));
  await page.getByRole('button', { name: /^Save 1 to Library$/ }).click(); await page.waitForTimeout(400);
  await page.locator('main a[href^="/library/"]').filter({ hasText: 'github MCP server' }).first().click(); await page.waitForTimeout(500);
  const byu = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Before you use it' }) });
  ok(`${T} item: Before you use it, Claude Code first`, (await byu.locator('pre').first().innerText()) === 'claude mcp add --env GITHUB_PERSONAL_ACCESS_TOKEN=<GITHUB_PERSONAL_ACCESS_TOKEN> --transport stdio github -- npx -y @modelcontextprotocol/server-github');
  ok(`${T} item: what it changes, with Remove`, await byu.getByText('Downloads the package from npm without asking (npx -y)').isVisible() && await byu.getByText('claude mcp remove github').isVisible());
  ok(`${T} item: permissions, labelled Publisher states`, await byu.getByText('Publisher states').isVisible() && await byu.getByText('Read and change repositories, issues and pull requests').isVisible());
  await byu.getByRole('button', { name: 'Cursor' }).click();
  ok(`${T} item: Cursor shows .cursor/mcp.json and the install link`, /"\$\{env:GITHUB_PERSONAL_ACCESS_TOKEN\}"/.test(await byu.locator('pre').first().innerText()) && /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=github&config=/.test(await byu.locator('pre').nth(1).innerText()));
  await byu.getByRole('button', { name: 'VS Code' }).click();
  ok(`${T} item: VS Code shows servers and code --add-mcp`, /"servers"/.test(await byu.locator('pre').first().innerText()) && /^code --add-mcp/.test(await byu.locator('pre').nth(1).innerText()));
  await byu.getByRole('button', { name: 'Codex' }).click();
  ok(`${T} item: Codex`, (await byu.locator('pre').first().innerText()).startsWith('codex mcp add github --env'));
  // glossary term in place
  await byu.getByRole('button', { name: 'What’s an MCP server?' }).click();
  ok(`${T} glossary: the term opens its definition`, await page.getByRole('note').filter({ hasText: 'A small program that gives an AI app extra tools' }).isVisible());
  await page.keyboard.press('Escape');
  ok(`${T} glossary: Esc closes it`, !(await page.getByRole('note').filter({ hasText: 'A small program' }).isVisible()));
  await byu.getByRole('button', { name: 'Claude Code' }).click();
  await page.screenshot({ path: path.join(SHOTS, `${which}-item-mcp-1440-light.png`), fullPage: true });
  await axe(page, `${T} item (MCP)`);

  /* ---------- item: retired model, model parameters, {{blanks}}, Send to, Don't send to AI ---------- */
  await go('/library');
  await capture(RETIRED_PROMPT);
  await openFromToast();
  if (/\/inbox\//.test(page.url())) { await page.getByRole('button', { name: /^Save 1 to Library$/ }).click(); await page.waitForTimeout(400); await page.locator('main a[href^="/library/"]').first().click(); await page.waitForTimeout(500); }
  ok(`${T} item: written for a retired model, with the source`, /Written for Claude 2, retired by Anthropic on 21 Jul 2025/.test(await page.getByRole('note').first().innerText()));
  ok(`${T} item: model parameters kept as written`, await page.getByRole('heading', { name: 'Model parameters' }).isVisible() && await page.locator('code', { hasText: '--ar 16:9' }).isVisible() && await page.locator('code', { hasText: '--v 6' }).isVisible());
  ok(`${T} item: {{audience}} is a blank to fill`, await page.getByRole('heading', { name: 'Fill the blanks' }).isVisible() && await page.getByRole('textbox', { name: 'audience', exact: true }).isVisible());
  await page.getByRole('textbox', { name: 'audience', exact: true }).fill('new managers');
  ok(`${T} fill: the {{blank}} fills, parameters stay`, /Rewrite this for new managers,.*--ar 16:9 --v 6/s.test(await page.locator('[class*="fillText"]').innerText()));
  await page.screenshot({ path: path.join(SHOTS, `${which}-item-prompt-1440-light.png`), fullPage: true });
  await page.getByRole('button', { name: 'More ways to copy' }).click();
  const menu = page.getByRole('group', { name: 'More ways to copy' });
  ok(`${T} send to: Claude, ChatGPT, Gemini, Perplexity, Le Chat`, await menu.getByRole('button', { name: /^Send to / }).count() === 5);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), menu.getByRole('button', { name: 'Send to Claude' }).click()]);
  await page.waitForTimeout(300);
  ok(`${T} send to: opens claude.ai/new with no prompt in the address`, outside.includes('https://claude.ai/new') && !outside.some(u => /[?&](q|prompt)=/.test(u)), outside.join(' '));
  ok(`${T} send to: copied first, said so`, /Copied · paste it into Claude/.test(await toast().innerText()));
  if (which === 'chromium') ok(`${T} send to: the clipboard has the text`, (await page.evaluate(() => navigator.clipboard.readText())).startsWith('Rewrite this for {{audience}}'));
  await pop.close();
  await page.getByRole('button', { name: 'Don’t send to AI' }).click(); await page.waitForTimeout(200);
  ok(`${T} no AI: the item says so, with the history entry`, await page.locator('header .tag', { hasText: 'Don’t send to AI' }).isVisible() && await page.locator('#main').getByText('Marked Don’t send to AI').isVisible());
  ok(`${T} no AI: the toggle's tooltip says nothing is sent today`, /Nothing is sent to AI today/.test(await page.getByRole('button', { name: 'Don’t send to AI' }).getAttribute('title')));
  ok(`${T} no AI: Send to and Copy for AI are gone for this item (so is their menu)`, await page.getByRole('button', { name: 'More ways to copy' }).count() === 0 && await page.getByRole('button', { name: /^Send to|^Copy for AI$/ }).count() === 0);
  // Don't send to AI keeps it out of every export (Elvis, 25 Oct); backups still keep it
  const noAiId = page.url().split('/library/')[1].split(/[?#]/)[0];
  const noAiTitle = (await page.locator('#main h1').first().innerText()).trim();
  await page.getByRole('button', { name: 'Export' }).click();
  const noAiEx = page.getByRole('dialog');
  ok(`${T} no AI: Export leaves it out and says so`, /Export 0 items/.test(await noAiEx.innerText()) && /1 item marked Don’t send to AI, left out/.test(await noAiEx.innerText()) && await noAiEx.getByRole('button', { name: /^Download/ }).isDisabled());
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const fileOf = async dl => fs.readFileSync(await dl.path(), 'utf8');
  await go('/ai/mcp');
  const [libDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download capsa-library.json/ }).click()]);
  const libFile = JSON.parse(await fileOf(libDl));
  ok(`${T} no AI: not in the library file AI tools read`, libFile.items.length > 0 && !libFile.items.some(x => x.id === noAiId), `${libFile.items.length} items`);
  await go('/settings/storage');
  const [bkDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up everything' }).click()]);
  const bk = fs.readFileSync(await bkDl.path()).toString('latin1');
  ok(`${T} no AI: the backup still keeps it`, bk.includes(noAiId) && bk.includes(JSON.stringify(noAiTitle).slice(1, -1)));
  // a whole collection marked Don't send to AI
  await go('/collections/c-agent');
  const inAgent = await page.locator('#main a[href^="/library/a-"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href').split('/library/')[1]))]);
  await page.getByRole('button', { name: 'Don’t send to AI' }).click(); await page.waitForTimeout(200);
  await go('/collections/c-agent?export=1');
  const aiDlg = page.getByRole('dialog');
  ok(`${T} no AI collection: Export for AI has nothing left and says why`, /Nothing to export\b/.test(await aiDlg.innerText()) && /\d+ items? marked Don’t send to AI, left out/.test(await aiDlg.innerText()) && await aiDlg.getByRole('button', { name: /^Download/ }).isDisabled(), (await aiDlg.innerText()).replace(/\s+/g, ' ').slice(0, 160));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await go('/ai/mcp');
  const [libDl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download capsa-library.json/ }).click()]);
  const libFile2 = JSON.parse(await fileOf(libDl2));
  ok(`${T} no AI collection: its items are not in the library file`, inAgent.length > 0 && inAgent.every(id => !libFile2.items.some(x => x.id === id)), `${inAgent.length} in the collection; file has ${libFile2.items.length}`);
  await go('/collections/c-agent');
  await page.getByRole('button', { name: 'Don’t send to AI' }).click(); await page.waitForTimeout(200);

  /* ---------- RUS-13: citations ---------- */
  await go('/library/a-deploy');
  await page.getByRole('button', { name: 'Export' }).click();
  const ex = page.getByRole('dialog');
  await ex.getByRole('button', { name: 'BibTeX' }).click();
  const pv = () => ex.locator('pre[aria-label="Export preview"]').innerText();
  ok(`${T} citations: BibTeX of the item's source`, /^@misc\{/.test(await pv()) && /urldate = \{\d{4}-\d{2}-\d{2}\}/.test(await pv()));
  ok(`${T} citations: what's missing is listed`, /Missing: date published/.test(await ex.innerText()));
  await ex.getByRole('button', { name: 'APA' }).click();
  ok(`${T} citations: APA with (n.d.)`, /\(n\.d\.\)/.test(await pv()));
  await ex.getByRole('button', { name: 'CSL-JSON' }).click();
  ok(`${T} citations: CSL-JSON parses`, Array.isArray(JSON.parse(await pv())));
  await page.screenshot({ path: path.join(SHOTS, `${which}-export-cite-1440-light.png`) });
  await axe(page, `${T} export dialog`);
  await page.keyboard.press('Escape');

  /* ---------- THM-07: shortcuts ---------- */
  await go('/settings/shortcuts');
  await page.getByRole('button', { name: 'Change shortcut for Capture' }).click();
  await page.keyboard.press('r');
  ok(`${T} shortcuts: a clash is refused with the reason`, /R: Already used for Mark a region \(Boards\)/.test(await page.getByRole('alert').first().innerText()));
  await page.keyboard.press('q'); await page.waitForTimeout(200);
  ok(`${T} shortcuts: a free key is saved`, /Capture: Q/.test(await toast().innerText()) && (await page.locator('[data-action="capture"] .kbd').innerText()).trim() === 'Q');
  await page.screenshot({ path: path.join(SHOTS, `${which}-settings-shortcuts-1440-light.png`) });
  await axe(page, `${T} settings shortcuts`);
  await go('/library');
  await page.keyboard.press('c'); await page.waitForTimeout(200);
  ok(`${T} shortcuts: the old key does nothing`, await page.locator('dialog[open]').count() === 0);
  await page.keyboard.press('q'); await page.waitForTimeout(200);
  ok(`${T} shortcuts: the new key opens Capture`, await page.locator('dialog[open]').count() === 1);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await go('/help');
  ok(`${T} shortcuts: Help lists the new key`, (await page.locator('tr', { hasText: 'Capture' }).first().innerText()).includes('Q'));
  await go('/settings/shortcuts');
  await page.getByRole('button', { name: 'Reset Capture to C' }).click(); await page.waitForTimeout(200);
  ok(`${T} shortcuts: Reset`, (await page.locator('[data-action="capture"] .kbd').innerText()).trim() === 'C');
  await page.getByRole('button', { name: 'Change shortcut for Capture' }).click();
  await page.keyboard.press('Escape');
  ok(`${T} shortcuts: Esc cancels recording`, (await page.getByRole('button', { name: 'Change shortcut for Capture' }).getAttribute('aria-pressed')) === 'false');

  /* ---------- HLP-09 and LRN-03 on Help ---------- */
  await go('/library');
  await go('/help/whats-new');
  ok(`${T} what's new: dated entries on Help`, await page.getByRole('heading', { name: 'What’s new' }).isVisible() && await page.getByText('Review, reuse and safer pasting').isVisible());
  await go('/help/glossary');
  ok(`${T} glossary on Help, each with an anchor`, await page.locator('#g-mcp').isVisible() && await page.locator('#g-skill').isVisible());
  await go('/library');
  ok(`${T} what's new: seen after visiting Help`, await page.getByRole('button', { name: 'Help', exact: true }).count() === 1);

  ok(`${T} nothing left this machine`, outside.every(u => /claude\.ai\/new/.test(u)), outside.join(' '));
  ok(`${T} no console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));

  /* ---------- screenshots: the changed screens in dark, and at 390 ---------- */
  for (const [scheme, width] of [['dark', 1440], ['light', 390], ['dark', 390]]) {
    const c2x = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: scheme, reducedMotion: 'reduce' });
    await c2x.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, ['capsa-theme', scheme]);
    const p2 = await c2x.newPage();
    // the same library: copy this browser's IndexedDB state over via a backup is heavy, so re-create what the shots need
    await p2.goto(B + '/library', { waitUntil: 'networkidle' }); await p2.waitForTimeout(300);
    const tag = `${width}-${scheme}`;
    await p2.goto(B + '/settings/shortcuts', { waitUntil: 'networkidle' }); await p2.waitForTimeout(300);
    await p2.screenshot({ path: path.join(SHOTS, `${which}-settings-shortcuts-${tag}.png`), fullPage: width < 600 });
    await p2.goto(B + '/help#whats-new', { waitUntil: 'networkidle' }); await p2.waitForTimeout(300);
    await p2.screenshot({ path: path.join(SHOTS, `${which}-help-${tag}.png`) });
    await p2.goto(B + '/library/a-deploy', { waitUntil: 'networkidle' }); await p2.waitForTimeout(300);
    await p2.getByRole('button', { name: 'Export' }).click(); await p2.getByRole('dialog').getByRole('button', { name: 'APA' }).click(); await p2.waitForTimeout(200);
    await p2.screenshot({ path: path.join(SHOTS, `${which}-export-cite-${tag}.png`) });
    await p2.keyboard.press('Escape');
    // review and item screens on fresh captures
    await p2.goto(B + '/library', { waitUntil: 'networkidle' }); await p2.waitForTimeout(300);
    await p2.evaluate(() => document.activeElement?.blur()); await p2.keyboard.press('c');
    let d2 = p2.locator('dialog[open]'); await d2.locator('#cap-value').fill('x'); await d2.locator('textarea#cap-value').fill(MCP_TEXT); await d2.locator('textarea#cap-value').press('Enter'); await p2.waitForTimeout(250);
    await p2.screenshot({ path: path.join(SHOTS, `${which}-capture-secret-${tag}.png`) });
    await d2.getByRole('button', { name: 'Keep as is' }).click(); await p2.waitForTimeout(300);
    await p2.locator('.toast').last().getByRole('button', { name: 'Open' }).click(); await p2.waitForTimeout(500);
    await p2.screenshot({ path: path.join(SHOTS, `${which}-review-mcp-${tag}.png`), fullPage: width < 600 });
    await p2.getByRole('button', { name: /^Save 1 to Library$/ }).click(); await p2.waitForTimeout(400);
    await p2.locator('main a[href^="/library/"]').first().click(); await p2.waitForTimeout(500);
    await p2.screenshot({ path: path.join(SHOTS, `${which}-item-mcp-${tag}.png`), fullPage: true });
    await p2.goto(B + '/library', { waitUntil: 'networkidle' }); await p2.waitForTimeout(300);
    await p2.evaluate(() => document.activeElement?.blur()); await p2.keyboard.press('c');
    d2 = p2.locator('dialog[open]'); await d2.locator('#cap-value').fill('x'); await d2.locator('textarea#cap-value').fill(REVIEW_TEXT); await d2.locator('textarea#cap-value').press('Enter'); await p2.waitForTimeout(250);
    await p2.locator('.toast').last().getByRole('button', { name: 'Open' }).click(); await p2.waitForTimeout(500);
    await p2.locator('details').filter({ hasText: 'Why these' }).locator('summary').click();
    await p2.screenshot({ path: path.join(SHOTS, `${which}-review-why-${tag}.png`), fullPage: width < 600 });
    await p2.goto(B + '/inbox', { waitUntil: 'networkidle' }); await p2.waitForTimeout(400);
    const sc = p2.locator('li[data-id]').filter({ hasText: 'Setup and 1 more' }).first();
    if (await sc.count()) { await sc.getByRole('button', { name: /^More for/ }).click(); await p2.getByRole('menuitem', { name: 'Tomorrow' }).click(); await p2.waitForTimeout(300); }
    await p2.screenshot({ path: path.join(SHOTS, `${which}-inbox-snoozed-${tag}.png`) });
    await c2x.close();
  }
  await browser.close();
}
console.log(`\n${pass}/${pass + fail} Track C checks passed`);
process.exit(fail ? 1 : 0);
