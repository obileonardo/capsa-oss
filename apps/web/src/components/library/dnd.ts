/* Drag a Library item (card or list row) onto a collection or project in the sidebar to file it, or onto the right panel
 * to open it there. The drag itself is components/ui/useCardDrag.ts (pointer events, so it works in Safari; HTML5 drag
 * and drop on a card full of links did nothing there). Drop targets carry data-item-drop: "collections:<id>",
 * "projects:<id>" or "panel". The ⋯ menu on every card offers the same actions for keyboard and screen-reader use. */
import { getState, toggleArtifactIn } from '@/lib/store';
import type { ToastOptions } from '@/components/ui';

export type ItemDrop = `collections:${string}` | `projects:${string}` | 'panel';

export const dropTargetAt = (hit: HTMLElement | null) => {
  const el = hit?.closest<HTMLElement>('[data-item-drop]');
  return el ? { key: el.dataset.itemDrop as ItemDrop, el } : null;
};
export const dropTarget = (key: string) => document.querySelector<HTMLElement>(`[data-item-drop="${CSS.escape(key)}"]`);

/** File an item in a collection or project from a drop, with Undo in the toast. True when it was added. */
export function fileDroppedItem(itemId: string, key: ItemDrop, toast: (t: ToastOptions) => void): boolean {
  const [field, groupId] = key.split(/:(.*)/s) as ['collections' | 'projects', string];
  const st = getState();
  const a = st.artifacts.find(x => x.id === itemId);
  const g = st[field].find(x => x.id === groupId);
  if (!a || !g) return false;
  if ((a[field] ?? []).includes(groupId)) { toast({ message: `Already in “${g.name}”` }); return false; }
  toggleArtifactIn(itemId, field, groupId);
  toast({ message: `Added “${a.title}” to “${g.name}”`, tone: 'ok', action: { label: 'Undo', run: () => toggleArtifactIn(itemId, field, groupId) } });
  return true;
}
