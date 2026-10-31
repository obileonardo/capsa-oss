// Build stamp for the service worker. Prerendered once per `next build`, so its value changes with every build.
// RegisterServiceWorker registers /sw.js?v=<stamp>: a new stamp installs a new worker (and fresh caches), which
// is what shows the "Update available · Reload" toast. The worker never caches this URL.
export const dynamic = 'force-static';

const BUILD = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function GET() {
  return Response.json({ build: BUILD }, { headers: { 'Cache-Control': 'no-cache' } });
}
