/* Demo data for Deleted (design review, 25 Oct): part of "Try with sample data", so the Deleted page can be seen full,
 * grouped by Today, This week and Older. DEMONSTRATION DATA, FICTIONAL, like demo-data.ts: every title, author and URL
 * here was written for the demo. Every entry is marked demo, so Remove demo data takes it out with the rest. Times are
 * relative to when the demo is loaded; the oldest is 26 days ago, so "After 30 days" keeps them all for a few days. */
import type { Artifact, ArtifactType, Source, SourceKind, TrashEntry, TrashFrom } from './types';

type ItemSeed = { kind: 'artifact'; type: ArtifactType; title: string; purpose: string; via?: TrashFrom['via']; collections?: string[] };
type SourceSeed = { kind: 'source'; source: SourceKind; title: string; column: 'review' | 'progress' | 'nothing' | 'done'; author?: string; url?: string };
type Seed = (ItemSeed | SourceSeed) & { when: [number, 'today' | 'days'] };

const REUSE = { kind: 'collection', id: 'c-reuse', name: 'Prompts I reuse' } as const;
const AGENT = { kind: 'collection', id: 'c-agent', name: 'Agent setup' } as const;
const BOARD = { kind: 'board', id: 'b-demo-calm', name: 'Calm interfaces' } as const;

// when: [fraction of today already gone, 'today'] or [days ago, 'days']
const SEEDS: Seed[] = [
  { kind: 'artifact', type: 'prompt', title: 'Rewrite this error message for a non-technical reader', purpose: 'Turns a raw error into one plain sentence and a next step.', via: REUSE, collections: ['c-reuse'], when: [0.05, 'today'] },
  { kind: 'source', source: 'video', title: 'Prompt patterns for code review (demo talk)', column: 'review', author: 'Demo Channel (fictional)', url: 'https://www.youtube.com/watch?v=DEMO-review', when: [0.12, 'today'] },
  { kind: 'artifact', type: 'skill', title: 'Changelog from merged pull requests', purpose: 'A skill that drafts a changelog section from merged pull request titles.', via: AGENT, collections: ['c-agent'], when: [0.2, 'today'] },
  { kind: 'artifact', type: 'reference', title: 'Generous line height in settings pages', purpose: 'A saved reference for spacing in dense settings screens.', via: BOARD, when: [0.35, 'today'] },
  { kind: 'source', source: 'x', title: '“Thread: the five prompts I use every morning”', column: 'nothing', author: '@demo_maker (fictional)', url: 'https://x.com/demo_maker/status/1', when: [0.5, 'today'] },
  { kind: 'artifact', type: 'technique', title: 'Ask for the riskiest assumption first', purpose: 'Before a plan, ask the model to name the assumption most likely to be wrong.', when: [0.7, 'today'] },
  { kind: 'artifact', type: 'mcp_server', title: 'Calendar lookup server', purpose: 'An MCP server that answers free/busy questions from a local calendar file.', via: AGENT, collections: ['c-agent'], when: [1, 'days'] },
  { kind: 'source', source: 'github', title: 'demo-org/commit-message-skill', column: 'done', url: 'https://github.com/demo-org/commit-message-skill', when: [1, 'days'] },
  { kind: 'artifact', type: 'template', title: 'Bug report template with “expected” and “actual”', purpose: 'A fill-in template for clear bug reports.', via: REUSE, collections: ['c-reuse'], when: [2, 'days'] },
  { kind: 'artifact', type: 'workflow', title: 'Weekly inbox clean-up', purpose: 'Five steps to clear the capture inbox on Fridays.', when: [2, 'days'] },
  { kind: 'source', source: 'article', title: 'Notes on writing prompts that age well', column: 'review', author: 'Demo Writer (fictional)', url: 'https://demo-notes.example/prompts-that-age', when: [3, 'days'] },
  { kind: 'artifact', type: 'command', title: 'Find large files in a repository', purpose: 'A shell one-liner that lists the biggest tracked files.', when: [3, 'days'] },
  { kind: 'artifact', type: 'prompt', title: 'Summarise a meeting into decisions and owners', purpose: 'Lists each decision with who owns it and by when.', via: REUSE, collections: ['c-reuse'], when: [4, 'days'] },
  { kind: 'source', source: 'manual', title: 'Pasted text', column: 'done', when: [5, 'days'] },
  { kind: 'artifact', type: 'reference', title: 'Muted colour palette for empty states', purpose: 'A saved reference for quiet empty-state colours.', via: BOARD, when: [5, 'days'] },
  { kind: 'artifact', type: 'tool', title: 'Screenshot diffing app', purpose: 'Compares two screenshots and highlights what moved.', when: [8, 'days'] },
  { kind: 'source', source: 'video', title: 'Shipping a menu bar app in a weekend (demo)', column: 'progress', author: 'Demo Channel (fictional)', url: 'https://www.youtube.com/watch?v=DEMO-menubar', when: [9, 'days'] },
  { kind: 'artifact', type: 'prompt', title: 'Explain this diff to a reviewer', purpose: 'Writes a short reviewer-facing summary of a diff.', via: REUSE, collections: ['c-reuse'], when: [11, 'days'] },
  { kind: 'artifact', type: 'command_config', title: 'Formatter settings for Markdown files', purpose: 'A config that keeps Markdown line breaks as written.', when: [12, 'days'] },
  { kind: 'artifact', type: 'skill', title: 'Accessibility checklist runner', purpose: 'A skill that walks a page through a short accessibility checklist.', via: AGENT, collections: ['c-agent'], when: [14, 'days'] },
  { kind: 'source', source: 'article', title: 'A field guide to local-first apps (demo)', column: 'nothing', author: 'Demo Writer (fictional)', url: 'https://demo-notes.example/local-first', when: [15, 'days'] },
  { kind: 'artifact', type: 'technique', title: 'Name the reader before you write', purpose: 'Start every prompt by saying who will read the answer.', when: [17, 'days'] },
  { kind: 'artifact', type: 'workflow', title: 'Release checklist for a small web app', purpose: 'Build, test, tag, deploy and announce, in order.', via: AGENT, collections: ['c-agent'], when: [19, 'days'] },
  { kind: 'source', source: 'github', title: 'demo-org/prompt-linter', column: 'review', url: 'https://github.com/demo-org/prompt-linter', when: [21, 'days'] },
  { kind: 'artifact', type: 'template', title: 'Design critique template', purpose: 'Three questions for a design critique: goal, friction, next step.', via: BOARD, when: [23, 'days'] },
  { kind: 'artifact', type: 'prompt', title: 'Turn notes into a short status update', purpose: 'Three bullet points: done, next, blocked.', when: [26, 'days'] },
];

const STATUS: Record<SourceSeed['column'], Source['status']> = { review: 'review', progress: 'processing', nothing: 'nothing', done: 'reviewed' };
const DAY = 86_400_000;

export function demoTrash(now = Date.now()): TrashEntry[] {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const sinceMidnight = now - midnight.getTime();
  return SEEDS.map((x, i): TrashEntry => {
    const [n, unit] = x.when;
    const at = unit === 'today' ? now - Math.round(sinceMidnight * n) : now - n * DAY - (i % 5) * 3_600_000;
    const deletedAt = new Date(at).toISOString();
    const savedAt = new Date(at - (7 + (i % 9)) * DAY).toISOString();
    if (x.kind === 'source') {
      const item: Source = { id: `s-demo-del-${i}`, kind: x.source, title: x.title, author: x.author, url: x.url ?? null, savedAt, status: STATUS[x.column], demo: true,
        ...(x.url ? { displayUrl: x.url.replace(/^https?:\/\/(www\.)?/, '') } : {}) };
      return { kind: 'source', item, deletedAt, from: { place: 'inbox', column: x.column, index: i % 6 } };
    }
    const item: Artifact = { id: `a-demo-del-${i}`, type: x.type, title: x.title, purpose: x.purpose, exact: null, savedAt, demo: true,
      evidence: { method: 'user_supplied' }, ...(x.collections ? { collections: x.collections } : {}) };
    return { kind: 'artifact', item, deletedAt, from: { place: 'library', index: i % 7, ...(x.via ? { via: x.via } : {}) } };
  }).sort((a, b) => +new Date(b.deletedAt) - +new Date(a.deletedAt));
}
