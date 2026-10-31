/* Secrets and personal data in pasted text (XEV-15), found on this device by plain patterns. Nothing is sent anywhere.
 * Advisory only: the person decides whether to mask before keeping. A match is "looks like", never a verdict.
 *
 * Masking replaces each match with an <ANGLE_PLACEHOLDER> (not [brackets], which the splitter reads as blanks to fill),
 * the same way every time, so masking a source's stored text, its candidates' exact words and their quotes keeps every
 * quote a verbatim slice of the masked text.
 *
 * Pure functions with no imports, so the fixture checks can run this file directly in Node. */

export type SensitiveKind = 'secret' | 'personal';
export interface SensitiveHit {
  kind: SensitiveKind;
  /** what it looks like, in words: "OpenAI API key", "Email address" */
  label: string;
  /** what it becomes when masked */
  placeholder: string;
  start: number;
  end: number;
  /** 1-based line number of the start */
  line: number;
}

interface Rule { kind: SensitiveKind; label: string; placeholder: string; re: RegExp; /** capture group holding the value (default: whole match) */ group?: number; check?: (v: string) => boolean }

/** Values that are already placeholders ("<your key>", "${TOKEN}", "YOUR_API_KEY", "xxxx", "sk-...") aren't secrets. */
const PLACEHOLDER_VALUE = /^(?:<[^>]*>|\$\{?[A-Z_][A-Z0-9_]*\}?|\{\{[^}]*\}\}|%[A-Z_]+%|(?:your|my|the)[-_ ]?\w*|x{3,}|\*{3,}|\.{3,}|…|changeme|placeholder|example\w*|test|dummy|redacted|none|null|true|false)$/i;
const notPlaceholder = (v: string) => !PLACEHOLDER_VALUE.test(v.trim().replace(/^["']|["']$/g, ''));

function luhn(digits: string): boolean {
  const d = digits.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

/* Order matters: earlier rules win where matches overlap (a specific key beats the generic "key = value" rule). */
const RULES: Rule[] = [
  { kind: 'secret', label: 'Private key', placeholder: '<PRIVATE_KEY>', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g },
  { kind: 'secret', label: 'Anthropic API key', placeholder: '<ANTHROPIC_API_KEY>', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'secret', label: 'OpenAI API key', placeholder: '<OPENAI_API_KEY>', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  { kind: 'secret', label: 'GitHub token', placeholder: '<GITHUB_TOKEN>', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g },
  { kind: 'secret', label: 'Slack token', placeholder: '<SLACK_TOKEN>', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: 'secret', label: 'AWS access key', placeholder: '<AWS_ACCESS_KEY_ID>', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { kind: 'secret', label: 'Google API key', placeholder: '<GOOGLE_API_KEY>', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'secret', label: 'Stripe key', placeholder: '<STRIPE_KEY>', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/g },
  { kind: 'secret', label: 'Hugging Face token', placeholder: '<HF_TOKEN>', re: /\bhf_[A-Za-z0-9]{30,}/g },
  { kind: 'secret', label: 'JSON web token', placeholder: '<JWT>', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: 'secret', label: 'Bearer token', placeholder: '<TOKEN>', re: /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/g, group: 1, check: notPlaceholder },
  { kind: 'secret', label: 'Password in a link', placeholder: '<PASSWORD>', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]{3,})@/gi, group: 1, check: notPlaceholder },
  // KEY=value, "apiKey": "value", token: value … with a long literal value
  { kind: 'secret', label: 'Key or password', placeholder: '<SECRET>', re: /\b[\w.-]*(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|auth)[\w.-]*["']?\s*[:=]\s*["']?([^\s"',;}{]{8,})/gi, group: 1,
    check: v => notPlaceholder(v) && !/^(?:https?:|process\.env|env\.|os\.environ|getenv)/i.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v) },
  { kind: 'personal', label: 'Email address', placeholder: '<EMAIL>', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    check: v => !/@(?:example\.(?:com|org|net)|users\.noreply\.github\.com)$/i.test(v) && !/^(?:noreply|no-reply|git)@/i.test(v) },
  { kind: 'personal', label: 'Card number', placeholder: '<CARD_NUMBER>', re: /\b(?:\d[ -]?){12,18}\d\b/g, check: luhn },
  { kind: 'personal', label: 'Phone number', placeholder: '<PHONE>', re: /(?<![\w.:/-]|\d[ .-])(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d{2,4}[ .-]\d{3,4}[ .-]\d{3,4}(?![\w.:/-]|[ .-]\d)/g,
    check: v => { const d = v.replace(/\D/g, ''); return d.length >= 10 && d.length <= 15 && !/^(?:19|20)\d{2}[ .-]\d{2}[ .-]\d{2}$/.test(v.trim()); } },
];

/** Every secret or piece of personal data the patterns find, in order, without overlaps. */
export function findSensitive(text: string): SensitiveHit[] {
  const hits: SensitiveHit[] = [];
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => !taken.some(([x, y]) => a < y && b > x);
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      const g = r.group ?? 0;
      const v = m[g];
      if (!v) continue;
      const start = m.index! + (g ? m[0].indexOf(v) : 0), end = start + v.length;
      if (r.check && !r.check(v)) continue;
      if (!free(start, end)) continue;
      taken.push([start, end]);
      hits.push({ kind: r.kind, label: r.label, placeholder: r.placeholder, start, end, line: text.slice(0, start).split('\n').length });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** The text with every match replaced by its placeholder. Deterministic, so the same words always mask the same way. */
export function maskSensitive(text: string, hits = findSensitive(text)): string {
  let out = '', last = 0;
  for (const h of hits) { out += text.slice(last, h.start) + h.placeholder; last = h.end; }
  return out + text.slice(last);
}

/** "2 secrets and 1 piece of personal data" style summary counts, by label: [["OpenAI API key", 1], …]. */
export function sensitiveSummary(hits: SensitiveHit[]): { label: string; kind: SensitiveKind; count: number; lines: number[] }[] {
  const m = new Map<string, { label: string; kind: SensitiveKind; count: number; lines: number[] }>();
  for (const h of hits) {
    const cur = m.get(h.label) ?? { label: h.label, kind: h.kind, count: 0, lines: [] };
    cur.count++; if (!cur.lines.includes(h.line)) cur.lines.push(h.line);
    m.set(h.label, cur);
  }
  return [...m.values()];
}
