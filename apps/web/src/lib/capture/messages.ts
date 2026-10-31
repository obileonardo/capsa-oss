/* The toast after a link is saved: short, and honest about whether anything will read it. */
import type { Source } from '../types';

export function linkSavedMessage(src: Pick<Source, 'kind' | 'title'>, readGithub: boolean): string {
  const saved = `Saved “${src.title}” to the Inbox.`;
  if (src.kind === 'github') return readGithub ? `${saved} Read it from GitHub there.` : `${saved} Reading GitHub links is off.`;
  return `${saved} Reading links isn’t connected.`;
}
