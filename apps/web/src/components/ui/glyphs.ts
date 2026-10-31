/* The Playground's glyphs (27 Oct, #82), one place for every screen that names it or its kinds. The section is the shapes
 * glyph (things to play with); a board keeps its brand board glyph; an easel is the pen it's drawn with. In ui/, not
 * playground/, so the core (Deleted, the offline page) can draw them in a build without the Playground (lib/features.ts). */
import { glyphFor } from '@/components/ui/BrandIcon';
import { PenLine, Shapes, SwatchBook } from '@/components/ui/icons';

export const PlaygroundGlyph = glyphFor('playground', Shapes);
export const BoardGlyph = glyphFor('boards', SwatchBook);
export const EaselGlyph = PenLine;
