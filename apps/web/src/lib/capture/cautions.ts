/* Cautions on a found candidate (Track C): the caution rules for risky commands and AI-aimed instructions (XEV-03,
 * XEV-16) plus secrets and personal data (XEV-15), all worked out on this device. They feed the existing Caution tag.
 * An empty list means "no caution found by rule", never "safe". */
import { cautionsFor } from './extract';
import { findSensitive, sensitiveSummary } from './sensitive';

export interface CandidateCaution { kind: string; text: string }

const lines = (xs: number[]) => (xs.length === 1 ? `line ${xs[0]}` : `lines ${xs.slice(0, 3).join(', ')}${xs.length > 3 ? '…' : ''}`);

export function candidateCautions(text: string | null | undefined): CandidateCaution[] {
  if (!text) return [];
  const out: CandidateCaution[] = cautionsFor(text).map(c => ({ kind: c.kind, text: c.text }));
  for (const g of sensitiveSummary(findSensitive(text))) {
    const name = g.label.replace(/^(?!AWS|OpenAI|Anthropic|GitHub|Google|Slack|Stripe|Hugging|JSON)\w/, ch => ch.toLowerCase());
    const one = /^[aeiouAEIO]/.test(name) ? `an ${name}` : `a ${name}`;
    out.push({ kind: g.kind, text: `Looks like ${g.count > 1 ? `${g.count} × ${name}` : one} (${lines(g.lines)}).` });
  }
  return out;
}

/** `{ cautions }` to spread into a new candidate, or nothing when no rule matched (older records stay as they were). */
export const withCautions = (text: string | null | undefined): { cautions?: CandidateCaution[] } => {
  const c = candidateCautions(text);
  return c.length ? { cautions: c } : {};
};
