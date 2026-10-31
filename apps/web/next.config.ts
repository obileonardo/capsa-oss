import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV === 'development';

/* Security headers (OSS-14). The Content Security Policy lists what the app loads, and nothing else:
 *  - scripts: this origin. 'unsafe-inline' because the pages are built ahead of time, and Next's inline bootstrap and the
 *    theme script in layout.tsx carry no nonce on a static page (nonces would make every page render per request, which
 *    the offline service worker and the CDN can't cache). 'wasm-unsafe-eval' runs the OCR engine (Tesseract, wasm in
 *    public/typehints); dev adds 'unsafe-eval' for React's dev tools.
 *  - styles: this origin, inline (React's style attributes and Next's font CSS).
 *  - images, media and workers: this origin, plus data: and blob: for images read from IndexedDB and pasted files.
 *  - connect: this origin and the GitHub API (Capture reads a repository's README and licence).
 *  - frames: only the three players Boards embeds (lib/boards/links.ts SAFE_EMBED).
 *  - nothing may frame the app, no plugins, and forms and <base> stay on this origin. */
const policy = (extra: { style?: string; font?: string } = {}) => [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'${extra.style ?? ''}`,
  `font-src 'self'${extra.font ?? ''}`,
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' https://api.github.com",
  "worker-src 'self' blob:",
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.behance.net",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const common = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  // browsers ignore it over plain http (127.0.0.1), so it only takes effect on the deployed https site
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: [...common, { key: 'Content-Security-Policy', value: policy() }] },
      // the design system and the taste board are static pages that load their fonts from Google Fonts at view time
      // (later rules win for the same header)
      ...['/design-system/:path*', '/refs/:path*'].map(source => ({ source, headers: [{ key: 'Content-Security-Policy',
        value: policy({ style: ' https://fonts.googleapis.com', font: ' https://fonts.gstatic.com' }) }] })),
    ];
  },
  // The design system is one static page in public/design-system/ (npm run design-system). It is served at its file URL
  // so its relative assets/ paths resolve the same way as when the file is opened from disk.
  async redirects() {
    return [
      { source: '/design-system', destination: '/design-system/index.html', permanent: false },
      // the illustrations live in the design system's Illustrations tab
      { source: '/illustrations', destination: '/design-system/index.html#illustrations', permanent: false },
      // The taste board and the component study (public/refs/, built by npm run reference-board). Static files with
      // relative image paths, so they are served at their file URLs; /api/picks saves the board's picks.
      { source: '/board', destination: '/refs/board.html', permanent: false },
      { source: '/study', destination: '/refs/component-study.html', permanent: false },
    ];
  },
};

export default nextConfig;
