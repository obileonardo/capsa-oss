/* Importers (IMP-01, IMP-07, IMP-08, IMP-10; Track A 25 Oct): turn export files into plain records. All on this device.
 *   - browser bookmarks: the Netscape bookmark HTML every browser exports (Chrome, Edge, Firefox, Safari), which Raindrop
 *     and Pocket's old export also use
 *   - Raindrop, Instapaper and Pocket CSV exports (columns found by name)
 *   - prompts: CSV or JSON with a column mapping, or a folder of Markdown files (one prompt per file)
 *   - notes: Markdown or text files (an Obsidian vault, a Markdown folder); found pieces keep their file and lines
 * Pure functions and type-only imports, so the tests run this file directly in Node. */
import { blanksIn, findPieces, lineRange, type Piece } from '../capture/extract';

/* ---------- CSV (RFC 4180: quoted fields, doubled quotes, newlines inside quotes; comma, semicolon or tab) ---------- */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const firstLine = t.slice(0, t.indexOf('\n') < 0 ? t.length : t.indexOf('\n'));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = count('\t') > count(',') && count('\t') >= count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f !== '')) rows.push(row);
  return rows;
}

const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const attr = (attrs: string, name: string) => {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : undefined;
};
const isWeb = (u: string) => /^https?:\/\/[^\s/]+\.[^\s]+/i.test(u.trim());
const splitTags = (s?: string) => (s ?? '').split(/[,|]/).map(x => x.trim().replace(/^#/, '')).filter(Boolean);
const toISO = (v?: string): string | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  const d = Number.isFinite(n) && v.trim() !== '' ? new Date(n > 1e12 ? n : n * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1995 ? undefined : d.toISOString();
};

/* ---------- links ---------- */
export interface ImportLink {
  url: string;
  title: string;
  /** Bookmark folder path ("Bookmarks bar / AI"), Raindrop collection or Instapaper folder. */
  folder?: string;
  tags?: string[];
  addedAt?: string;
  /** The person's own note or highlight from the other service. */
  note?: string;
  /** GitHub stars: language and whether the repository is archived or a fork. */
  labels?: string[];
}
export interface LinkFile { service: 'bookmarks' | 'raindrop' | 'instapaper' | 'pocket' | 'links'; links: ImportLink[]; skipped: number }

/** The Netscape bookmark file (and Pocket's old ril_export.html). Folders nest; non-web addresses are skipped. */
export function parseBookmarksHtml(html: string): LinkFile {
  const links: ImportLink[] = [];
  let skipped = 0;
  const stack: (string | null)[] = [];
  let pending: string | null = null;
  const re = /<h[13]\b[^>]*>([\s\S]*?)<\/h[13]>|<a\s([^>]*)>([\s\S]*?)<\/a>|<dl\b[^>]*>|<\/dl>/gi;
  for (const m of html.matchAll(re)) {
    const tag = m[0].slice(0, 3).toLowerCase();
    // the file's own heading (<H1>Bookmarks</H1>) isn't a folder; <H3> names the folder whose <DL> follows
    if (m[1] !== undefined) { pending = /^<h1/i.test(m[0]) ? null : decode(m[1].replace(/<[^>]*>/g, '').trim()) || null; continue; }
    if (tag === '<dl') { stack.push(pending); pending = null; continue; }
    if (tag === '</d') { stack.pop(); continue; }
    const href = attr(m[2], 'href') ?? '';
    if (!isWeb(href)) { skipped++; continue; }
    const folderPath = stack.filter((x): x is string => !!x);
    links.push({
      url: href.trim(), title: decode(m[3].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()) || href.trim(),
      folder: folderPath.length ? folderPath.join(' / ') : undefined,
      tags: splitTags(attr(m[2], 'tags')), addedAt: toISO(attr(m[2], 'add_date') ?? attr(m[2], 'time_added')),
    });
  }
  const pocket = /ril_export|Pocket Export/i.test(html.slice(0, 2000));
  return { service: pocket ? 'pocket' : 'bookmarks', links, skipped };
}

const col = (head: string[], ...names: string[]) => head.findIndex(h => names.includes(h.trim().toLowerCase()));

/** Raindrop (id,title,note,excerpt,url,folder,tags,created…), Instapaper (URL,Title,Selection,Folder,Timestamp) and Pocket
 * (title,url,time_added,tags,status) CSV exports, or any CSV with a url column. */
export function parseLinkCsv(text: string): LinkFile {
  const rows = parseCsv(text);
  const head = (rows[0] ?? []).map(h => h.trim().toLowerCase());
  const u = col(head, 'url', 'link', 'href', 'address');
  if (u < 0) return { service: 'links', links: [], skipped: Math.max(0, rows.length - 1) };
  const ti = col(head, 'title', 'name'), fo = col(head, 'folder', 'collection'), ta = col(head, 'tags', 'tag', 'labels');
  const cr = col(head, 'created', 'time_added', 'timestamp', 'date', 'added', 'created_at');
  const no = col(head, 'note', 'selection', 'excerpt', 'description', 'highlights');
  const service: LinkFile['service'] = head.includes('excerpt') && head.includes('cover') ? 'raindrop'
    : head.includes('selection') ? 'instapaper' : head.includes('time_added') ? 'pocket' : 'links';
  const links: ImportLink[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const url = (r[u] ?? '').trim();
    if (!isWeb(url)) { skipped++; continue; }
    const note = no >= 0 ? (r[no] ?? '').trim() : '';
    links.push({
      url, title: (ti >= 0 ? r[ti] ?? '' : '').trim() || url,
      folder: fo >= 0 && r[fo]?.trim() && !/^(unread|unsorted)$/i.test(r[fo].trim()) ? r[fo].trim() : undefined,
      tags: ta >= 0 ? splitTags(r[ta]) : [], addedAt: cr >= 0 ? toISO(r[cr]) : undefined, note: note || undefined,
    });
  }
  return { service, links, skipped };
}

/** A links file of either kind, by its content. */
export function parseLinkFile(name: string, text: string): LinkFile {
  return /^\s*</.test(text) || /\.html?$/i.test(name) ? parseBookmarksHtml(text) : parseLinkCsv(text);
}

/* ---------- prompts (IMP-08) ---------- */
export interface Table { columns: string[]; rows: string[][] }
export interface PromptMapping { title: number; text: number; tags: number }
export interface ImportPrompt { title: string; text: string; tags: string[]; where: string; template: boolean }

/** A CSV or JSON prompts file as a table (JSON: an array of objects or strings, or { prompts: [...] }). */
export function promptTable(name: string, text: string): Table {
  if (/\.json$/i.test(name) || /^\s*[[{]/.test(text)) {
    let data: unknown;
    try { data = JSON.parse(text); } catch { return { columns: [], rows: [] }; }
    const list = Array.isArray(data) ? data : data && typeof data === 'object'
      ? (Object.values(data as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? [] : [];
    if (list.every(x => typeof x === 'string')) return { columns: ['text'], rows: (list as string[]).map(x => [x]) };
    const objs = list.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
    const columns = [...new Set(objs.flatMap(o => Object.keys(o).filter(k => ['string', 'number'].includes(typeof o[k]) || (Array.isArray(o[k]) && (o[k] as unknown[]).every(v => typeof v === 'string')))))];
    return { columns, rows: objs.map(o => columns.map(c => { const v = o[c]; return Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v); })) };
  }
  const rows = parseCsv(text);
  return { columns: rows[0]?.map(c => c.trim()) ?? [], rows: rows.slice(1) };
}

/** A first guess at which column is which: by name, and otherwise the longest text is the prompt. -1: none. */
export function guessMapping(t: Table): PromptMapping {
  const lc = t.columns.map(c => c.toLowerCase().trim());
  const find = (...names: string[]) => lc.findIndex(c => names.includes(c));
  let text = find('prompt', 'text', 'content', 'body', 'template', 'instruction', 'instructions', 'system', 'system prompt', 'message');
  if (text < 0 && t.columns.length) {
    const avg = t.columns.map((_, i) => t.rows.slice(0, 50).reduce((n, r) => n + (r[i]?.length ?? 0), 0));
    text = avg.indexOf(Math.max(...avg));
  }
  let title = find('title', 'name', 'act', 'label', 'subject', 'heading');
  if (title === text) title = -1;
  const tags = find('tags', 'tag', 'category', 'categories', 'labels', 'folder');
  return { title, text, tags: tags === text || tags === title ? -1 : tags };
}

const firstLine = (s: string) => s.replace(/\s+/g, ' ').trim().split(/(?<=[.!?:])\s/)[0].slice(0, 80).replace(/[.:!?]+$/, '');
const hasVars = (s: string) => blanksIn(s).length > 0 || /\{\{\s*[\w .-]{1,40}\s*\}\}/.test(s);

/** Rows to prompts with the mapping; empty prompts are left out. `where` is the row, for the evidence ("row 12"). */
export function promptsFromTable(name: string, t: Table, m: PromptMapping): { prompts: ImportPrompt[]; empty: number } {
  const prompts: ImportPrompt[] = [];
  let empty = 0;
  t.rows.forEach((r, i) => {
    const text = (r[m.text] ?? '').replace(/\r\n?/g, '\n').trim();
    if (!text) { empty++; return; }
    const title = (m.title >= 0 ? (r[m.title] ?? '').trim() : '') || firstLine(text);
    prompts.push({ title, text, tags: m.tags >= 0 ? splitTags(r[m.tags]) : [], where: `${name}, ${t.columns.length === 1 && t.columns[0] === 'text' ? 'item' : 'row'} ${i + (t.columns.length === 1 && t.columns[0] === 'text' ? 1 : 2)}`, template: hasVars(text) });
  });
  return { prompts, empty };
}

/** Front matter (---\n…\n---) split off; its tags and title are read. `bodyAt` is where the body starts in the file. */
export function frontMatter(text: string): { body: string; bodyAt: number; title?: string; tags: string[] } {
  const m = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { body: text, bodyAt: 0, tags: [] };
  const fm = m[1];
  const title = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  const inline = fm.match(/^tags:[ \t]*\[([^\]]*)\]/m)?.[1] ?? fm.match(/^tags:[ \t]*([^\n[]+)$/m)?.[1];
  const listed = fm.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m)?.[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean) ?? [];
  const tags = [...splitTags(inline?.replace(/["']/g, '')), ...listed.map(x => x.replace(/["'#]/g, ''))];
  return { body: text.slice(m[0].length), bodyAt: m[0].length, title, tags };
}

export interface TextFile { path: string; text: string }

/** One prompt per Markdown or text file: the title is the front matter's, the first heading or the file name. */
export function promptsFromFiles(files: TextFile[]): ImportPrompt[] {
  return files.flatMap(f => {
    const t = f.text.replace(/\r\n?/g, '\n');
    const { body, title, tags } = frontMatter(t);
    let text = body.trim();
    const h = text.match(/^#{1,3}\s+(.+)\n+/);
    const heading = h?.[1].trim();
    if (h) text = text.slice(h[0].length).trim();
    if (!text) return [];
    const name = f.path.split('/').pop()!.replace(/\.(md|markdown|txt)$/i, '');
    return [{ title: title || heading || name, text, tags, where: f.path, template: hasVars(text) }];
  });
}

/* ---------- notes (IMP-10) ---------- */
export interface NotePiece extends Piece { path: string; locator: string; fileText: string }

/** Pieces found in each note by the capture box's rules, with the note's path and lines. Front matter is left out of the
 * search but kept in the stored text, so the line numbers match the file. */
export function piecesFromNotes(files: TextFile[]): { pieces: NotePiece[]; empty: number } {
  const pieces: NotePiece[] = [];
  let empty = 0;
  for (const f of files) {
    const t = f.text.replace(/\r\n?/g, '\n');
    const { body, bodyAt } = frontMatter(t);
    const found = findPieces(body);
    if (!found.length) { empty++; continue; }
    for (const p of found) {
      const start = p.start + bodyAt, end = p.end + bodyAt;
      pieces.push({ ...p, start, end, path: f.path, fileText: t, locator: `${f.path}, ${lineRange(t, start, end)}` });
    }
  }
  return { pieces, empty };
}

/** Markdown and text files only, without hidden folders (.obsidian, .trash, .git). */
export const isNoteFile = (path: string) => /\.(md|markdown|txt)$/i.test(path) && !path.split('/').some(p => p.startsWith('.'));
