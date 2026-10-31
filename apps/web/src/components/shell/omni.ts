/* The window-bar field's wording lives here only, so a header restyle is a one-line change. Capture lives in the
 * Library's bottom box (round 4), so the bar is search only. */
export const OMNI_PLACEHOLDER = 'Search your library';

/** A pasted single link (http(s) or www.), normalised; anything else returns null. */
export function linkFromPaste(text: string): string | null {
  const v = text.trim();
  if (!/^\S+$/.test(v) || !/^(https?:\/\/|www\.)/i.test(v)) return null;
  try { return new URL(v.startsWith('http') ? v : `https://${v}`).toString(); } catch { return null; }
}
