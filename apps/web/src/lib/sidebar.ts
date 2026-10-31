/* Settings › Sidebar (Elvis, 25 Oct: Jira #585's Customize your sidebar, GitBook #563, beehiiv #544): which sections
 * the sidebar shows, in what order, and its view. Inbox, Library and Playground always show. "Your things" can be
 * reordered; the bottom group (Your AI, Activity, Learn) keeps its place and can only be hidden. A section a feature
 * adds is left out of a build without it (lib/features.ts). */
import { available } from './features';
import type { Prefs } from './types';

export const YOUR_THINGS = ([
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'collections', label: 'Collections' },
  { id: 'projects', label: 'Projects' },
  { id: 'tags', label: 'Tags' },
  { id: 'searches', label: 'Saved searches', feature: 'organise' },
] as const).filter(available);
export const BOTTOM = ([
  { id: 'ai', label: 'Your AI' },
  { id: 'activity', label: 'Activity', feature: 'activity' },
  { id: 'learn', label: 'Learn', feature: 'learn' },
] as const).filter(available);
export type ThingId = (typeof YOUR_THINGS)[number]['id'];
export type SideView = 'full' | 'compact' | 'rail';

/** The person's order, with any section they've never placed added at its default spot (so new sections appear). */
export function thingsOrder(p: Prefs): ThingId[] {
  const known = YOUR_THINGS.map(x => x.id) as ThingId[];
  const saved = (p.sidebar?.order ?? []).filter((x): x is ThingId => (known as string[]).includes(x));
  return [...saved, ...known.filter(x => !saved.includes(x))];
}
export const isHidden = (p: Prefs, id: string) => (p.sidebar?.hidden ?? []).includes(id);
/** Move one section up or down (by), returning the new order. */
export function moved(order: ThingId[], id: ThingId, by: number): ThingId[] {
  const i = order.indexOf(id), j = Math.max(0, Math.min(order.length - 1, i + by));
  if (i < 0 || i === j) return order;
  const out = [...order]; out.splice(i, 1); out.splice(j, 0, id); return out;
}
