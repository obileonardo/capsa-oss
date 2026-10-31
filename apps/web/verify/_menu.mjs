// An open menu must be usable where it is: fully inside the viewport, taller than one row (all rows shown, or it
// scrolls), and its last row must be on top, so that elementFromPoint at that row's centre hits the menu itself and
// not a card, bar or sheet painted over it. Returns { ok, detail }.
export async function menuFit(handle) {
  return handle.evaluate(el => {
    const vis = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const rows = [...el.querySelectorAll('button, a[href], [role^="menuitem"], [role="option"]')].filter(vis)
      .filter((e, i, all) => !all.some(o => o !== e && o.contains(e)));
    const r = el.getBoundingClientRect();
    const bad = [];
    const px = n => Math.round(n);
    if (r.top < -0.5 || r.left < -0.5 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5)
      bad.push(`outside the viewport: ${px(r.left)},${px(r.top)} to ${px(r.right)},${px(r.bottom)} in ${innerWidth}x${innerHeight}`);
    if (!rows.length) bad.push('no rows');
    else {
      const rowH = rows[0].getBoundingClientRect().height;
      if (r.height <= rowH) bad.push(`${px(r.height)}px tall, not taller than one ${px(rowH)}px row`);
      const cs = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 1 && !/auto|scroll/.test(cs.overflowY)) bad.push('rows cut off and it does not scroll');
      el.scrollTop = el.scrollHeight;   // bring the last row into view inside the menu (never scrolls the page)
      const lr = rows[rows.length - 1].getBoundingClientRect();
      const hit = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
      if (!hit || !el.contains(hit)) bad.push(`last row “${rows[rows.length - 1].textContent.trim().slice(0, 30)}” is covered by ${hit ? hit.tagName.toLowerCase() + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.split(' ')[0] : '') : 'nothing (off screen)'}`);
      el.scrollTop = 0;
    }
    return { ok: bad.length === 0, detail: bad.length ? bad.join('; ') : `${px(r.width)}x${px(r.height)} at ${px(r.left)},${px(r.top)}, ${rows.length} rows` };
  });
}
