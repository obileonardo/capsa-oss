// The app's first visit starts empty. The suites test against the labelled demo, so every new browser context sets
// capsa-first-run=sample before the first page load (the app reads it only when this browser has no library yet).
export function withSample(pw) {
  const patchBrowser = b => {
    const nc = b.newContext.bind(b);
    b.newContext = async (...a) => { const ctx = await nc(...a); await ctx.addInitScript(() => { try { if (!localStorage.getItem('capsa-first-run')) localStorage.setItem('capsa-first-run', 'sample'); } catch {} }); return ctx; };
    b.newPage = async (...a) => { const ctx = await b.newContext(...a); const page = await ctx.newPage(); page.close = (orig => async o => { await orig.call(page, o); await ctx.close(); })(page.close); return page; };
    return b;
  };
  for (const name of ['chromium', 'webkit', 'firefox']) {
    const t = pw[name]; if (!t) continue;
    const launch = t.launch.bind(t);
    t.launch = async (...a) => patchBrowser(await launch(...a));
  }
  return pw;
}
