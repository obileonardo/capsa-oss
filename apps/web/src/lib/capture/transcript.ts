/* Transcripts (EXT-05, Track A 25 Oct): a pasted SRT, WebVTT or timestamped transcript becomes time-linked candidates.
 * The cues are joined into plain text (one cue per line; a new paragraph after a pause or a change of speaker), the same
 * on-device rules as the capture box find prompts, steps, [blanks] and code in it, and each find keeps the time of the
 * cues it came from. Only transcripts the person supplies are read; nothing is fetched and no AI is used.
 *
 * Pure functions and type-only imports, so the tests run this file directly in Node. */
import { blanksIn, findPieces, isInstruction, type Piece } from './extract';

export type TranscriptFormat = 'srt' | 'vtt' | 'timestamps';
export interface Cue { start: number; end?: number; text: string; speaker?: string }
export interface Transcript {
  format: TranscriptFormat;
  cues: Cue[];
  /** The words alone: the stored text that evidence quotes come from. */
  text: string;
  /** Where each cue's words sit in `text`. */
  spans: { start: number; end: number; cue: number }[];
}

const TIME = String.raw`(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?`;
const ARROW = new RegExp(`^\\s*${TIME}\\s*-->\\s*${TIME}`);
const secs = (h?: string, m?: string, s?: string, ms?: string) =>
  (Number(h ?? 0) * 3600) + Number(m ?? 0) * 60 + Number(s ?? 0) + (ms ? Number(ms.padEnd(3, '0')) / 1000 : 0);

/** "MM:SS", or "H:MM:SS" from an hour on (the review screens read both). */
export function stamp(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(x).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Cue markup out: <v Name>, <c.class>, <00:00:01.000>, <i>, {\an8} and the like. Returns the words and the speaker. */
function cleanCue(t: string): { text: string; speaker?: string } {
  const v = t.match(/<v(?:\.[\w.-]+)?\s+([^>]+)>/);
  const text = t.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return { text, speaker: v?.[1].trim() };
}

function parseCueBlocks(raw: string): Cue[] {
  const cues: Cue[] = [];
  let prevLines: string[] = [];
  for (const block of raw.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex(l => ARROW.test(l));
    if (at < 0) continue; // the WEBVTT header, NOTE, STYLE and REGION blocks
    const m = lines[at].match(ARROW)!;
    const start = secs(m[1], m[2], m[3], m[4]), end = secs(m[5], m[6], m[7], m[8]);
    const { text, speaker } = cleanCue(lines.slice(at + 1).join('\n'));
    // Rolling captions (YouTube's own VTT) repeat the previous cue's line before the new one: keep only what's new.
    const fresh = text.split('\n').filter(l => !prevLines.includes(l));
    prevLines = text.split('\n');
    if (!fresh.length) { if (cues.length) cues[cues.length - 1].end = Math.max(cues[cues.length - 1].end ?? 0, end); continue; }
    cues.push({ start, end, text: fresh.join(' '), speaker });
  }
  return cues;
}

/** "0:12 words", "[00:12] words", "(1:02:03) words", "00:12 - words", or a time alone on its line with the words after it
 * (YouTube's "Show transcript" copy). */
const STAMP_LINE = new RegExp(`^\\s*[\\[(]?${TIME}[\\])]?\\s*(?:[-–—:|]\\s*)?(.*)$`);
function parseTimestamped(raw: string): Cue[] {
  const cues: Cue[] = [];
  let cur: Cue | null = null;
  for (const line of raw.split('\n')) {
    const m = line.match(STAMP_LINE);
    if (m && !/^\s*\d{1,2}:\d{2}\s*(am|pm)\b/i.test(line)) {
      if (cur) cues.push(cur);
      const rest = m[5].trim();
      const sp = rest.match(/^([A-Z][\w .'-]{0,30}):\s+(.*)$/);
      cur = { start: secs(m[1], m[2], m[3], m[4]), text: sp ? sp[2] : rest, speaker: sp?.[1] };
    } else if (cur && line.trim()) {
      cur.text = cur.text ? `${cur.text} ${line.trim()}` : line.trim();
    }
  }
  if (cur) cues.push(cur);
  return cues.filter(c => c.text.trim());
}

/** Which kind of transcript this is, or null when it isn't one. Timestamped text needs at least three stamped lines
 * making up most of the lines with words, and times that don't go backwards. */
export function detectTranscript(raw: string): TranscriptFormat | null {
  const t = raw.replace(/\r\n?/g, '\n').trim();
  if (!t) return null;
  if (/^WEBVTT\b/.test(t)) return 'vtt';
  const arrows = t.split('\n').filter(l => ARROW.test(l)).length;
  if (arrows >= 2) return /^\d+\s*\n/.test(t) || /\n\d+\n\s*\d/.test(t) ? 'srt' : 'vtt';
  const lines = t.split('\n').filter(l => l.trim());
  const stamped = lines.filter(l => STAMP_LINE.test(l) && !/^\s*\d{1,2}[.)]\s/.test(l));
  if (stamped.length < 3 || stamped.length < lines.length * 0.4) return null;
  const cues = parseTimestamped(t);
  const rising = cues.every((c, i) => i === 0 || c.start >= cues[i - 1].start);
  return rising && cues.length >= 3 ? 'timestamps' : null;
}

/** Parse a transcript into cues and the plain text that evidence quotes come from. Null when it isn't a transcript. */
export function parseTranscript(raw: string): Transcript | null {
  const t = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const format = detectTranscript(t);
  if (!format) return null;
  const cues = format === 'timestamps' ? parseTimestamped(t) : parseCueBlocks(t);
  if (!cues.length) return null;
  // A pause (gap of 2 s or more, or three times the usual step when cues have no end) or a new speaker starts a paragraph.
  const steps = cues.slice(1).map((c, i) => c.start - cues[i].start).filter(x => x > 0).sort((a, b) => a - b);
  const usual = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
  let text = '';
  const spans: Transcript['spans'] = [];
  cues.forEach((c, i) => {
    if (i > 0) {
      const p = cues[i - 1];
      const gap = p.end !== undefined ? c.start - p.end : c.start - p.start;
      const pause = p.end !== undefined ? gap >= 2 : usual > 0 && gap >= usual * 3;
      const newSpeaker = !!c.speaker && c.speaker !== p.speaker;
      text += pause || newSpeaker ? '\n\n' : '\n';
    }
    const start = text.length;
    text += c.text;
    spans.push({ start, end: text.length, cue: i });
  });
  return { format, cues, text, spans };
}

export interface TimedPiece extends Piece { t: string; tEnd?: string }

/** Speech has no paragraphs, so the rules run on each stretch between pauses: a prompt starts at the first cue that reads
 * as an instruction and runs to the next pause (not to the end of the talk); steps and code are found as in a paste. */
function stretchPieces(text: string, spans: Transcript['spans']): Piece[] {
  const out: Piece[] = [];
  let i = 0;
  while (i < spans.length) {
    let j = i;
    while (j + 1 < spans.length && text.slice(spans[j].end, spans[j + 1].start) === '\n') j++;
    const from = spans[i].start, to = spans[j].end;
    const lines = spans.slice(i, j + 1);
    const k = lines.findIndex(s => isInstruction(text.slice(s.start, to)) || blanksIn(text.slice(s.start, s.end)).length > 0);
    const stepsBefore = k > 0 && lines.slice(0, k).some(s => /^\s*(?:\d{1,2}[.)]|step\s+\d{1,2}\b)/i.test(text.slice(s.start, s.end)));
    const at = k >= 0 && !stepsBefore ? lines[k].start : from;
    for (const p of findPieces(text.slice(at, to))) out.push({ ...p, start: p.start + at, end: p.end + at });
    i = j + 1;
  }
  return out;
}

/** Candidates in a transcript, each with the time of the cues its words came from. */
export function transcriptPieces(tr: Transcript): TimedPiece[] {
  return stretchPieces(tr.text, tr.spans).map(p => {
    const over = tr.spans.filter(s => s.end > p.start && s.start < p.end);
    const first = tr.cues[over[0]?.cue ?? 0];
    const last = tr.cues[over[over.length - 1]?.cue ?? 0];
    const endT = last.end ?? last.start;
    const t = stamp(first.start), tEnd = stamp(endT);
    return { ...p, t, tEnd: tEnd !== t ? tEnd : undefined };
  });
}

export const FORMAT_LABEL: Record<TranscriptFormat, string> = { srt: 'SRT', vtt: 'WebVTT', timestamps: 'timestamped text' };
