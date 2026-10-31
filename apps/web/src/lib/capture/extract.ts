/* On-device extraction for pasted text (build-out Stage 2). No network, no AI: plain rules over the text.
 *
 * The pasted text is split into candidates, each keeping its exact words (a verbatim substring of what was pasted,
 * so the review screen can highlight it in place):
 *   - instruction-style text ("Act as…", "You are…", "Write…")      → prompt
 *   - text with [blanks]                                              → template
 *   - two or more numbered steps that aren't part of a prompt         → workflow
 *   - fenced code or JSON: MCP config → MCP server; SKILL.md → skill; other code → command or config
 * In "prompt" mode the user has said the whole paste is one prompt, so it becomes one candidate (a template if it
 * has blanks). Anything the rules can't place is left out; nothing is invented.
 *
 * Pure functions and type-only imports, so the fixture tests can run this file directly in Node. */
import type { ArtifactType } from '../types';

export type CaptureMode = 'auto' | 'prompt';

export interface Piece {
  type: ArtifactType;
  title: string;
  exact: string;      // verbatim from the normalised paste: text.slice(start, end)
  start: number;
  end: number;
  why: string;        // the rule that matched, shown to the user
}

/** Line endings are normalised once; offsets and the stored text both use the normalised form. */
export const normalisePaste = (raw: string) => raw.replace(/\r\n?/g, '\n');

/* ---------- small helpers ---------- */
const BLANK = /\[([^[\]\n]{1,48})\](?!\()/g;
/** XEV-06: blanks are [name] or {{name}} (Mustache style; not ${{ … }}, which is GitHub Actions). */
export const BLANK_ANY = /\[([^[\]\n]{1,48})\](?!\()|(?<!\$)\{\{\s*([^{}\n]{1,48}?)\s*\}\}/g;
/** A blank's name, or null for "[x]" checkboxes, "[1]" footnotes and "[ ]". */
export const blankName = (m: RegExpMatchArray): string | null => {
  const n = (m[1] ?? m[2] ?? '').trim();
  // quotes or braces mean code (a JSON array like ["-y", "pkg"]), not a blank
  return !/[a-z]/i.test(n) || /^x$/i.test(n) || /["'`{}]/.test(n) ? null : n;
};
/** Same rule as the Library's prompt fill: a [name] or {{name}} with a letter in it, not a "[x]" checkbox or "[1]" footnote. */
export function blanksIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(BLANK_ANY)) {
    const n = blankName(m);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}
/** "[blank]" or "{{blank}}" in the why notes, as the text writes them. */
const blankWord = (text: string, n: number) => {
  const square = [...text.matchAll(BLANK)].some(m => /[a-z]/i.test(m[1]) && !/^x$/i.test(m[1].trim()));
  return square ? `[blank${n === 1 ? '' : 's'}]` : `{{blank${n === 1 ? '' : 's'}}}`;
};

/* ---------- model parameters (XEV-06): "--ar 16:9 --v 6 --no text", kept as they are, never blanks ---------- */
export interface ModelParam { flag: string; value: string; text: string; start: number; end: number }
/** Midjourney-style parameters. Some flags take no value; --no takes the words up to the next flag or the line's end;
 * the rest take one value. */
const PARAM_FLAGS = new Set('ar aspect v version niji stylize s style chaos c quality q seed sameseed stop tile no iw weird w cref cw sref sw p personalize r repeat raw hd video loop draft fast relax turbo exp'.split(' '));
const PARAM_BOOL = new Set('tile raw hd video loop draft fast relax turbo'.split(' '));
const PARAM_OPTIONAL = new Set('p personalize niji'.split(' '));
export function modelParams(text: string): ModelParam[] {
  const out: ModelParam[] = [];
  for (const m of text.matchAll(/(^|[\s,(])--([a-z]+)\b/g)) {
    const flag = m[2].toLowerCase();
    if (!PARAM_FLAGS.has(flag)) continue;
    const start = m.index! + m[1].length;
    let end = start + 2 + m[2].length;
    let value = '';
    if (!PARAM_BOOL.has(flag)) {
      const rest = text.slice(end);
      const v = flag === 'no' ? rest.match(/^[ \t]+((?:(?![ \t]--)[^\n])+)/) : rest.match(/^[ \t]+([^\s-][^\s]*)/);
      if (v) { value = v[1].trim(); end += v[0].length; }
      else if (!PARAM_OPTIONAL.has(flag)) continue; // a flag that needs a value but has none isn't a parameter
    }
    out.push({ flag: `--${flag}`, value, text: text.slice(start, end).trim(), start, end });
  }
  return out;
}
/** "Negative prompt: …" (Stable Diffusion style), kept as written. */
export const negativePrompt = (text: string): string | null => text.match(/^\s*negative prompt\s*:\s*(.+)$/im)?.[1].trim() ?? null;

/* ---------- caution rules (XEV-03, XEV-16): what to look at before copying. Never "safe"; only "caution" ---------- */
export type CautionKind = 'remote-script' | 'destructive' | 'privilege' | 'permissions' | 'bypass' | 'injection';
export interface Caution { kind: CautionKind; text: string }
const CAUTION_RULES: { kind: CautionKind; re: RegExp; text: (m: RegExpMatchArray) => string }[] = [
  { kind: 'remote-script', re: /\b(?:curl|wget)\b[^\n|;&]*\|\s*(?:sudo\s+)?(?:ba|z|fi|da)?sh\b|\b(?:curl|wget)\b[^\n|;&]*\|\s*(?:sudo\s+)?(?:python3?|node|perl|ruby)\b/i, text: () => 'Downloads a script and runs it straight away (piped to a shell).' },
  { kind: 'remote-script', re: /\b(?:ba|z)?sh\s+<\(\s*(?:curl|wget)\b|\b(?:iex|Invoke-Expression)\b[^\n]*(?:irm|iwr|Invoke-RestMethod|Invoke-WebRequest|DownloadString)/i, text: () => 'Downloads a script and runs it straight away.' },
  { kind: 'destructive', re: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|-r\s+-f|-f\s+-r|--recursive\s+--force|--force\s+--recursive)\b/, text: m => `Deletes files and folders without asking (${m[0].trim()}).` },
  { kind: 'destructive', re: /\bgit\s+push\b[^\n]*\s(?:--force(?:-with-lease)?|-f)\b/, text: () => 'Overwrites history on the remote (git push --force).' },
  { kind: 'destructive', re: /\bgit\s+(?:reset\s+--hard|clean\s+-[a-zA-Z]*f)/, text: m => `Throws away uncommitted work (${m[0].trim()}).` },
  { kind: 'destructive', re: /\b(?:mkfs(?:\.\w+)?|dd\s+[^\n]*\bof=\/dev\/)|>\s*\/dev\/(?:sd[a-z]|disk\d|nvme)|:\(\)\s*\{\s*:\|:&\s*\};:/, text: () => 'Can wipe a disk or hang the computer.' },
  { kind: 'destructive', re: /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, text: m => `Deletes data in a database (${m[0].toUpperCase()}).` },
  { kind: 'privilege', re: /(?:^|[\s;&|(`$])sudo\s+\S/m, text: () => 'Runs with administrator rights (sudo).' },
  { kind: 'permissions', re: /\bchmod\s+(?:-R\s+)?(?:0?777|a\+rwx|ugo\+rwx)\b/, text: m => `Lets anyone read, change and run the files (${m[0]}).` },
  { kind: 'bypass', re: /--dangerously-[a-z-]+|--yolo\b|--no-sandbox\b|--disable-web-security\b|--insecure\b|\bcurl\s+[^\n]*\s-k\b/, text: m => `Turns off a safety check (${m[0].trim()}).` },
  { kind: 'injection', re: /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions|prompts?|messages|rules)\b/i, text: () => 'Tells an AI to ignore its earlier instructions.' },
  { kind: 'injection', re: /\b(?:do not|don't|never)\s+(?:tell|inform|mention (?:this )?to)\s+the\s+user\b/i, text: () => 'Tells an AI to hide something from its user.' },
];
/** Cautions the rules find in a piece of text, one per kind. Empty means "no caution found by rule", not "safe". */
export function cautionsFor(text: string): Caution[] {
  const out: Caution[] = [];
  for (const r of CAUTION_RULES) {
    if (out.some(c => c.kind === r.kind)) continue;
    const m = text.match(r.re);
    if (m) out.push({ kind: r.kind, text: r.text(m) });
  }
  return out;
}

const IMPERATIVE = new Set((
  'act analyse analyze answer assess audit brainstorm build check classify compare compose condense convert create critique debug ' +
  'describe design develop diagnose draft edit evaluate explain extract find fix format generate give help identify imagine improve ' +
  'list make map outline paraphrase plan polish prepare pretend produce proofread propose provide rank read refactor review rewrite ' +
  'score simplify sketch suggest summarise summarize tell transform translate turn walk write'
).split(' '));
const ROLE_START = /^(you are|you're|you will|act as|acting as|pretend|imagine you|i want you to|i need you to|i'd like you to|your (task|job|role|goal|mission) is|as an? [a-z]|from now on|please |can you|could you|help me|system:|role:|task:|instructions?:|persona:|context:)/i;

/** First line of a paragraph without list markers, quote marks, bold or a leading label. */
function lead(p: string): string {
  const first = p.split('\n').find(l => l.trim()) ?? '';
  return first.replace(/^\s*(?:>\s*)?(?:[-*•]\s+)?/, '').replace(/^[*_“"'‘(]+/, '').trim();
}
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Does this paragraph read as an instruction to an AI? A role ("You are…") or an imperative verb, with enough words. */
export function isInstruction(p: string): boolean {
  const l = lead(p);
  if (words(p) < 5) return false;
  if (ROLE_START.test(l)) return true;
  const w = l.split(/[\s,:;.!?]+/)[0]?.toLowerCase() ?? '';
  return IMPERATIVE.has(w);
}

const STEP = /^\s*(?:\d{1,2}[.)]|step\s+\d{1,2}\s*[:.)-]?)\s+\S/i;
const stepText = (s: string) => s.replace(/^\s*(?:\d{1,2}[.)]|step\s+\d{1,2}\s*[:.)-]?)\s+/i, '');

/** Code-like text: JSON that parses, or mostly lines that look like config, markup or shell. */
function looksLikeCode(t: string): boolean {
  const s = t.trim();
  if (!s) return false;
  if (/^[{[]/.test(s)) { try { JSON.parse(s); return true; } catch { /* fall through */ } }
  const lines = s.split('\n').filter(l => l.trim());
  const codey = lines.filter(l => /[{};=<>]|^\s*[\w.-]+:\s*\S|^\s*[\w.-]+:\s*$|^\s*(\$|npx|npm|pnpm|yarn|pip|uv|brew|curl|git|cd|export|claude|docker)\b|^\s*["'][\w.-]+["']\s*:/.test(l)).length;
  return codey / lines.length >= 0.5;
}

const firstWords = (t: string, max = 64): string => {
  const one = t.replace(/\s+/g, ' ').trim().replace(/^[*_“"'‘#>\-\s]+/, '');
  const sentence = one.split(/(?<=[.!?:])\s/)[0].replace(/[.:!?]+$/, '');
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 24)).replace(/[,;:\s]+$/, '') + '…';
};
const cleanTitle = (t: string) => t.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').replace(/[:：\s]+$/, '').replace(/^\*+|\*+$/g, '').trim();

/* ---------- blocks ---------- */
interface Line { text: string; start: number; end: number } // end excludes the newline
interface Block { kind: 'para' | 'code'; start: number; end: number; lang?: string; title?: string }
interface Section { title?: string; label?: ArtifactType; blocks: Block[] }

function linesOf(t: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  for (const text of t.split('\n')) { out.push({ text, start: pos, end: pos + text.length }); pos += text.length + 1; }
  return out;
}

const HEADING = /^\s{0,3}#{1,6}\s+(\S.*)$/;
const BOLD_HEADING = /^\s*\*\*([^*\n]{2,80})\*\*\s*:?\s*$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$/;
/** "Prompt:", "Prompt 2 –", "Template:", "Workflow:", "System prompt:" — a label that starts a new item. */
const LABEL = /^\s*(?:\*\*)?(system prompt|prompt|template|workflow|steps|skill|mcp(?: server)?|config)(?:\s*#?\d{1,2})?\s*(?:\*\*)?\s*[:：–-]\s*(?:\*\*)?\s*/i;
const LABEL_TYPE: Record<string, ArtifactType> = {
  'system prompt': 'prompt', prompt: 'prompt', template: 'template', workflow: 'workflow', steps: 'workflow', skill: 'skill', mcp: 'mcp_server', 'mcp server': 'mcp_server', config: 'command_config',
};

function sectionsOf(t: string): Section[] {
  const lines = linesOf(t);
  const sections: Section[] = [{ blocks: [] }];
  let cur = sections[0];
  let para: { start: number; end: number } | null = null;
  const endPara = () => { if (para) { cur.blocks.push({ kind: 'para', ...para }); para = null; } };
  const newSection = (title?: string, label?: ArtifactType) => { endPara(); cur = { title, label, blocks: [] }; sections.push(cur); };

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const fence = L.text.match(/^\s*(```+|~~~+)\s*([\w.+-]*)/);
    if (fence) {
      endPara();
      const close = lines.findIndex((x, j) => j > i && x.text.trim().startsWith(fence[1]));
      const last = close < 0 ? lines.length : close;
      const inner = lines.slice(i + 1, last);
      if (inner.length) cur.blocks.push({ kind: 'code', start: inner[0].start, end: inner[inner.length - 1].end, lang: fence[2].toLowerCase() });
      i = last;
      continue;
    }
    if (!L.text.trim()) { endPara(); continue; }
    if (RULE.test(L.text)) { newSection(); continue; }
    const h = L.text.match(HEADING) ?? L.text.match(BOLD_HEADING);
    if (h) { newSection(cleanTitle(h[1])); continue; }
    const lab = L.text.match(LABEL);
    if (lab) {
      const kind = LABEL_TYPE[lab[1].toLowerCase()];
      const rest = L.text.slice(lab[0].length);
      // "Prompt: Write a haiku…" — the item starts after the label. "Prompt: Code review" alone on its line is a title.
      if (rest.trim() && words(rest) >= 5) { newSection(undefined, kind); para = { start: L.start + lab[0].length, end: L.end }; }
      else newSection(rest.trim() ? cleanTitle(rest) : undefined, kind);
      continue;
    }
    if (para) para.end = L.end; else para = { start: L.start, end: L.end };
  }
  endPara();
  return sections.filter(s => s.blocks.length);
}

/* ---------- classification ---------- */
function codePiece(t: string, b: Block, sec: Section, prevPara?: string): Piece {
  const body = t.slice(b.start, b.end);
  const lang = b.lang ?? '';
  const exact = { exact: body, start: b.start, end: b.end };
  const hint = `${prevPara ?? ''}\n${sec.title ?? ''}`;

  // A fenced block of plain words is often a prompt shared as text.
  if (['', 'text', 'txt', 'prompt', 'markdown', 'md', 'plaintext'].includes(lang) && !looksLikeCode(body) && !/^---\n/.test(body)) {
    const blanks = blanksIn(body);
    const params = modelParams(body);
    if (isInstruction(body) || sec.label === 'prompt' || sec.label === 'template' || blanks.length || params.length) {
      const type: ArtifactType = blanks.length ? 'template' : 'prompt';
      return { type, title: sec.title || firstWords(params.length && !isInstruction(body) ? body.slice(0, params[0].start).trim() || body : body), ...exact,
        why: blanks.length ? `Has ${blanks.length} ${blankWord(body, blanks.length)} to fill, so it reads as a template.`
          : params.length && !isInstruction(body) ? `Has model parameters (${params.slice(0, 2).map(x => x.text).join(' ')}), so it reads as an image prompt. They’re kept as written.`
            : 'Plain words in a code block that start with an instruction, so it reads as a prompt.' };
    }
  }

  const fm = body.match(/^---\n([\s\S]*?)\n---/);
  const skillName = fm?.[1].match(/^name:\s*(.+)$/m)?.[1].trim();
  if (skillName || /SKILL\.md/i.test(hint) || sec.label === 'skill') {
    return { type: 'skill', title: skillName || sec.title || 'Skill', ...exact, why: skillName ? 'Has SKILL.md front matter (name and description), so it reads as a skill.' : 'Marked as a skill where you pasted it.' };
  }

  if (/"mcpServers"|"mcp_servers"|\[mcp_servers|modelcontextprotocol|\bclaude mcp add\b|\bmcp[-_ ]server/i.test(body) || /\bmcp\b/i.test(hint) || sec.label === 'mcp_server') {
    let names: string[] = [];
    try {
      const j = JSON.parse(body) as Record<string, unknown>;
      const servers = (j.mcpServers ?? j.mcp_servers ?? (j.mcp as Record<string, unknown> | undefined)?.servers) as Record<string, unknown> | undefined;
      if (servers && typeof servers === 'object') names = Object.keys(servers);
    } catch { /* not JSON */ }
    const add = body.match(/claude mcp add(?:\s+--?[\w-]+(?:[ =]\S+)?)*\s+([\w.@/-]+)/);
    if (!names.length && add) names = [add[1]];
    const toml = [...body.matchAll(/^\[mcp_servers\.([\w-]+)\]/gm)].map(m => m[1]);
    if (!names.length && toml.length) names = toml;
    const title = sec.title || (names.length ? `${names.join(', ')} MCP server${names.length > 1 ? 's' : ''}` : 'MCP server config');
    return { type: 'mcp_server', title, ...exact, why: 'A config that sets up an MCP server, so it reads as an MCP server.' };
  }

  const shell = lang === 'sh' || lang === 'bash' || lang === 'zsh' || lang === 'shell' || lang === 'console'
    || /^\s*(\$\s|npx |npm |pnpm |yarn |pip |uv |brew |curl |git |docker |claude )/.test(body);
  if (shell) {
    const first = body.split('\n').find(l => l.trim())!.replace(/^\s*\$\s*/, '').trim();
    return { type: 'command', title: sec.title || firstWords(first, 48), ...exact, why: 'Shell commands in a code block, so it reads as a command.' };
  }
  const kind = lang === 'json' || /^\s*[{[]/.test(body) ? 'JSON' : lang === 'yaml' || lang === 'yml' ? 'YAML' : lang === 'toml' ? 'TOML' : lang ? lang.toUpperCase() : 'Code';
  return { type: 'command_config', title: sec.title || `${kind} config`, ...exact, why: 'Code or config in a code block, so it reads as a command or config.' };
}

/** Prose runs between code blocks. */
function prosePieces(t: string, paras: Block[], sec: Section): Piece[] {
  if (!paras.length) return [];
  const text = (b: Block) => t.slice(b.start, b.end);
  const runEnd = paras[paras.length - 1].end;

  // Labelled items ("Prompt: …", "Template:") take the whole run as that type.
  const firstInstr = paras.findIndex(p => isInstruction(text(p)));
  const lines = paras.flatMap(p => linesOf(text(p)).map(l => ({ ...l, start: l.start + p.start, end: l.end + p.start })));
  const stepLines = lines.filter(l => STEP.test(l.text));

  const promptFrom = (i: number, why: string): Piece => {
    const start = paras[i].start;
    const exact = t.slice(start, runEnd);
    const blanks = blanksIn(exact);
    return {
      type: blanks.length ? 'template' : 'prompt', title: sec.title || firstWords(exact), exact, start, end: runEnd,
      why: blanks.length ? `${why} It has ${blanks.length} ${blankWord(exact, blanks.length)} to fill, so it’s kept as a template.` : why,
    };
  };

  if (sec.label === 'prompt' || sec.label === 'template') return [promptFrom(0, 'Marked as a prompt where you pasted it.')];

  const stepsFirst = stepLines.length >= 2 && (firstInstr < 0 || stepLines[0].start < paras[firstInstr].start || sec.label === 'workflow');
  if (stepLines.length >= 2 && (stepsFirst || sec.label === 'workflow')) {
    const first = stepLines[0], last = stepLines[stepLines.length - 1];
    const lastPara = paras.find(p => p.start <= last.start && last.end <= p.end)!;
    const start = first.start, end = lastPara.end;
    // The line just before the steps, when it introduces them ("My release routine:"), names the workflow.
    const before = lines.filter(l => l.end <= start).pop();
    const intro = before && /[:：]\s*$/.test(before.text) && before.text.length <= 90 ? cleanTitle(before.text) : '';
    return [{
      type: 'workflow', title: sec.title || intro || firstWords(stepText(first.text)),
      exact: t.slice(start, end), start, end, why: `${stepLines.length} numbered steps, so it reads as a workflow.`,
    }];
  }

  if (firstInstr >= 0) {
    const l = lead(text(paras[firstInstr]));
    const opener = l.split(/\s+/).slice(0, ROLE_START.test(l) ? 3 : 1).join(' ').replace(/[,:;.]+$/, '');
    return [promptFrom(firstInstr, `Starts with an instruction (“${opener}…”), so it reads as a prompt.`)];
  }

  const withBlanks = paras.filter(p => blanksIn(text(p)).length);
  if (withBlanks.length) {
    const start = withBlanks[0].start, end = withBlanks[withBlanks.length - 1].end;
    const exact = t.slice(start, end);
    const n = blanksIn(exact).length;
    return [{ type: 'template', title: sec.title || firstWords(exact.replace(BLANK_ANY, (_, a, b) => a ?? b)), exact, start, end, why: `Has ${n} ${blankWord(exact, n)} to fill, so it reads as a template.` }];
  }

  // XEV-06: an image prompt with model parameters ("a lighthouse at dusk --ar 16:9 --v 6") is a prompt; the parameters stay
  const withParams = paras.filter(p => modelParams(text(p)).length);
  if (withParams.length) {
    const start = withParams[0].start, end = withParams[withParams.length - 1].end;
    const exact = t.slice(start, end);
    const ps = modelParams(exact);
    const shown = ps.slice(0, 2).map(x => x.text).join(' ');
    return [{ type: 'prompt', title: sec.title || firstWords(exact.slice(0, ps[0].start).trim() || exact), exact, start, end, why: `Has model parameters (${shown}), so it reads as an image prompt. They’re kept as written.` }];
  }
  return [];
}

/** Unfenced JSON or a SKILL.md pasted on its own is one block of code. */
function wholeAsCode(t: string): Block | null {
  const s = t.trim();
  if (!s) return null;
  const start = t.indexOf(s), end = start + s.length;
  if (/^[{[]/.test(s)) { try { JSON.parse(s); return { kind: 'code', start, end, lang: 'json' }; } catch { /* not JSON */ } }
  const fm = s.startsWith('---\n') ? s.match(/^---\n([\s\S]*?)\n---(\n|$)/) : null;
  if (fm && /^name:\s*\S/m.test(fm[1])) return { kind: 'code', start, end, lang: 'skill' };
  return null;
}

export function findPieces(raw: string, mode: CaptureMode = 'auto'): Piece[] {
  const t = normalisePaste(raw);
  const s = t.trim();
  if (!s) return [];
  const start = t.indexOf(s), end = start + s.length;

  if (mode === 'prompt') {
    const blanks = blanksIn(s);
    return [{
      type: blanks.length ? 'template' : 'prompt', title: firstWords(s), exact: s, start, end,
      why: blanks.length ? `You marked this as a prompt. It has ${blanks.length} ${blankWord(s, blanks.length)}, so it’s kept as a template.` : 'You marked this as a prompt.',
    }];
  }

  const whole = wholeAsCode(t);
  if (whole) {
    if (whole.lang === 'skill') {
      const name = s.match(/^name:\s*(.+)$/m)?.[1].trim() ?? 'Skill';
      return [{ type: 'skill', title: name, exact: s, start, end, why: 'Has SKILL.md front matter (name and description), so it reads as a skill.' }];
    }
    return [codePiece(t, whole, { blocks: [whole] })];
  }

  const out: Piece[] = [];
  for (const sec of sectionsOf(t)) {
    let run: Block[] = [];
    let prev: string | undefined;
    const flush = () => { out.push(...prosePieces(t, run, sec)); run = []; };
    for (const b of sec.blocks) {
      if (b.kind === 'code') { flush(); out.push(codePiece(t, b, sec, prev)); }
      else { run.push(b); prev = t.slice(b.start, b.end); }
    }
    flush();
  }
  // Titles repeat when a section holds several items; number them so each candidate is distinct in review.
  const seen = new Map<string, number>();
  for (const p of out) seen.set(p.title, (seen.get(p.title) ?? 0) + 1);
  const n = new Map<string, number>();
  return out.sort((a, b) => a.start - b.start).map(p => {
    if ((seen.get(p.title) ?? 0) < 2) return p;
    const k = (n.get(p.title) ?? 0) + 1; n.set(p.title, k);
    return { ...p, title: `${p.title} (${k})` };
  });
}

/* ---------- XEV-12: what the rules left out, and why ---------- */
export interface LeftOut { text: string; locator: string; reason: string; start: number; end: number }
/** Tool names worth saying were only mentioned ("Mentioned only: Notion, Linear"). A short curated list; matching is by
 * whole word, so "cursor" in prose counts only as "Cursor". */
const KNOWN_TOOLS = ['Notion', 'Linear', 'Figma', 'Cursor', 'Claude Code', 'Claude', 'ChatGPT', 'Codex', 'Copilot', 'GitHub', 'GitLab', 'Vercel', 'Supabase', 'Netlify',
  'Cloudflare', 'Raycast', 'Obsidian', 'Slack', 'Discord', 'Zapier', 'Make', 'n8n', 'Airtable', 'Jira', 'Midjourney', 'Perplexity', 'Gemini', 'Windsurf', 'v0', 'Lovable',
  'Bolt', 'Replit', 'Docker', 'Postgres', 'Stripe', 'Sentry', 'Playwright', 'Puppeteer', 'LangChain', 'Ollama'];
export function mentionsIn(text: string): string[] {
  const out: string[] = [];
  for (const name of KNOWN_TOOLS) {
    const re = new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, name === 'Make' || name === 'Bolt' || name === 'Cursor' ? '' : 'i');
    if (re.test(text) && !out.some(o => o.toLowerCase().includes(name.toLowerCase()))) out.push(name);
  }
  return out;
}
/** Every paragraph or code block the splitter didn't turn into a candidate, with the reason, plus the tools named only
 * in those parts. Headings, labels and rules are titles, not content, so they aren't listed. Pure, so it can be worked
 * out again from a source's stored text at any time. */
export function leftOut(raw: string, mode: CaptureMode = 'auto'): { parts: LeftOut[]; mentions: string[] } {
  const t = normalisePaste(raw);
  if (!t.trim() || mode === 'prompt') return { parts: [], mentions: [] };
  const pieces = findPieces(t, mode);
  if (wholeAsCode(t)) return { parts: [], mentions: [] };
  const covered = (a: number, b: number) => pieces.some(p => a < p.end && b > p.start);
  const parts: LeftOut[] = [];
  for (const sec of sectionsOf(t)) for (const b of sec.blocks) {
    if (covered(b.start, b.end)) continue;
    const body = t.slice(b.start, b.end).trim();
    if (!body) continue;
    const reason = b.kind === 'code' ? 'Code the rules couldn’t place'
      : words(body) < 5 ? 'Too short to be an instruction'
        : /[:：]\s*$/.test(body) && body.length <= 90 ? 'Introduces what comes next'
          : 'No instruction, steps, blanks or code';
    const one = body.replace(/\s+/g, ' ');
    parts.push({ text: one.length > 120 ? one.slice(0, 117).replace(/\s+\S*$/, '') + '…' : one, locator: lineRange(t, b.start, b.end), reason, start: b.start, end: b.end });
  }
  const found = pieces.map(p => p.exact).join('\n');
  const mentions = mentionsIn(parts.map(p => t.slice(p.start, p.end)).join('\n')).filter(m => !new RegExp(`(?<![\\w-])${m}(?![\\w-])`, 'i').test(found));
  return { parts, mentions };
}

/** 1-based line numbers of a span, for the evidence locator ("lines 3–9"). */
export function lineRange(t: string, start: number, end: number): string {
  const a = t.slice(0, start).split('\n').length;
  const b = t.slice(0, Math.max(start, end - 1)).split('\n').length;
  return a === b ? `line ${a}` : `lines ${a}–${b}`;
}

/* ---------- links ---------- */
export type LinkKind = 'video' | 'github' | 'x' | 'article';
export interface LinkInfo { kind: LinkKind; host: string; title: string; display: string }

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A readable title and the site, read from the address only (nothing is fetched). */
export function describeLink(url: string): LinkInfo {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const parts = u.pathname.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  const display = host + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')) + (u.search && /youtube|youtu\.be/.test(host) ? u.search : '');
  if (/(^|\.)youtube\.com$|^youtu\.be$|(^|\.)vimeo\.com$|(^|\.)loom\.com$/.test(host)) {
    const site = /vimeo/.test(host) ? 'Vimeo' : /loom/.test(host) ? 'Loom' : 'YouTube';
    return { kind: 'video', host, title: `${site} video`, display };
  }
  if (/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(host)) {
    return { kind: 'x', host, title: parts[0] && parts[1] === 'status' ? `Post by @${parts[0]}` : parts[0] ? `@${parts[0]} on X` : 'Post on X', display };
  }
  if (host === 'github.com' || host === 'gist.github.com') {
    if (host === 'gist.github.com') return { kind: 'github', host, title: parts[0] ? `Gist by ${parts[0]}` : 'GitHub gist', display };
    const [owner, repo, kind, , ...rest] = parts;
    const file = kind === 'blob' || kind === 'tree' ? rest.join('/') : '';
    return { kind: 'github', host, title: owner && repo ? `${owner}/${repo}${file ? ` · ${file}` : ''}` : owner ? owner : 'GitHub', display };
  }
  // Articles: the last meaningful path segment, de-slugged ("how-i-review-prs" → "How i review prs").
  const slug = [...parts].reverse().find(p => /[a-z]{3}/i.test(p) && !/^(index|amp|p|post|posts|blog|article|articles)(\.\w+)?$/i.test(p));
  const name = slug?.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { kind: 'article', host, title: name && /[a-z]/i.test(name) && !/^[\da-f]{12,}$/i.test(name.replace(/\s/g, '')) ? titleCase(name) : host, display };
}
