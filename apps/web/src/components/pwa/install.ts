'use client';
// Install state shared by the shell and the Settings row.
// `beforeinstallprompt` (Chromium only) can fire before any screen mounts, so it's captured as soon as this module
// loads in the browser and kept here until the Settings "Install app" row asks for it.

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export interface InstallSnapshot { canPrompt: boolean; installed: boolean }

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: InstallSnapshot = { canPrompt: false, installed: false };
const SERVER_SNAPSHOT: InstallSnapshot = { canPrompt: false, installed: false };
const subscribers = new Set<() => void>();

function set(next: Partial<InstallSnapshot>) {
  snapshot = { ...snapshot, ...next };
  subscribers.forEach(fn => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // keep it for the Settings button instead of Chrome's mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => { deferred = null; set({ canPrompt: false, installed: true }); });
}

export const subscribeInstall = (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; };
export const getInstallSnapshot = () => snapshot;
export const getServerInstallSnapshot = () => SERVER_SNAPSHOT;

/** Shows the browser's own install dialog. Resolves to the user's choice, or 'unavailable'. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null; // a deferred prompt can only be used once
  set({ canPrompt: false });
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') set({ installed: true });
  return outcome;
}

/** Running as an installed app (standalone window, or iOS home-screen app). */
export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: window-controls-overlay)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
