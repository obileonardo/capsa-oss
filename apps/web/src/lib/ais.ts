/* Your AI (design review 25 Oct, items 3 and 4): the AIs a person can add to a library, each named with its official
 * logo where one is published (public/brands/, sources in public/brands/SOURCES.md; nominative use only, on a neutral
 * surface with no tile or frame, as the brands ask). Pure data.
 * - `clients`: the apps that can run the local MCP server; their setup text comes from lib/setup.ts (formats checked
 *   against each vendor's docs there).
 * - `send`: the Send to target (lib/reuse.ts) for chat apps that can't run a local server.
 * - `formats`: the Files for agents that app reads (lib/aiExport.ts). */
import type { AiFormat } from './aiExport';
import type { Client } from './setup';

export interface AiDef {
  id: string;
  name: string;
  /** the products it covers, under the name in the picker */
  sub?: string;
  /** public/brands/<logo>.svg; `logoDark`: a separate file for dark backgrounds (<logo>-dark.svg) */
  logo?: string;
  logoDark?: boolean;
  /** the file's own padding is large (OpenAI's Blossom fills about half its canvas): drawn this much larger to match the others */
  logoScale?: number;
  clients: Client[];
  desktop?: boolean;
  send?: string;
  formats: AiFormat[];
}

export const AIS: AiDef[] = [
  { id: 'claude', name: 'Claude', sub: 'Claude Code and Desktop', logo: 'claude', clients: ['claude'], desktop: true, send: 'claude', formats: ['claude', 'skill'] },
  { id: 'chatgpt', name: 'ChatGPT and Codex', sub: 'Codex CLI and ChatGPT', logo: 'chatgpt', logoDark: true, logoScale: 1.7, clients: ['codex'], send: 'chatgpt', formats: ['agents'] },
  { id: 'cursor', name: 'Cursor', logo: 'cursor', logoDark: true, clients: ['cursor'], formats: ['cursor'] },
  { id: 'vscode', name: 'Visual Studio Code', sub: 'GitHub Copilot', logo: 'vscode', clients: ['vscode'], formats: [] },
  { id: 'gemini', name: 'Gemini', logo: 'gemini', clients: [], send: 'gemini', formats: [] },
  { id: 'lechat', name: 'Le Chat', sub: 'Mistral', logo: 'lechat', clients: [], send: 'lechat', formats: [] },
  { id: 'perplexity', name: 'Perplexity', /* no official SVG found on perplexity.ai (SOURCES.md) */ clients: [], send: 'perplexity', formats: [] },
];

export const aiById = (id: string) => AIS.find(a => a.id === id);
export const isAiId = (id: string) => AIS.some(a => a.id === id);
