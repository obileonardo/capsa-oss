/* Icons a collection or project can wear (Stage 6), chosen from the app's own icon set (ui/icons).
 * Stored by name on the record; unknown names fall back to the default. */
import {
  BookOpen, Bookmark, Bot, Briefcase, Code2, Folder, Image, Layers, Lightbulb, Monitor, Plug, Repeat, Sparkles, Star, SwatchBook, Tag, Target, Workflow, Wrench,
  type LucideIcon,
} from '@/components/ui/icons';

export const GROUP_ICONS: Record<string, LucideIcon> = {
  folder: Folder, briefcase: Briefcase, repeat: Repeat, plug: Plug, sparkles: Sparkles, star: Star, bookmark: Bookmark, tag: Tag, lightbulb: Lightbulb,
  workflow: Workflow, code: Code2, bot: Bot, wrench: Wrench, target: Target, book: BookOpen, image: Image, swatch: SwatchBook, monitor: Monitor, layers: Layers,
};
export const groupIcon = (name: string | undefined, kind: 'collections' | 'projects'): LucideIcon =>
  (name && GROUP_ICONS[name]) || (kind === 'collections' ? Folder : Briefcase);
