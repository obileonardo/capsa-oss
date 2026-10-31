'use client';
/* ZIP brief: brief.md, manifest.json, the original image and clip files unchanged, a poster frame per clip, and region
 * crops whose PNG metadata carries the credit (Author / Source / Copyright / Description, written as iTXt). Regions
 * marked on a clip are cropped from that paused frame. Embeds and links add nothing (they are never downloaded).
 * Built on the device. */
import { db } from '@/lib/db';
import { addPngText, cropRegion } from '@/lib/imaging';
import type { Board } from '@/lib/types';
import { zip, type ZipEntry } from '@/lib/zip';
import { buildBrief, buildManifest, creatorOf, cropFile, flatRefs, imageFile, posterFile, rightsText, safeUrl, titleOf, where, type BriefOptions, type RefGroup } from './brief';
import { sourceImage } from './images';
import { fmtTime, framePng, hasFile } from './motion';

export interface BundleResult { blob: Blob; files: number; crops: number; missing: number; posters: number }

export async function buildBundle(board: Board, groups: RefGroup[], opts: BriefOptions): Promise<BundleResult> {
  const o = { ...opts, format: 'zip' as const };
  const enc = new TextEncoder();
  const files: ZipEntry[] = [
    { name: 'brief.md', data: enc.encode(buildBrief(board, groups, o)) },
    { name: 'manifest.json', data: enc.encode(JSON.stringify(buildManifest(board, groups, o), null, 2)) },
  ];
  let crops = 0, missing = 0;
  let posters = 0;
  for (const { ref: r, n } of flatRefs(groups)) {
    if (!hasFile(r)) continue; // embeds and links: link only
    const blob = await db.getBlob(r.imageKey);
    if (!blob) { missing++; continue; }
    files.push({ name: imageFile(n, r), data: new Uint8Array(await blob.arrayBuffer()) }); // unchanged bytes, metadata intact
    const url = safeUrl(r.sourceUrl);
    const credit = {
      Author: creatorOf(r),
      Source: url ?? 'not recorded',
      Copyright: r.embedded?.copyright ? `${r.embedded.copyright} · ${rightsText(r)}` : rightsText(r),
    };
    if (r.media === 'video') {
      // the poster frame at full size; if this browser can't decode the clip, the stored poster thumbnail
      let poster: Blob | null = await framePng(r, r.posterT ?? 0).catch(() => null);
      if (poster) poster = await addPngText(poster, { ...credit, Description: `Poster frame at ${fmtTime(r.posterT ?? 0)} of reference ${n} "${titleOf(r)}" (${imageFile(n, r)}) on the Capsa board "${board.title}".` });
      else if (r.thumbKey) poster = (await db.getBlob(r.thumbKey)) ?? null;
      if (poster) {
        const name = poster.type === 'image/png' ? posterFile(n, r) : posterFile(n, r).replace(/\.png$/, '.jpg');
        files.push({ name, data: new Uint8Array(await poster.arrayBuffer()) });
        posters++;
      }
    }
    if (!o.regions || !r.regions.length) continue;
    for (const [i, g] of r.regions.entries()) {
      const img = await sourceImage(r, g.t);
      if (!img) continue;
      const k = i + 1;
      const png = await cropRegion(img, g);
      const from = g.t != null ? `the frame at ${fmtTime(g.t)} of reference ${n}` : `reference ${n}`;
      const tagged = await addPngText(png, {
        ...credit,
        Description: `Region ${k} (${g.avoid ? 'avoid' : 'like'}; ${where(g)}) cropped from ${from} "${titleOf(r)}" (${imageFile(n, r)}) on the Capsa board "${board.title}".${g.note.trim() ? ` Note: ${g.note.trim()}` : ''}`,
      });
      files.push({ name: cropFile(n, k), data: new Uint8Array(await tagged.arrayBuffer()) });
      crops++;
    }
  }
  return { blob: zip(files), files: files.length, crops, missing, posters };
}

export const bundleName = (board: Board) =>
  `${(board.title.trim() || 'board').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'board'}-design-brief.zip`;
