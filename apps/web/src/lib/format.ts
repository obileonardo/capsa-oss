import type { ArtifactType, Evidence, EvidenceMethod, SourceKind, SourceStatus } from './types';

export const TYPE_LABEL: Record<ArtifactType, string> = {
  prompt: 'Prompt', skill: 'Skill', mcp_server: 'MCP server', tool: 'Tool', app_tool: 'App or tool', technique: 'Technique',
  command: 'Command', command_config: 'Command / config', template: 'Template', reference: 'Reference', workflow: 'Workflow',
};

export const METHOD_LABEL: Record<EvidenceMethod, string> = {
  text_span: 'Quoted from the source',
  creator_metadata: 'Said by the creator',
  ai_located: 'Found by AI',
  user_supplied: 'You added',
};

/** One label function for cards, rows, exports and detail: always leads with the method (AUD-05). */
export function evidenceLabel(e?: Evidence): string {
  if (!e) return 'Not recorded';
  // Track A (25 Oct): words read from an image on this device; they may be misread, so say how sure the reader was
  if (e.ocr) return `Read ${e.locator ?? 'from the image'} · ${e.ocr.confidence}% sure`;
  const m = METHOD_LABEL[e.method];
  if (e.method === 'ai_located') return e.t ? `${m} · moment ${e.t}${e.confirmed ? ' · confirmed by you' : ' · unconfirmed'}` : m;
  if (e.method === 'creator_metadata') return e.t ? `${m} · ${e.t}` : `${m}${e.locator ? ' · ' + e.locator : ''}`;
  // Text the user pasted (Stage 2): "Quoted from what you pasted, lines 3–9".
  if (e.method === 'text_span' && e.locator?.startsWith('from ')) return `Quoted ${e.locator}`;
  return e.locator ? `${m} · ${e.locator}` : m;
}

export const KIND_LABEL: Record<SourceKind, string> = { video: 'Video', github: 'GitHub', article: 'Article', x: 'Post on X', manual: 'Note' };

export const STATUS_LABEL: Record<SourceStatus, string> = {
  queued: 'Queued', processing: 'Processing', review: 'Ready to review', needs_thread: 'Needs you',
  failed: 'Couldn’t read', nothing: 'Nothing to unpack', reviewed: 'Reviewed', bookmark: 'Link only',
};

export function relTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const bytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`;
