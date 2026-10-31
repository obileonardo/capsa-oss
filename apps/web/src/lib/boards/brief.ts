/* Taste boards: grouping, numbering and the design brief (prompt / Markdown / ZIP manifest).
 * Ported from the working demo (tools/reference-board/board.template.html: where(), toBrief(), toMarkdown()).
 * Honesty rules: palettes are "measured from pixels"; the user's words are quoted verbatim; nothing here is AI-made;
 * every reference keeps its credit line (Legal roadmap Stage 0), whatever the include toggles say. */
import type { Aspect, Board, Prefs, Reference, Region, Rights, Swatch } from '@/lib/types';
import { hostOf, PROVIDER_NAME } from './links';
import { fmtFps, fmtTime, segmentText } from './motion';

export const pct = (v: number) => Math.round(v * 100);
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Plain-English position of a region, e.g. "top left, 30% × 20% of the image". */
export function where(r: Pick<Region, 'x' | 'y' | 'w' | 'h'>): string {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const v = cy < 0.34 ? 'top' : cy > 0.66 ? 'bottom' : 'middle';
  const h = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'centre';
  return `${v === 'middle' && h === 'centre' ? 'centre' : `${v} ${h}`}, ${pct(r.w)}% × ${pct(r.h)}% of the image`;
}

export const palTxt = (p?: Swatch[]) => (p ?? []).map(c => `${c.hex} ${pct(c.share)}%`).join(', ');

export const RIGHTS_LABEL: Record<Rights, string> = {
  unknown: 'Rights unknown',
  own: 'My own work',
  cc: 'Creative Commons',
  permission: 'Used with permission',
};

export function rightsText(r: Reference): string {
  if (r.rights === 'cc') return r.licence?.trim() ? `Creative Commons (${r.licence.trim()})` : 'Creative Commons (licence not recorded)';
  return RIGHTS_LABEL[r.rights];
}

/** Creator as recorded, or the honest fallback. Never invented. */
export const creatorOf = (r: Reference) => r.creator.trim() || 'credit unknown';
export const titleOf = (r: Reference) => r.title.trim() || (
  r.media === 'embed' && r.provider ? `${PROVIDER_NAME[r.provider]} ${r.provider === 'behance' ? 'project' : 'video'}`
    : r.media === 'link' ? `Link · ${hostOf(r.linkUrl ?? r.sourceUrl) || 'no address'}`
      : 'Untitled reference');

/** What kind of reference this is, in words (brief, credits, screen readers). */
export function mediaText(r: Reference): string {
  if (r.media === 'video') return `Motion clip, ${r.durationS != null ? `${r.durationS.toFixed(1)} s` : 'length unknown'}`;
  if (r.media === 'embed' && r.provider) return `${PROVIDER_NAME[r.provider]} ${r.provider === 'behance' ? 'project' : 'video'}, official embed (link only, not downloaded${r.startS ? `; starts at ${fmtTime(r.startS, 0)}` : ''})`;
  if (r.media === 'link') return 'Link only (not downloaded; open the original to see it)';
  if (r.mime === 'image/gif') return 'Animated GIF';
  return 'Image';
}

/** Only http(s) links are ever rendered as links. */
export function safeUrl(u: string): string | null {
  try { const x = new URL(u.trim()); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null; } catch { return null; }
}

export interface NumberedRef { ref: Reference; n: number }
export interface RefGroup { id: string | null; title: string; note: string; refs: NumberedRef[] }

/** Unsorted first, then sections in board order. Numbers run across the board in display order. */
export function groupRefs(board: Board, refs: Reference[]): RefGroup[] {
  const known = new Set(board.sections.map(x => x.id));
  const sorted = [...refs].sort((a, b) => a.order - b.order);
  const groups: RefGroup[] = [
    { id: null, title: 'Unsorted', note: '', refs: [] },
    ...board.sections.map(x => ({ id: x.id, title: x.title, note: x.note, refs: [] as NumberedRef[] })),
  ];
  const byId = new Map(groups.map(g => [g.id, g]));
  for (const r of sorted) (byId.get(r.sectionId && known.has(r.sectionId) ? r.sectionId : null)!).refs.push({ ref: r, n: 0 });
  let n = 0;
  for (const g of groups) for (const x of g.refs) x.n = ++n;
  return groups;
}

export const flatRefs = (groups: RefGroup[]) => groups.flatMap(g => g.refs);

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/bmp': 'bmp',
};
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40);
const CLIP_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
export function imageFile(n: number, r: Reference): string {
  const sl = slug(r.title);
  if (r.media === 'video') return `clips/ref-${pad2(n)}${sl ? `-${sl}` : ''}.${CLIP_EXT[r.mime] ?? 'video'}`;
  return `images/ref-${pad2(n)}${sl ? `-${sl}` : ''}.${EXT[r.mime] ?? 'img'}`;
}
/** The file a reference contributes to the ZIP, or null for embeds and links (nothing is downloaded). */
export const refFile = (n: number, r: Reference): string | null => (r.media === 'embed' || r.media === 'link' ? null : imageFile(n, r));
export const posterFile = (n: number, r: Reference) => imageFile(n, r).replace(/\.[a-z0-9]+$/, '-poster.png');
/** Region position, saying "frame" for regions marked on a paused clip frame. */
const whereIn = (g: Region) => (g.t != null ? where(g).replace('of the image', 'of the frame') : where(g));

/** Brief lines for a clip: studied range, measured timing, timestamped notes (verbatim). */
function clipLines(r: Reference, n: number, zip: boolean): string {
  let b = '';
  if (zip) b += `  - Poster frame: [${posterFile(n, r)}].\n`;
  if (r.loop?.active) b += `  - Studied range (looped): ${fmtTime(r.loop.in)} → ${fmtTime(r.loop.out)}.\n`;
  const m = r.timing;
  if (m) {
    const how = `measured from frames, sampled every ${Math.round(m.step * 1000)} ms at ${fmtFps(m.fps)} fps${m.fpsMeasured ? '' : ' (assumed)'}`;
    if (m.status === 'ok') b += `  - ${m.segments.length === 1 ? `Movement ${segmentText(m.segments[0])}` : `${m.segments.length} movements: ${m.segments.map(segmentText).join('; ')}`} (${how}; each edge within half a frame).\n`;
    else if (m.status === 'none') b += `  - No movement measured between ${fmtTime(m.range.from)} and ${fmtTime(m.range.to)} (${how}).\n`;
    else b += `  - Timing unclear (${how}): ${m.reason ?? 'the change between frames was not clear enough'}${m.segments.length ? ` Rough reading: ${m.segments.map(segmentText).join('; ')}.` : ''}\n`;
  }
  for (const note of r.notes ?? []) if (note.text.trim()) b += `  - At ${fmtTime(note.t)}: ${quote(note.text)}\n`;
  return b;
}
export const cropFile = (n: number, k: number) => `crops/ref-${pad2(n)}-region-${k}.png`;

export type BriefFormat = 'prompt' | 'markdown' | 'zip';
export interface BriefOptions {
  task: string;
  regions: boolean;
  palettes: boolean;
  avoid: boolean;
  credits: boolean; // the full credits section; each reference line always carries its credit
  format: BriefFormat;
}
export const DEFAULT_BRIEF: BriefOptions = { task: '', regions: true, palettes: true, avoid: true, credits: true, format: 'prompt' };
/** A board's brief options when they first open: DEFAULT_BRIEF with Settings › Briefs on top (prefs.briefDefaults).
 * Anything missing or malformed in the saved defaults falls back to DEFAULT_BRIEF; the task always starts empty. */
export function briefDefaults(p?: Prefs['briefDefaults']): BriefOptions {
  const o: BriefOptions = { ...DEFAULT_BRIEF };
  if (!p || typeof p !== 'object') return o;
  for (const k of ['regions', 'palettes', 'avoid', 'credits'] as const) if (typeof p[k] === 'boolean') o[k] = p[k]!;
  if (p.format === 'prompt' || p.format === 'markdown' || p.format === 'zip') o.format = p.format;
  return o;
}

const quote = (s: string) => `“${s.trim().replace(/\s*\n+\s*/g, ' ')}”`;
const lower = (xs: Aspect[]) => xs.join(', ').toLowerCase();
const dateText = (iso: string) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return iso; } };

export function creditLine(r: Reference): string {
  const url = safeUrl(r.sourceUrl);
  return `credit: ${creatorOf(r)}${url ? `, ${url}` : ', no source link recorded'}`;
}

export interface BriefStats { refs: number; regions: number; avoids: number; words: number }

export function buildBrief(board: Board, groups: RefGroup[], o: BriefOptions): string {
  const all = flatRefs(groups);
  const zip = o.format === 'zip';
  const likes: Aspect[] = [];
  const avoids: string[] = [];
  let b = `# Design brief: ${board.title.trim() || 'Untitled board'}\n`;
  if (o.task.trim()) b += `\n## Task\n\n${o.task.trim()}\n`;
  b += `\n## How to use this brief\n\nUse these references as visual direction. Follow what I like, don't copy any reference outright, and stay clear of everything under "Avoid". My own words are in quotes.`;
  if (o.palettes) b += ' Colour palettes were measured from the pixels (no AI).';
  b += all.some(x => x.ref.typeHints?.measured || x.ref.regions.some(g => g.typeHints?.measured))
    ? ' Type facts marked “measured” come from the pixels (on-device text detection, no AI); no typeface names are guessed.'
    : ' No typography was measured, so judge type from the images.';
  b += zip ? ' The images are in `images/`' + (o.regions ? ' and marked regions are cropped in `crops/`.' : '.') : ' Attach the images if your AI accepts them (the ZIP brief bundles them).';
  const clips = all.filter(x => x.ref.media === 'video');
  if (clips.length) {
    b += zip ? ' Motion clips are in `clips/`, unchanged, each with a poster frame.' : ' Attach the motion clips too if your AI accepts video.';
    if (clips.some(x => x.ref.notes?.length)) b += ' Times like 0:01.20 are minutes:seconds into the clip.';
    if (clips.some(x => x.ref.timing)) b += ' Timings marked "measured from frames" were measured on this device from pixel changes between frames, not guessed.';
  }
  if (all.some(x => x.ref.media === 'embed' || x.ref.media === 'link')) b += ' Embeds and links are not downloaded; open them at their address.';
  b += '\n';
  if (board.note.trim()) b += `\nWhat this board is for: ${quote(board.note)}\n`;

  if (!all.length) b += `\n_No references on this board yet._\n`;
  for (const g of groups) {
    if (!g.refs.length && !g.note.trim()) continue;
    const showHeading = g.id !== null || groups.some(x => x.id !== null && x.refs.length);
    if (showHeading) b += `\n## ${g.title.trim() || 'Untitled section'}\n`;
    else b += `\n## References\n`;
    if (g.note.trim()) b += `\nFor this part: ${quote(g.note)}\n`;
    if (g.refs.length) b += '\n';
    for (const { ref: r, n } of g.refs) {
      const file = refFile(n, r);
      const img = zip && file ? ` [${file}]` : '';
      const credit = ` (${creditLine(r)})`;
      const kind = r.media && r.media !== 'image' ? ` ${mediaText(r)}.` : '';
      if (r.avoid) {
        if (o.avoid) avoids.push(`Reference ${n}, ${titleOf(r)}${r.note.trim() ? `: ${quote(r.note)}` : ''}`);
        b += `- **Reference ${n} · ${titleOf(r)}**${img}${credit}.${kind} Don't want this.${r.note.trim() ? ` Why: ${quote(r.note)}` : ''}\n`;
      } else {
        b += `- **Reference ${n} · ${titleOf(r)}**${img}${credit}.${kind} I like: ${r.likes.length ? lower(r.likes) : 'the overall feel'}.${r.note.trim() ? ` ${quote(r.note)}` : ''}\n`;
        likes.push(...r.likes);
      }
      if (r.media === 'video') b += clipLines(r, n, zip);
      if (o.regions) r.regions.forEach((g2, i) => {
        const k = i + 1;
        const crop = zip ? ` [${cropFile(n, k)}]` : '';
        const at = g2.t != null ? ` at ${fmtTime(g2.t)}` : '';
        if (g2.avoid && o.avoid) avoids.push(`Reference ${n}, region ${k}${at} (${whereIn(g2)})${g2.note.trim() ? `: ${quote(g2.note)}` : ''}`);
        b += `  - ${g2.avoid ? 'Avoid' : 'Take'} region ${k}${at}, ${whereIn(g2)}${crop}${g2.likes.length ? `, for ${lower(g2.likes)}` : ''}.${g2.note.trim() ? ` ${quote(g2.note)}` : ''}${o.palettes && g2.palette?.length ? ` Measured colours: ${palTxt(g2.palette)}.` : ''}${g2.typeHints?.measured ? ` Measured type: ${g2.typeHints.measured.brief}` : ''}\n`;
        if (!g2.avoid) likes.push(...g2.likes);
      });
      if (r.typeHints?.measured) b += `  - Type (measured from pixels): ${r.typeHints.measured.brief}\n`;
      if (o.palettes && r.palette?.length) b += r.media === 'video'
        ? `  - Poster-frame palette (measured from pixels at ${fmtTime(r.posterT ?? 0)}): ${palTxt(r.palette)}.\n`
        : `  - Whole-image palette (measured from pixels): ${palTxt(r.palette)}.\n`;
    }
  }

  if (o.avoid && avoids.length) b += `\n## Avoid\n\n${avoids.map(a => `- ${a}`).join('\n')}\n`;

  const freq = new Map<string, number>();
  likes.forEach(a => freq.set(a, (freq.get(a) ?? 0) + 1));
  const top = [...freq].sort((a, b2) => b2[1] - a[1]).slice(0, 4);
  if (top.length) b += `\n## What matters most to me (counted from my marks)\n\n${top.map(([a, c]) => `- ${a}: ${c}`).join('\n')}\n`;

  if (o.credits && all.length) {
    b += `\n## Credits\n\n`;
    b += all.map(({ ref: r, n }) => {
      const url = safeUrl(r.sourceUrl);
      const emb = r.embedded && (r.embedded.creator || r.embedded.copyright)
        ? ` From the image file: ${[r.embedded.creator && `creator ${r.embedded.creator}`, r.embedded.copyright && `copyright ${r.embedded.copyright}`].filter(Boolean).join(', ')}.` : '';
      const dm = r.embedded?.noDataMining ? ' The image file says: no data mining.' : '';
      const kind = r.media && r.media !== 'image' ? ` ${mediaText(r)}.` : '';
      return `- Reference ${n}: ${titleOf(r)}.${kind} Creator: ${creatorOf(r)}. Source: ${url ?? 'not recorded'}. ${rightsText(r)}. Saved ${dateText(r.capturedAt)}.${emb}${dm}`;
    }).join('\n') + '\n';
    b += `\nThese references belong to their creators unless marked as my own work. Use them for direction only.\n`;
  }
  const timed = all.some(x => x.ref.timing);
  b += `\n---\n\nMade with Capsa on this device. Palettes: measured from pixels.${timed ? ' Timings: measured from frames.' : ''} Likes, avoids and notes: mine. AI-written text: none. Type hints: not included.\n`;
  return b;
}

export function briefStats(groups: RefGroup[], text: string, o: BriefOptions): BriefStats {
  const all = flatRefs(groups);
  return {
    refs: all.length,
    regions: o.regions ? all.reduce((a, x) => a + x.ref.regions.length, 0) : 0,
    avoids: all.reduce((a, x) => a + (x.ref.avoid ? 1 : 0) + (o.regions ? x.ref.regions.filter(g => g.avoid).length : 0), 0),
    words: text.split(/\s+/).filter(Boolean).length,
  };
}

/** Machine-readable companion to brief.md. Credits are always included. */
export function buildManifest(board: Board, groups: RefGroup[], o: BriefOptions) {
  return {
    kind: 'capsa.design-brief',
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: 'Capsa web v1 (on this device)',
    board: { title: board.title, note: board.note, demo: !!board.demo },
    task: o.task.trim() || null,
    labels: { palette: 'measured_from_pixels', timing: 'measured_from_frames', userWords: 'verbatim', ai: 'none', typeHints: 'not_included' },
    sections: groups.filter(g => g.id !== null).map(g => ({ id: g.id, title: g.title, note: g.note })),
    references: flatRefs(groups).map(({ ref: r, n }) => ({
      n,
      media: r.media ?? 'image',
      file: refFile(n, r),
      poster: r.media === 'video' ? posterFile(n, r) : null,
      section: groups.find(g => g.refs.some(x => x.ref.id === r.id))?.title ?? 'Unsorted',
      title: r.title || null,
      credit: {
        creator: r.creator.trim() || null,
        creditUnknown: !r.creator.trim(),
        sourceUrl: safeUrl(r.sourceUrl),
        capturedAt: r.capturedAt,
        rights: r.rights,
        licence: r.rights === 'cc' ? (r.licence?.trim() || null) : null,
        embedded: r.embedded ?? null,
      },
      size: r.media === 'embed' || r.media === 'link' ? null : { width: r.width, height: r.height, mime: r.mime },
      clip: r.media === 'video' ? {
        durationS: r.durationS ?? null,
        fps: r.fps ?? null,
        fpsMeasured: !!r.fpsMeasured,
        posterT: r.posterT ?? 0,
        loop: r.loop?.active ? { in: r.loop.in, out: r.loop.out } : null,
        notes: (r.notes ?? []).map(x => ({ t: x.t, at: fmtTime(x.t), text: x.text })),
        timing: r.timing ? {
          method: r.timing.method, status: r.timing.status, reason: r.timing.reason ?? null, range: r.timing.range,
          fps: r.timing.fps, fpsMeasured: r.timing.fpsMeasured, stepS: r.timing.step,
          movements: r.timing.segments.map(g => ({ startS: g.start, endS: g.end, durationMs: Math.round((g.end - g.start) * 1000), lastStillFrameS: g.lastStill, firstSettledFrameS: g.firstSettled })),
        } : null,
      } : null,
      link: r.media === 'embed' || r.media === 'link' ? { url: r.linkUrl ?? null, embedUrl: r.embedUrl ?? null, provider: r.provider ?? null, startS: r.startS ?? null, downloaded: false } : null,
      avoid: r.avoid,
      likes: r.likes,
      note: r.note,
      palette: { method: 'measured_from_pixels', swatches: r.palette ?? [] },
      regions: r.regions.map((g, i) => ({
        k: i + 1,
        crop: o.regions ? cropFile(n, i + 1) : null,
        rect: { x: g.x, y: g.y, w: g.w, h: g.h, units: g.t != null ? 'fraction_of_frame' : 'fraction_of_image' },
        t: g.t ?? null,
        where: whereIn(g),
        avoid: g.avoid,
        likes: g.likes,
        note: g.note,
        palette: { method: 'measured_from_pixels', swatches: g.palette ?? [] },
      })),
      demo: !!r.demo,
    })),
  };
}
