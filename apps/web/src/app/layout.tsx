import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import '../features.gen.css'; // the features' global stylesheets (lib/features.ts): paper.css, here as before
import { KEYS_SCRIPT } from '@/lib/legacy';
import { FEATURE_IDS } from '@/feature-ids.gen'; // <meta name="capsa-features">: which features this build has, for the browser suites (verify/_features.mjs)

/* Fonts, self-hosted (OSS-13), so a build needs no network: the WOFF2 files Google Fonts served through next/font/google,
 * unchanged (Inter 4.001, JetBrains Mono 2.211, Newsreader 1.003 16 pt Medium; OFL licences in fonts/). Google splits each
 * font into a file per character set; so does this: one family per set, each with its unicode-range, so a page downloads a
 * set only when it has those characters. Only the Latin files are preloaded. globals.css stacks the sets into --font-inter,
 * --font-jbmono and --font-serif and ends each with its size-matched fallback (Google's own metrics, so text that falls
 * back, like an arrow none of the sets has, renders exactly as before). Values here must be literals: next/font reads
 * them at build time. */
const interLatin = localFont({ src: './fonts/inter-latin.woff2', weight: '100 900', style: 'normal', display: 'swap', variable: '--capsa-inter-latin', adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }] });
const interLatinExt = localFont({ src: './fonts/inter-latin-ext.woff2', weight: '100 900', style: 'normal', display: 'swap', variable: '--capsa-inter-latin-ext', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' }] });
const interVietnamese = localFont({ src: './fonts/inter-vietnamese.woff2', weight: '100 900', style: 'normal', display: 'swap', variable: '--capsa-inter-vietnamese', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' }] });
const interGreek = localFont({ src: './fonts/inter-greek.woff2', weight: '100 900', style: 'normal', display: 'swap', variable: '--capsa-inter-greek', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' }] });
const interGreekExt = localFont({ src: './fonts/inter-greek-ext.woff2', weight: '100 900', style: 'normal', display: 'swap', variable: '--capsa-inter-greek-ext', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+1F00-1FFF' }] });
const interCyrillic = localFont({ src: './fonts/inter-cyrillic.woff2', weight: '100 900', style: 'normal', display: 'swap', variable: '--capsa-inter-cyrillic', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' }] });
const interCyrillicExt = localFont({ src: './fonts/inter-cyrillic-ext.woff2', weight: '100 900', style: 'normal', display: 'swap', variable: '--capsa-inter-cyrillic-ext', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' }] });

const monoLatin = localFont({ src: [{ path: './fonts/jetbrains-mono-latin.woff2', weight: '400', style: 'normal' }, { path: './fonts/jetbrains-mono-latin.woff2', weight: '500', style: 'normal' }], display: 'swap', variable: '--capsa-mono-latin', adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }] });
const monoLatinExt = localFont({ src: [{ path: './fonts/jetbrains-mono-latin-ext.woff2', weight: '400', style: 'normal' }, { path: './fonts/jetbrains-mono-latin-ext.woff2', weight: '500', style: 'normal' }], display: 'swap', variable: '--capsa-mono-latin-ext', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' }] });
const monoVietnamese = localFont({ src: [{ path: './fonts/jetbrains-mono-vietnamese.woff2', weight: '400', style: 'normal' }, { path: './fonts/jetbrains-mono-vietnamese.woff2', weight: '500', style: 'normal' }], display: 'swap', variable: '--capsa-mono-vietnamese', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' }] });
const monoGreek = localFont({ src: [{ path: './fonts/jetbrains-mono-greek.woff2', weight: '400', style: 'normal' }, { path: './fonts/jetbrains-mono-greek.woff2', weight: '500', style: 'normal' }], display: 'swap', variable: '--capsa-mono-greek', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' }] });
const monoCyrillic = localFont({ src: [{ path: './fonts/jetbrains-mono-cyrillic.woff2', weight: '400', style: 'normal' }, { path: './fonts/jetbrains-mono-cyrillic.woff2', weight: '500', style: 'normal' }], display: 'swap', variable: '--capsa-mono-cyrillic', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' }] });
const monoCyrillicExt = localFont({ src: [{ path: './fonts/jetbrains-mono-cyrillic-ext.woff2', weight: '400', style: 'normal' }, { path: './fonts/jetbrains-mono-cyrillic-ext.woff2', weight: '500', style: 'normal' }], display: 'swap', variable: '--capsa-mono-cyrillic-ext', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' }] });

const serifLatin = localFont({ src: './fonts/newsreader-500-latin.woff2', weight: '500', style: 'normal', display: 'swap', variable: '--capsa-serif-latin', adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }] });
const serifLatinExt = localFont({ src: './fonts/newsreader-500-latin-ext.woff2', weight: '500', style: 'normal', display: 'swap', variable: '--capsa-serif-latin-ext', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' }] });
const serifVietnamese = localFont({ src: './fonts/newsreader-500-vietnamese.woff2', weight: '500', style: 'normal', display: 'swap', variable: '--capsa-serif-vietnamese', preload: false, adjustFontFallback: false, declarations: [{ prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' }] });

const fontVariables = [interLatin, interLatinExt, interVietnamese, interGreek, interGreekExt, interCyrillic, interCyrillicExt, monoLatin, monoLatinExt, monoVietnamese, monoGreek, monoCyrillic, monoCyrillicExt, serifLatin, serifLatinExt, serifVietnamese].map(f => f.variable).join(' ');

export const metadata: Metadata = {
  title: { default: 'Capsa', template: '%s · Capsa' },
  description: 'Capture what you discover, keep the evidence, reuse it anywhere. Web app v1 (local, demo data labelled).',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0b0b0c' }, { color: '#f6f6f5' }] };

// iOS Safari only applies :active while the page has a touchstart listener: the empty passive one at the end makes every
// pressed state fire on touch-down (issue #80).
// Applies the saved theme, icon style, style (Classic or Paper) and sidebar state before first paint, so there is no light flash in dark mode, no
// Solid-to-Line swap for someone who chose Line, and no expanded sidebar that then shrinks to the rail. KEYS_SCRIPT first
// moves keys saved before the rename to Capsa to their new names (lib/legacy.ts).
const themeScript = KEYS_SCRIPT + `try{var d=document.documentElement,t=localStorage.getItem('capsa-theme')||'system';if(t==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.theme=t;d.dataset.icons=localStorage.getItem('capsa-icons')==='line'?'line':'solid';d.dataset.look=localStorage.getItem('capsa-look')==='paper'?'paper':'classic';var s=localStorage.getItem('capsa-side');d.dataset.side=s==='rail'||s==='hidden'?'rail':'full'}catch(e){}document.addEventListener('touchstart',function(){},{passive:true});`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={fontVariables} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /><meta name="capsa-features" content={FEATURE_IDS.join(' ')} /></head>
      <body>
        <a href="#main" className="sr-only" style={{ position: 'absolute' }}>Skip to content</a>
        {children}
      </body>
    </html>
  );
}
