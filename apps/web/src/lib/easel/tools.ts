/* The Easel's tool variants (27 Oct, #78; references: Rive #1493's caret menu, Mural #1497's connector kinds, Pitch #1499's
 * line ends, Evernote #1502 and Freeform #1503's pens, Craft #1504's widths, Claude #1507's colour row).
 * What each pen and arrow kind is, the values an item stores (only when they differ from what older easels had, so those
 * load unchanged), and the variant each tool remembers on this device. */
import type { EaselArrow, EaselArrowHeads, EaselArrowShape, EaselDraw, EaselInk, EaselPen } from '../types';

export const PENS: { id: EaselPen; label: string; sizes: [number, number, number]; color: EaselInk }[] = [
  { id: 'pen', label: 'Pen', sizes: [1.5, 2.5, 4], color: 'ink' },
  { id: 'pencil', label: 'Pencil', sizes: [1.25, 2, 3], color: 'ink' },
  { id: 'marker', label: 'Marker', sizes: [4, 6, 9], color: 'ink' },
  { id: 'highlighter', label: 'Highlighter', sizes: [12, 18, 26], color: 'yellow' },
];
export const PEN = Object.fromEntries(PENS.map(p => [p.id, p])) as Record<EaselPen, (typeof PENS)[number]>;
export const SIZES = ['Thin', 'Medium', 'Thick'] as const;
export const INKS: { id: EaselInk; label: string }[] = [
  { id: 'ink', label: 'Ink' }, { id: 'red', label: 'Red' }, { id: 'blue', label: 'Blue' }, { id: 'green', label: 'Green' }, { id: 'yellow', label: 'Yellow' },
];
export const SHAPES: { id: EaselArrowShape; label: string }[] = [
  { id: 'curved', label: 'Curved' }, { id: 'straight', label: 'Straight' }, { id: 'elbow', label: 'Elbow' },
];
export const HEADS: { id: EaselArrowHeads; label: string }[] = [
  { id: 'none', label: 'No heads' }, { id: 'end', label: 'One head' }, { id: 'both', label: 'Two heads' },
];

/** The default stroke: what every drawing was before pens. */
export const BASE_SIZE = 2.5;
export const penOf = (d: Pick<EaselDraw, 'pen'>): EaselPen => d.pen ?? 'pen';
export const sizeOf = (d: Pick<EaselDraw, 'size'>) => d.size ?? BASE_SIZE;
export const inkOf = (d: Pick<EaselDraw, 'color' | 'tone'>): EaselInk => d.color ?? (d.tone === 'thread' ? 'red' : 'ink');
export const shapeOf = (a: Pick<EaselArrow, 'shape'>): EaselArrowShape => a.shape ?? 'curved';
export const headsOf = (a: Pick<EaselArrow, 'heads'>): EaselArrowHeads => a.heads ?? 'end';

/** What a pen setting adds to a new drawing: nothing for the plain pen at its middle width in ink. */
export function drawFields(pen: EaselPen, size: number, color: EaselInk): Pick<EaselDraw, 'pen' | 'size' | 'color'> {
  return { ...(pen !== 'pen' ? { pen } : {}), ...(size !== BASE_SIZE ? { size } : {}), ...(color !== 'ink' ? { color } : {}) };
}
export function arrowFields(shape: EaselArrowShape, heads: EaselArrowHeads): Pick<EaselArrow, 'shape' | 'heads'> {
  return { ...(shape !== 'curved' ? { shape } : {}), ...(heads !== 'end' ? { heads } : {}) };
}

/** The variants each tool remembers on this device (a per-viewer convenience; nothing breaks without it). */
export interface ToolPrefs {
  shape: EaselArrowShape; heads: EaselArrowHeads; pen: EaselPen;
  pens: Record<EaselPen, { size: 0 | 1 | 2; color: EaselInk }>;
}
export const DEFAULT_PREFS: ToolPrefs = {
  shape: 'curved', heads: 'end', pen: 'pen',
  pens: { pen: { size: 1, color: 'ink' }, pencil: { size: 1, color: 'ink' }, marker: { size: 1, color: 'ink' }, highlighter: { size: 1, color: 'yellow' } },
};
const KEY = 'capsa-easel-tools';
const oneOf = <T extends string>(v: unknown, list: { id: T }[], d: T): T => (list.some(x => x.id === v) ? (v as T) : d);
export function loadPrefs(): ToolPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
    const pens = { ...DEFAULT_PREFS.pens };
    for (const p of PENS) {
      const v = raw.pens?.[p.id];
      if (v) pens[p.id] = { size: [0, 1, 2].includes(v.size) ? v.size : 1, color: oneOf(v.color, INKS, p.color) };
    }
    return { shape: oneOf(raw.shape, SHAPES, 'curved'), heads: oneOf(raw.heads, HEADS, 'end'), pen: oneOf(raw.pen, PENS, 'pen'), pens };
  } catch { return DEFAULT_PREFS; }
}
export function savePrefs(p: ToolPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window: the choice lasts this visit */ }
}
