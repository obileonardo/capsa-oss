/* Files (CAP-06, XEV-04; Track A 25 Oct): a Markdown, text or PDF file, split on this device by the capture box's rules.
 * Each find keeps its anchor: the lines in a text file, or the page (and its lines) in a PDF. A transcript file (.srt,
 * .vtt) gets time-linked finds instead. Pure functions and type-only imports, so the tests run this file directly in Node. */
import { findPieces, lineRange, normalisePaste, type Piece } from './extract';
import { parseTranscript, transcriptPieces } from './transcript';

export type DocKind = 'md' | 'txt' | 'pdf' | 'transcript';
export interface DocPage { n: number; text: string }
export interface DocPiece extends Piece { segId: string; locator: string; t?: string; tEnd?: string }
export interface DocSegment { id: string; label: string; text: string }

/** At most this many finds per file, so a long document doesn't flood the review (the first ones are kept). */
export const MAX_FILE_FINDS = 50;
export const MAX_TEXT_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_PAGES = 500;

export function docKind(name: string, mime = ''): DocKind | null {
  if (/\.pdf$/i.test(name) || mime === 'application/pdf') return 'pdf';
  if (/\.(srt|vtt)$/i.test(name) || mime === 'text/vtt' || mime === 'application/x-subrip') return 'transcript';
  if (/\.(md|markdown|mdx)$/i.test(name) || mime === 'text/markdown') return 'md';
  if (/\.(txt|text)$/i.test(name) || mime === 'text/plain') return 'txt';
  return null;
}

/** Finds in a text file (Markdown, text or a transcript), with one stored segment: the file's text. */
export function piecesFromTextFile(name: string, raw: string): { pieces: DocPiece[]; segments: DocSegment[]; capped: boolean; transcript: boolean } {
  const text = normalisePaste(raw).replace(/^﻿/, '');
  const tr = parseTranscript(text);
  if (tr) {
    const all = transcriptPieces(tr).map(p => ({ ...p, segId: 'file', locator: `from ${name}, ${p.tEnd ? `${p.t}–${p.tEnd}` : p.t}` }));
    return { pieces: all.slice(0, MAX_FILE_FINDS), segments: [{ id: 'file', label: name, text: tr.text }], capped: all.length > MAX_FILE_FINDS, transcript: true };
  }
  const all = findPieces(text).map(p => ({ ...p, segId: 'file', locator: `from ${name}, ${lineRange(text, p.start, p.end)}` }));
  return { pieces: all.slice(0, MAX_FILE_FINDS), segments: [{ id: 'file', label: name, text: text.trim() ? text : '' }], capped: all.length > MAX_FILE_FINDS, transcript: false };
}

/** Finds in a PDF's pages, each anchored to its page and lines there. Pages without text are counted, not guessed at. */
export function piecesFromPages(name: string, pages: DocPage[]): { pieces: DocPiece[]; segments: DocSegment[]; capped: boolean; textless: number } {
  const segments: DocSegment[] = [];
  const all: DocPiece[] = [];
  let textless = 0;
  for (const pg of pages) {
    const text = normalisePaste(pg.text);
    if (!text.trim()) { textless++; continue; }
    const segId = `p${pg.n}`;
    segments.push({ id: segId, label: `Page ${pg.n}`, text });
    for (const p of findPieces(text)) all.push({ ...p, segId, locator: `from ${name}, page ${pg.n}, ${lineRange(text, p.start, p.end)}` });
  }
  return { pieces: all.slice(0, MAX_FILE_FINDS), segments, capped: all.length > MAX_FILE_FINDS, textless };
}

/** Text items from one PDF page (pdf.js getTextContent) as lines and paragraphs: a new line at each end of line, and a
 * blank line where the gap to the next line is clearly bigger than the line spacing. */
export interface PdfItem { str: string; hasEOL?: boolean; transform?: number[]; height?: number }
export function pageText(items: PdfItem[]): string {
  const lines: { y: number; h: number; text: string }[] = [];
  let cur = '', y: number | null = null, h = 0;
  const push = () => { if (cur.trim() || lines.length) lines.push({ y: y ?? 0, h, text: cur.replace(/\s+$/, '') }); cur = ''; y = null; h = 0; };
  for (const it of items) {
    const iy = it.transform?.[5];
    if (y !== null && iy !== undefined && Math.abs(iy - y) > Math.max(2, (it.height ?? h) * 0.6) && cur) push();
    if (y === null && iy !== undefined) { y = iy; }
    h = Math.max(h, it.height ?? 0);
    cur += it.str;
    if (it.hasEOL) push();
  }
  if (cur) push();
  const gaps = lines.slice(1).map((l, i) => Math.abs(lines[i].y - l.y)).filter(g => g > 0).sort((a, b) => a - b);
  // the line spacing: the lower quartile of the gaps, but no more than 1.3 lines of text (a page of few lines can't say)
  const heights = lines.map(l => l.h).filter(x => x > 0).sort((x, y) => x - y);
  const lineH = heights.length ? heights[Math.floor(heights.length / 2)] * 1.3 : Infinity;
  const usual = gaps.length ? Math.min(gaps[Math.floor(gaps.length / 4)], lineH) : 0;
  let out = '';
  lines.forEach((l, i) => {
    if (i > 0) {
      const gap = Math.abs(lines[i - 1].y - l.y);
      out += usual && gap > usual * 1.6 ? '\n\n' : '\n';
    }
    out += l.text;
  });
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
