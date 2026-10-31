/* Inline glossary (LRN-03, Track C): short, plain definitions with stable ids, shown in place (Term) and listed on the
 * Help › Glossary (/help/glossary, each at #g-<id>). Written once; keep each to a sentence or two. */
export interface GlossaryTerm { id: string; term: string; def: string }

export const GLOSSARY: GlossaryTerm[] = [
  { id: 'mcp', term: 'MCP server', def: 'A small program that gives an AI app extra tools, like searching your files or a website. MCP (Model Context Protocol) is the shared plug they use.' },
  { id: 'skill', term: 'Skill', def: 'A folder with a SKILL.md file that teaches an AI agent how to do one job. The agent reads it when the job comes up.' },
  { id: 'prompt', term: 'Prompt', def: 'The words you give an AI to get a result. A good one is worth keeping and reusing.' },
  { id: 'template', term: 'Template', def: 'A prompt with blanks, like [topic] or {{topic}}, that you fill in each time you use it.' },
  { id: 'agent', term: 'Agent', def: 'An AI that takes steps on its own, such as reading files or running commands, to finish a task.' },
  { id: 'claude-md', term: 'CLAUDE.md and AGENTS.md', def: 'Instruction files a coding agent reads at the start of each session in a project. CLAUDE.md is for Claude Code; AGENTS.md is read by Codex and others.' },
  { id: 'evidence', term: 'Evidence', def: 'Where a saved item came from, and how Capsa knows: quoted words, the creator’s own description, a moment found by AI, or text you added.' },
  { id: 'local-first', term: 'Local-first', def: 'Your library lives on this device and works offline. Nothing is uploaded.' },
  { id: 'model-parameters', term: 'Model parameters', def: 'Settings written after a prompt, like --ar 16:9 for the shape of an image. They’re kept as written.' },
];
export const glossaryTerm = (id: string) => GLOSSARY.find(g => g.id === id);
