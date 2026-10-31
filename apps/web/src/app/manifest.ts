import type { MetadataRoute } from 'next';

// Web app manifest (served at /manifest.webmanifest; Next adds the <link rel="manifest"> itself).
// Colours are the light-theme tokens from globals.css (--bg #f7f7f6); the dark theme-color is set per page by the
// root layout's viewport export, which the manifest can't express. Icons are rendered by verify/pwa/make-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Capsa',
    short_name: 'Capsa',
    description: 'Capture what you discover, keep the evidence, reuse it anywhere. Your library is saved on this device.',
    start_url: '/inbox',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f7f6',
    theme_color: '#f7f7f6',
    categories: ['productivity', 'utilities'],
    // Android (installed app): "Share to Capsa" opens /capture with the shared title, text and link (CAP-09).
    // iOS Safari has no share target. Nothing is saved until you press Keep there.
    share_target: { action: '/capture', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
