/* Review later (REV-08, Track C): when a snoozed source comes back, and how that time is said. Pure, for the checks. */

/** The choices in a card's ⋯ menu: in three hours, tomorrow at 9:00, next Monday at 9:00. */
export const SNOOZE_OPTIONS: { key: string; label: string; at: (now: Date) => Date }[] = [
  { key: 'later', label: 'Later today', at: now => new Date(now.getTime() + 3 * 3600_000) },
  { key: 'tomorrow', label: 'Tomorrow', at: now => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  // the Monday of next week: on a Sunday that's 8 days away, not tomorrow (which "Tomorrow" already offers)
  { key: 'week', label: 'Next week', at: now => { const d = new Date(now); const n = ((8 - d.getDay()) % 7) || 7; d.setDate(d.getDate() + (n < 2 ? n + 7 : n)); d.setHours(9, 0, 0, 0); return d; } },
];

const time = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
/** "today 17:30", "tomorrow 09:00", "Mon 09:00", or "3 Nov 09:00" more than a week away. */
export function untilLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff === 0) return `today ${time(d)}`;
  if (diff === 1) return `tomorrow ${time(d)}`;
  if (diff > 1 && diff < 7) return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time(d)}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time(d)}`;
}
