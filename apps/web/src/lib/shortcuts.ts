/* Every keyboard shortcut in the app, in one list (24 Oct), shown by Settings › Keyboard shortcuts, the Help page and
 * the sidebar's Help menu, so they can't drift. Each entry is a binding that exists in the code (the file is noted).
 *
 * THM-07 (Track C, 25 Oct): the shortcuts with an `action` can be changed in Settings › Keyboard shortcuts. Their
 * bindings come from here (ACTIONS, with the person's changes in prefs.keys), and the code that handles them asks
 * `matches(e, binding)`, so the list, the handlers and the labels can't disagree. A change is refused when it clashes
 * with another shortcut that works in the same place, or with a key the browser or the app keeps for itself.
 * Bindings are written "Mod+K" (⌘ on a Mac, Ctrl elsewhere; both work, as before), "Shift+N", "/" or "C".
 *
 * A group or row a feature adds names it (`feature`), and is left out of a build without that feature (lib/features.ts). */
import { available, has, type FeatureId } from './features';

export interface Shortcut {
  keys: string; what: string;
  /** shown in the sidebar's Help menu too, with these keys if given */
  quick?: boolean | string;
  /** THM-07: this row is a changeable action; its keys come from its binding */
  action?: ActionId;
  /** THM-07: the bindings a fixed row uses, for the conflict check */
  bind?: string[];
  feature?: FeatureId;
}
export interface ShortcutGroup { where: string; keys: Shortcut[]; feature?: FeatureId }

export type ActionId = 'palette' | 'capture' | 'sidebar' | 'librarySearch' | 'reviewKeep' | 'reviewSkip';
/** The changeable shortcuts: where they work (a SHORTCUTS group) and their default binding. */
export const ACTIONS: Record<ActionId, { where: string; what: string; default: string; /** a key on its own, no ⌘ or ⌥ */ plainOnly?: boolean; feature?: FeatureId }> = {
  palette: { where: 'Anywhere', what: 'Search and commands', default: 'Mod+K', feature: 'search' },
  capture: { where: 'Anywhere', what: 'Capture', default: 'C' },
  sidebar: { where: 'Anywhere', what: 'Collapse or expand the sidebar', default: 'Mod+\\' },
  librarySearch: { where: 'Library', what: 'Search the Library', default: '/', plainOnly: true },
  reviewKeep: { where: 'Review', what: 'Keep (Focus view)', default: 'K', plainOnly: true },
  reviewSkip: { where: 'Review', what: 'Skip (Focus view)', default: 'S', plainOnly: true },
};

export const SHORTCUTS: ShortcutGroup[] = ([
  { where: 'Anywhere', keys: [ // shell/AppShell.tsx
    { keys: '⌘K', what: 'Search and commands', quick: true, action: 'palette', feature: 'search' },
    { keys: 'C', what: 'Capture', quick: true, action: 'capture' },
    { keys: '⌘\\', what: 'Collapse or expand the sidebar', quick: true, action: 'sidebar' },
    { keys: 'Esc', what: 'Close a dialog or menu', bind: ['Escape'] },
  ] },
  { where: 'Search and commands', feature: 'search', keys: [ // shell/CommandPalette.tsx
    { keys: '↑ / ↓, ↵', what: 'Move through results; open', bind: ['ArrowUp', 'ArrowDown', 'Enter'] },
    { keys: 'Tab', what: 'Switch between everything, items, sources and Playground', bind: ['Tab'] },
  ] },
  { where: 'Capture', keys: [ // shell/CaptureDialog.tsx
    { keys: '↵', what: 'Keep', bind: ['Enter'] },
    { keys: '⇧↵', what: 'New line', bind: ['Shift+Enter'] },
  ] },
  { where: 'Library', keys: [ // library/LibraryView.tsx, ArtifactDetail.tsx
    { keys: '/', what: 'Search the Library', quick: true, action: 'librarySearch' },
    { keys: 'J / K or ↑ / ↓', what: 'Move through the Library list', quick: 'J / K', bind: ['J', 'K', 'ArrowUp', 'ArrowDown'] },
    { keys: '⇧J / ⇧K', what: 'Jump to the next or previous group in the list', bind: ['Shift+J', 'Shift+K'] },
    { keys: '← / →', what: 'Collapse or expand a group in the list', bind: ['ArrowLeft', 'ArrowRight'] },
    { keys: '⌘↵, Esc', what: 'Save or cancel your version while editing', bind: ['Mod+Enter', 'Escape'] },
  ] },
  { where: 'Inbox', keys: [ // inbox/InboxScreen.tsx
    { keys: 'J / K or ↑ / ↓', what: 'Move within a column', bind: ['J', 'K', 'ArrowUp', 'ArrowDown'] },
    { keys: '← / →', what: 'Move across columns', bind: ['ArrowLeft', 'ArrowRight'] },
    { keys: 'Home / End', what: 'First or last card in the column', bind: ['Home', 'End'] },
    { keys: '↵', what: 'Open the full review', bind: ['Enter'] },
    { keys: 'Delete or ⌫', what: 'Delete the focused card (Undo in the toast)', bind: ['Delete', 'Backspace'] },
  ] },
  { where: 'Review', keys: [ // review/ReviewBoard.tsx, inbox/InboxPreview.tsx
    { keys: '[ and ]', what: 'Step through the evidence', bind: ['[', ']'] },
    { keys: 'K', what: 'Keep (Focus view)', action: 'reviewKeep' },
    { keys: 'S', what: 'Skip (Focus view)', action: 'reviewSkip' },
    { keys: '← / →', what: 'Previous or next card (Focus view)', bind: ['ArrowLeft', 'ArrowRight'] },
    { keys: '⌘↵', what: 'Save what you kept to the Library', bind: ['Mod+Enter'] },
  ] },
  { where: 'Playground', feature: 'playground', keys: [ // playground/PlaygroundHome.tsx, PlayTile.tsx
    { keys: 'N', what: 'New board (a new easel when showing Easels)', bind: ['N'] },
    { keys: 'F2', what: 'Rename the focused easel or board', bind: ['F2'] },
  ] },
  { where: 'Boards', feature: 'playground', keys: [ // boards/BoardView.tsx, FullScreen.tsx
    { keys: '⌘V', what: 'Paste an image or clip onto the board', bind: ['Mod+V'] },
    { keys: '← / →', what: 'Previous or next reference', bind: ['ArrowLeft', 'ArrowRight'] },
    { keys: 'R', what: 'Mark a region', bind: ['R'] },
    { keys: 'F', what: 'Full screen', bind: ['F'] },
    { keys: 'Esc', what: 'Stop marking; close the panel', bind: ['Escape'] },
  ] },
  { where: 'Easel', feature: 'playground', keys: [ // easel/Canvas.tsx, Toolbar.tsx
    { keys: 'V, H, N, T, A, P, I, E', what: 'Select, Hand, Card, Text, Arrow, Draw, Image, Erase', bind: ['V', 'H', 'N', 'T', 'A', 'P', 'I', 'E'] },
    { keys: 'Space + drag', what: 'Pan', bind: ['Space'] },
    { keys: '⌘+ / ⌘− / ⌘0', what: 'Zoom in, out, to fit', bind: ['Mod+=', 'Mod+-', 'Mod+0'] },
    { keys: '↑ ↓ ← →', what: 'Move the selection (⇧ further; ⌥ resizes)', bind: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] },
    { keys: '↵, Esc', what: 'Edit the focused card or text; stop editing', bind: ['Enter', 'Escape'] },
    { keys: '⌘Z / ⌘⇧Z, ⌘D', what: 'Undo, redo, duplicate', bind: ['Mod+Z', 'Mod+Shift+Z', 'Mod+D'] },
    { keys: 'Delete or ⌫', what: 'Delete the selection', bind: ['Delete', 'Backspace'] },
  ] },
  { where: 'Settings', keys: [ // settings/SettingsNav.tsx
    { keys: '/', what: 'Search Settings', bind: ['/'] },
    { keys: '↑ / ↓, ↵, Esc', what: 'Move through matches; open; clear the search', bind: ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'] },
  ] },
  { where: 'Motion clips', feature: 'playground', keys: [ // boards/MotionPlayer.tsx
    { keys: 'Space', what: 'Play or pause', bind: ['Space'] },
    { keys: ', / .', what: 'Back or forward one frame', bind: [',', '.'] },
    { keys: 'I / O', what: 'Set the loop’s in or out point', bind: ['I', 'O'] },
    { keys: 'N', what: 'Note at this moment', bind: ['N'] },
  ] },
] satisfies ShortcutGroup[]).filter(available).map(g => ({ ...g, keys: g.keys.filter(available) }));

/* ---------- bindings ---------- */
export type KeyMap = Partial<Record<string, string>> | undefined;
/** The binding in use: the person's change if valid, else the default. */
export function bindingOf(id: ActionId, keys?: KeyMap): string {
  const v = keys?.[id];
  return typeof v === 'string' && parseBinding(v) ? v : ACTIONS[id].default;
}
const MODS = ['Mod', 'Shift', 'Alt'] as const;
interface Parsed { mod: boolean; shift: boolean; alt: boolean; key: string }
export function parseBinding(b: string): Parsed | null {
  if (!b) return null;
  const parts = b === '+' ? ['+'] : b.split(/\+(?!$)/);
  const key = parts.pop()!;
  if (!key || parts.some(p => !(MODS as readonly string[]).includes(p))) return null;
  return { mod: parts.includes('Mod'), shift: parts.includes('Shift'), alt: parts.includes('Alt'), key };
}
const norm = (k: string) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
/** Does this key event press this binding? Mod is ⌘ or Ctrl. Shift counts only when the binding names a letter, a
 * named key or Shift itself, since "?" already needs Shift on most keyboards. */
export function matches(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, binding: string): boolean {
  const p = parseBinding(binding);
  if (!p) return false;
  if (p.mod !== (e.metaKey || e.ctrlKey) || p.alt !== e.altKey) return false;
  const k = norm(e.key);
  if (k !== norm(p.key)) return false;
  const shiftMatters = /^[A-Z]$/.test(norm(p.key)) || p.key.length > 1 || p.shift;
  return !shiftMatters || p.shift === e.shiftKey;
}
/** The binding a key event makes, or null for a modifier on its own. */
export function eventToBinding(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): string | null {
  if (['Meta', 'Control', 'Shift', 'Alt', 'CapsLock', 'Fn', 'Dead', 'Unidentified', 'Process'].includes(e.key)) return null;
  const k = norm(e.key);
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('Mod');
  // Shift is written only for letters and named keys ("Shift+N"); "?" says it already
  if (e.shiftKey && (/^[A-Z]$/.test(k) || k.length > 1)) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  return [...parts, k].join('+');
}
const NAMED: Record<string, string> = { Escape: 'Esc', Enter: '↵', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: '⌫', Delete: 'Delete', Tab: 'Tab', Space: 'Space', Home: 'Home', End: 'End' };
/** "Mod+Shift+K" → "⌘⇧K", "/" → "/". */
export function displayKey(b: string): string {
  const p = parseBinding(b);
  if (!p) return b;
  return `${p.mod ? '⌘' : ''}${p.alt ? '⌥' : ''}${p.shift ? '⇧' : ''}${NAMED[p.key] ?? norm(p.key)}`;
}
/** For aria-keyshortcuts: "Meta+K Control+K". */
export function ariaKeys(b: string): string {
  const p = parseBinding(b);
  if (!p) return '';
  const key = p.key === 'Space' ? 'Space' : p.key.length === 1 ? norm(p.key) : p.key;
  const rest = [p.alt ? 'Alt' : '', p.shift ? 'Shift' : '', key].filter(Boolean).join('+');
  return p.mod ? `Meta+${rest} Control+${rest}` : rest;
}

/* ---------- conflicts ---------- */
/** Keys that move around, confirm or close, everywhere. */
const RESERVED_PLAIN = new Set(['Escape', 'Tab', 'Enter', 'Space', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
/** ⌘ shortcuts the browser or every text field keeps (copy, paste, close the tab…). */
const RESERVED_MOD = new Set('A C V X Z Y W T N Q R L P F S D H M O 0 1 2 3 4 5 6 7 8 9 = - Enter Tab'.split(' '));
const sameBinding = (a: string, b: string) => {
  const x = parseBinding(a), y = parseBinding(b);
  return !!x && !!y && x.mod === y.mod && x.alt === y.alt && x.shift === y.shift && norm(x.key) === norm(y.key);
};
/** Places overlap when one is "Anywhere" (it works on every page) or they're the same place. */
const overlaps = (a: string, b: string) => a === 'Anywhere' || b === 'Anywhere' || a === b || (a === 'Boards' && b === 'Motion clips') || (a === 'Motion clips' && b === 'Boards');
/** Why this binding can't be used for this action, or null if it can. */
export function conflictFor(id: ActionId, binding: string, keys?: KeyMap): string | null {
  const p = parseBinding(binding);
  if (!p) return 'Not a key';
  if (ACTIONS[id].plainOnly && (p.mod || p.alt)) return 'Use a key without ⌘ or ⌥ here';
  if (!p.mod && !p.alt && RESERVED_PLAIN.has(norm(p.key))) return `${displayKey(binding)} moves around and closes things`;
  if (p.mod && !p.alt && !p.shift && RESERVED_MOD.has(norm(p.key))) return `${displayKey(binding)} is kept for the browser`;
  const where = ACTIONS[id].where;
  for (const [other, a] of Object.entries(ACTIONS) as [ActionId, (typeof ACTIONS)[ActionId]][]) {
    if (other === id || !overlaps(where, a.where) || (a.feature && !has(a.feature))) continue; // an absent feature's key is free
    if (sameBinding(binding, bindingOf(other, keys))) return `Already used for ${a.what}${a.where === 'Anywhere' ? '' : ` (${a.where})`}`;
  }
  for (const g of SHORTCUTS) {
    if (!overlaps(where, g.where)) continue;
    for (const k of g.keys) if (k.bind?.some(b => sameBinding(binding, b))) return `Already used for ${k.what} (${g.where})`;
  }
  return null;
}

/* ---------- the list, with the bindings in use ---------- */
export function shortcutsFor(keys?: KeyMap): ShortcutGroup[] {
  return SHORTCUTS.map(g => ({ ...g, keys: g.keys.map(k => (k.action ? { ...k, keys: displayKey(bindingOf(k.action, keys)) } : k)) }));
}
export const quickShortcutsFor = (keys?: KeyMap) => shortcutsFor(keys).flatMap(g => g.keys.filter(k => k.quick).map(k => ({ ...k, keys: typeof k.quick === 'string' ? k.quick : k.keys })));
export const QUICK_SHORTCUTS = quickShortcutsFor(undefined);
