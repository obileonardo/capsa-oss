/* Type hints, Layer 1 (measured). Every value here is measured from pixels on the device; nothing is guessed by AI.
 * The result is plain JSON so it can be stored on a Reference or Region as-is. */

export const TYPEHINTS_VERSION = 1 as const;

export type WeightClass = 'Light' | 'Regular' | 'Medium' | 'Bold' | 'Black';
export type SpacingClass = 'tight' | 'normal' | 'loose';
export type CaseStyle = 'all caps' | 'mixed' | 'lowercase';
export type Alignment = 'left' | 'centred' | 'right' | 'justified';
export type LevelRole = 'heading' | 'subheading' | 'body' | 'small';

/** A size level: lines whose estimated size is within ~12% of each other. Pixel values are in source-image pixels. */
export interface TypeLevel {
  role: LevelRole;
  /** Estimated font size (px). Derived from cap height ÷ 0.72 or x-height ÷ 0.53, the typical proportions of UI faces. */
  sizePx: number;
  /** sizePx ÷ source image width, so sizes compare across 1× and 2× screenshots. */
  sizeRel: number;
  capHeightPx?: number;
  xHeightPx?: number;
  /** Stroke thickness ÷ x-height (x-height estimated from cap height for all-caps lines). */
  strokeRatio?: number;
  weight?: WeightClass;
  case: CaseStyle;
  /** Mean blank space between letters ÷ x-height. */
  spacingRatio?: number;
  spacing?: SpacingClass;
  /** Baseline-to-baseline pitch ÷ sizePx, only when this level has 2+ stacked lines. */
  lineHeight?: number;
  lines: number;
  chars: number;
  /** Example text from this level (first line, up to 60 characters). */
  sample: string;
}

export interface TypeHintsWord { text: string; confidence: number; level: number }

export interface TypeHintsMeasured {
  /** Levels, largest first. */
  levels: TypeLevel[];
  /** Ratios between neighbouring levels, largest first (e.g. [2.4, 1.43]). */
  stepRatios: number[];
  /** heading size ÷ body size, when both exist. */
  headingToBody?: number;
  /** A modular scale all levels fit within ±4% (only claimed with 3+ levels). */
  modularScale?: { ratio: number; name: string };
  alignment?: Alignment;
  /** Words read with confidence ≥ the threshold. */
  words: TypeHintsWord[];
  /** Words below the threshold that were left out. */
  hiddenWords: number;
  meanConfidence: number;
  /** One brief-ready sentence built only from the values above. */
  brief: string;
}

export interface TypeHintsResult {
  version: typeof TYPEHINTS_VERSION;
  /** ISO date-time of the measurement. */
  measuredAt: string;
  layer: 1;
  method: 'measured from pixels';
  engine: string;
  /** What was measured: whole image or a normalised region (0..1). */
  source: { width: number; height: number; region?: { x: number; y: number; w: number; h: number } };
  status: 'ok' | 'no-text';
  /** Present only when status === 'ok'. */
  measured?: TypeHintsMeasured;
  /** Diagnostics: OCR passes run (2 = an inverted pass was tried), background polarity, time taken, word threshold. */
  run: { passes: 1 | 2; darkBackground: boolean; ms: number; confidenceThreshold: number };
}

export type NormRegion = { x: number; y: number; w: number; h: number };
