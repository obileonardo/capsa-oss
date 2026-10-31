/* Reuse helpers (Track C, 25 Oct). Pure.
 *
 * RUS-04 "Send to": copy the prompt, then open the app's new-chat page. On 25 Oct 2026 none of these vendors documents
 * a URL that opens a chat with a prompt filled in (Claude's ?q=, ChatGPT's ?q= and Perplexity's ?q= work by word of
 * mouth only, and Microsoft quietly turned Copilot's off after a prompt-injection report), so Capsa never puts the
 * prompt in an address: it copies, then opens the page. Re-check before switching any of them to a prefilled link.
 *
 * MNT-09 "Written for a retired model": a small curated list from each vendor's own deprecation page. It needs upkeep:
 * add models as vendors retire them, and update CHECKED. Informational only; an old prompt may still work elsewhere. */

export interface SendTarget { id: string; label: string; open: string; checked: string; prefill: false }
export const SEND_TARGETS: SendTarget[] = [
  { id: 'claude', label: 'Claude', open: 'https://claude.ai/new', checked: '25 Oct 2026', prefill: false },
  { id: 'chatgpt', label: 'ChatGPT', open: 'https://chatgpt.com/', checked: '25 Oct 2026', prefill: false },
  { id: 'gemini', label: 'Gemini', open: 'https://gemini.google.com/app', checked: '25 Oct 2026', prefill: false },
  { id: 'perplexity', label: 'Perplexity', open: 'https://www.perplexity.ai/', checked: '25 Oct 2026', prefill: false },
  { id: 'lechat', label: 'Le Chat', open: 'https://chat.mistral.ai/chat', checked: '25 Oct 2026', prefill: false },
];

export interface RetiredModel { names: RegExp; model: string; vendor: string; retired: string; source: string }
export const RETIRED_CHECKED = '25 Oct 2026';
const ANTHROPIC = 'https://platform.claude.com/docs/en/about-claude/model-deprecations';
const OPENAI = 'https://developers.openai.com/api/docs/deprecations';
const GOOGLE = 'https://ai.google.dev/gemini-api/docs/changelog';
/** Matched in prompt text by model id (and the common way of writing it). Order: most specific first. */
export const RETIRED_MODELS: RetiredModel[] = [
  { names: /\bclaude[- ]instant(?:[- ]1(?:\.\d)?)?\b/i, model: 'Claude Instant', vendor: 'Anthropic', retired: '2024-11-06', source: ANTHROPIC },
  { names: /\bclaude[- ]1(?:\.\d)?\b/i, model: 'Claude 1', vendor: 'Anthropic', retired: '2024-11-06', source: ANTHROPIC },
  { names: /\bclaude[- ]2(?:\.[01])?\b/i, model: 'Claude 2', vendor: 'Anthropic', retired: '2025-07-21', source: ANTHROPIC },
  { names: /\bclaude-3-sonnet-20240229\b|\bclaude 3 sonnet\b/i, model: 'Claude 3 Sonnet', vendor: 'Anthropic', retired: '2025-07-21', source: ANTHROPIC },
  { names: /\bclaude-3-5-sonnet-\d{8}\b|\bclaude 3\.5 sonnet\b/i, model: 'Claude 3.5 Sonnet', vendor: 'Anthropic', retired: '2025-10-28', source: ANTHROPIC },
  { names: /\bclaude-3-opus-\d{8}\b|\bclaude 3 opus\b/i, model: 'Claude 3 Opus', vendor: 'Anthropic', retired: '2026-01-05', source: ANTHROPIC },
  { names: /\bclaude-3-5-haiku-\d{8}\b|\bclaude 3\.5 haiku\b/i, model: 'Claude 3.5 Haiku', vendor: 'Anthropic', retired: '2026-02-19', source: ANTHROPIC },
  { names: /\bclaude-3-7-sonnet-\d{8}\b|\bclaude 3\.7 sonnet\b/i, model: 'Claude 3.7 Sonnet', vendor: 'Anthropic', retired: '2026-02-19', source: ANTHROPIC },
  { names: /\bclaude-3-haiku-20240307\b|\bclaude 3 haiku\b/i, model: 'Claude 3 Haiku', vendor: 'Anthropic', retired: '2026-04-20', source: ANTHROPIC },
  { names: /\btext-davinci-00[123]\b/i, model: 'text-davinci', vendor: 'OpenAI', retired: '2024-01-04', source: OPENAI },
  { names: /\bcode-davinci-002\b/i, model: 'code-davinci-002', vendor: 'OpenAI', retired: '2024-01-04', source: OPENAI },
  { names: /\bgpt-3\.5-turbo-(?:0301|0613|16k-0613)\b/i, model: 'GPT-3.5 Turbo (0301, 0613)', vendor: 'OpenAI', retired: '2024-09-13', source: OPENAI },
  { names: /\bgpt-4-(?:1106-)?vision-preview\b/i, model: 'GPT-4 Vision preview', vendor: 'OpenAI', retired: '2024-12-06', source: OPENAI },
  { names: /\bgpt-4-32k(?:-\d{4})?\b/i, model: 'GPT-4 32k', vendor: 'OpenAI', retired: '2025-06-06', source: OPENAI },
  { names: /\bgpt-4\.5-preview\b|\bgpt-4\.5\b/i, model: 'GPT-4.5 preview', vendor: 'OpenAI', retired: '2025-07-14', source: OPENAI },
  { names: /\bo1-preview\b/i, model: 'o1-preview', vendor: 'OpenAI', retired: '2025-07-28', source: OPENAI },
  { names: /\bo1-mini\b/i, model: 'o1-mini', vendor: 'OpenAI', retired: '2025-10-27', source: OPENAI },
  { names: /\bgpt-4-0314\b/i, model: 'gpt-4-0314', vendor: 'OpenAI', retired: '2026-03-26', source: OPENAI },
  { names: /\bgemini[- ]1\.0[- ]pro\b|\bgemini-pro\b/i, model: 'Gemini 1.0 Pro', vendor: 'Google', retired: '2025-02-18', source: GOOGLE },
  { names: /\bgemini[- ]1\.5[- ](?:pro|flash)(?:-8b)?\b/i, model: 'Gemini 1.5', vendor: 'Google', retired: '2025-09-29', source: GOOGLE },
  { names: /\bGoogle Bard\b|\bBard\b(?= (?:AI|chat|prompt))/, model: 'Bard (now Gemini)', vendor: 'Google', retired: '2024-02-08', source: 'https://blog.google/products-and-platforms/products/gemini/bard-gemini-advanced-app/' },
];
/** The retired models a prompt names, at most one per model, retired on or before `now`. */
export function retiredIn(text: string | null | undefined, now = new Date()): RetiredModel[] {
  if (!text) return [];
  return RETIRED_MODELS.filter(m => m.names.test(text) && new Date(m.retired) <= now);
}
export const retiredDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
