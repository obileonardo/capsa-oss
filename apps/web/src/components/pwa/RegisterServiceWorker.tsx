'use client';
import { useEffect } from 'react';
import { useToast } from '@/components/ui';
import './install'; // starts listening for `beforeinstallprompt` as early as possible

const SW_URL = '/sw.js';
const BUILD_STAMP_URL = '/offline/build';
const RECHECK_MS = 60 * 60 * 1000;

/** Service workers need a secure context; localhost and 127.0.0.1 count as secure. */
function allowed() {
  if (!('serviceWorker' in navigator)) return false;
  return window.isSecureContext || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

async function buildStamp(): Promise<string | null> {
  if (!navigator.onLine) return null;
  try {
    const res = await fetch(BUILD_STAMP_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const { build } = (await res.json()) as { build?: unknown };
    return typeof build === 'string' && build ? build : null;
  } catch { return null; } // offline: keep whatever worker is already registered
}

/**
 * Registers /sw.js in production builds only (in `next dev` a worker would serve stale code and break hot reload,
 * so any worker left over from a production run on the same origin is removed). When a new build's worker is
 * waiting, offers a quiet "Update available · Reload" toast. It never reloads on its own: only the Reload button
 * activates the new worker and reloads this tab, so nothing being typed is lost.
 */
export default function RegisterServiceWorker() {
  const toast = useToast();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then(regs => regs.filter(r => (r.active ?? r.waiting ?? r.installing)?.scriptURL.includes(SW_URL)).forEach(r => r.unregister()))
        .catch(() => {});
      return;
    }
    if (!allowed()) return;

    let disposed = false;
    let reloadRequested = false;
    let offered = false;
    const watched = new WeakSet<object>();

    const offer = (worker: ServiceWorker) => {
      if (offered || disposed) return;
      offered = true;
      toast({
        message: 'Update available',
        duration: 12000,
        action: {
          label: 'Reload',
          run: () => {
            // Another tab may already have switched to the new worker; then this tab just reloads onto it.
            if (worker.state === 'activated' || worker.state === 'redundant') { window.location.reload(); return; }
            reloadRequested = true;
            worker.postMessage({ type: 'SKIP_WAITING' });
          },
        },
      });
    };
    // Only the tab whose user pressed Reload reloads; other tabs keep running untouched.
    const onControllerChange = () => { if (reloadRequested) window.location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const track = (reg: ServiceWorkerRegistration) => {
      const hasController = () => !!navigator.serviceWorker.controller; // first install isn't an "update"
      const watch = (w: ServiceWorker | null) => {
        if (!w || watched.has(w)) return;
        watched.add(w);
        w.addEventListener('statechange', () => { if (w.state === 'installed' && hasController()) offer(w); });
      };
      if (reg.waiting && hasController()) offer(reg.waiting);
      watch(reg.installing);
      if (!watched.has(reg)) { watched.add(reg); reg.addEventListener('updatefound', () => watch(reg.installing)); }
    };

    const check = async () => {
      if (disposed) return;
      try {
        const build = await buildStamp();
        const reg = build
          ? await navigator.serviceWorker.register(`${SW_URL}?v=${encodeURIComponent(build)}`, { scope: '/', updateViaCache: 'none' })
          : await navigator.serviceWorker.getRegistration('/');
        if (reg && !disposed) track(reg);
      } catch { /* registration is best effort; the app works without it */ }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const start = () => { check(); };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
    window.addEventListener('online', start);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(start, RECHECK_MS);

    return () => {
      disposed = true;
      window.removeEventListener('load', start);
      window.removeEventListener('online', start);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.clearInterval(timer);
    };
  }, [toast]);

  // Safari ("Add to Dock" / "Add to Home Screen") reads this; React hoists it into <head>.
  return <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180" />;
}
