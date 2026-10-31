# Capsa web v1: build notes (read before writing any screen)

**What this is:** the first version of the real Capsa web app (Next.js 16 App Router + TypeScript + React 19). Data lives in the browser (IndexedDB) behind `src/lib/store.ts`; a backend replaces it later without rebuilding screens. Demo content is fictional and marked `demo: true`, shown with `<DemoTag />`.

**Run:** `npm run dev` serves http://127.0.0.1:3100. Type-check with `npx tsc --noEmit`. Next 16 notes: client pages read route params with `useParams()` from `next/navigation`. Docs for this exact version are in `node_modules/next/dist/docs/`; check them before using an API you're unsure of.

## Rules
- **Only touch your own files.** Each screen owns `src/app/(app)/<area>/` and `src/components/<area>/` (plus `src/lib/<area>/` if needed). Shared files are **read-only for screen builders**: `src/lib/{store,types,db,imaging,zip,format,backup}.ts`, `src/components/ui/`, `src/components/shell/`, `src/app/globals.css`, `src/app/layout.tsx`. If you need a change there, put it in your final report instead.
- **State:** read with `useAppState()` and selectors; change only through the exported actions in `store.ts`. Never mutate state objects. Actions return undo functions where it matters. Use the toast with an Undo action rather than confirm dialogs.
- **Styling:** global classes from `globals.css` (`.btn` with `.primary` / `.ghost` / `.sm` / `.icon`, `.chip`, `.tag`, `.input`, `.textarea`, `.seg`, `.card`, `.panel`, `.kbd`, `.quote`, `.empty`, `.page`, `.page-header`, `.page-body`, `.section-title`, `.menu`) plus a CSS module per screen. Use the tokens only (`var(--ink-2)`, `var(--r-md)` etc.); no hard-coded colours. Both themes must work: `[data-theme="dark"]` is set on `<html>`.
- **Components:** use `@/components/ui`: `TypeTag`, `EvidenceTag`, `DemoTag`, `Kbd`, `Empty`, `PageHeader`, `Dialog`, `useToast`, `useCopy`, `useOutsideClose`, `TYPE_ICON`. For icons use `lucide-react` (stroke icons, 15–16 px in UI). The shell gives `useShell()` with `openCapture()` and `openPalette()`.
- **Honesty rules** (product non-negotiables):
  - The evidence **method** is always shown first ("AI-located · moment 07:16 · unconfirmed"); use `evidenceLabel()` / `<EvidenceTag>`. Never show a single "verified" badge.
  - The user's exact words stay verbatim and separate from AI text.
  - Palettes are labelled "measured from pixels"; anything AI-made is labelled AI and isn't connected in v1. Say so plainly rather than faking output.
  - Nothing is destroyed silently: skip and restore, Undo toasts.
- **Accessibility:**
  - every control is reachable by keyboard and has a name
  - visible focus (already global)
  - colour is never the only signal (tags always carry words)
  - 24 px minimum targets
  - live regions only for real announcements
  - `prefers-reduced-motion` respected (globals cut animations)
  - everything works at 390 px wide

## Design direction (from Elvis's picks)
- **Feel:** premium through restraint, like Linear, Gumloop, Grain and Resend: near-monochrome, hairline borders (`--line`), compact 13 px UI type with a clear hierarchy, generous but disciplined spacing, small radii (6–10 px; Elvis rejected Resend's big rounded frames).
- **Colour:** near-black primary buttons; the indigo accent only for selection, focus, links and the active item. Pastel type tags (Browserbase).
- **Patterns he picked, to use:**
  - **Linear grouped lists and inbox:** dense two-line rows, a right-side preview, read state shown by weight.
  - **Customer.io:** a category pill opening a dropdown filter.
  - **Elicit:** the citation card on the right with "n of N" and previous/next stepping, highlighted in the source.
  - **Grain:** chapters with timestamps beside the player.
  - **LangChain prompt detail:** content left, metadata right.
  - **Gumloop:** clean, premium icons and type hierarchy.
  - **Airtable:** filter builder with a live count.
  - **Arcade "My Library":** cards with a selection bar.
  - **Frame.io:** numbered pins linked to a numbered comment list.
  - **Savee and Recraft:** image preview with a side panel and a colour selector.
  - **Cosmos:** a modern collection grid with more context, Pinterest-like ease of use without Pinterest's look.
  - **Fireflies and Obvious, blended:** an export modal with format options plus a readable Markdown preview.
  - **Asana:** share and roles (later).
- **Avoid** (he marked "Don't want this"): Superhuman, Flodesk, PandaDoc, Grammarly, mymind, Notion "Verified", Tripadvisor, Figma's comment/share UI, Dribbble's public page. Also avoid horizontal activity logs; logs are vertical with an icon per event.
- **Motion (Claude's picks, approved to use):**
  - **Confirm where things land:** Cosmos ✓ in place; Pinterest "Saved to …" toast with thumbnail.
  - **No layout jump while streaming** (Lemni).
  - **Stage, then commit** (Google Photos).
  - **Instant theme switch** (PlayStation).
  - **Copied:** the copied block is tinted, then a toast (Figma, AirOps).
  - **Drop-target tint while dragging** (Maze).
  - **Selection box with handles** (Framer).
  - **Palette dots on the sampled spots** (Google Arts & Culture).
  - Durations 120–320 ms with `var(--ease)`; reduced motion respected.

## Verification (before you report)
- **Type check:** `npx tsc --noEmit` is clean for your files.
- **Browser check** in Chromium and WebKit, using Playwright loaded through `playwrightFrom()` in `verify/_local.mjs` (set `PW_FROM` to a folder whose `node_modules` has `playwright` and `axe-core`, in the environment or in `private/local.env`):
  - no console errors on your routes
  - your main flows actually work: click through them
  - screenshots at 1440×900 light, 1440×900 dark and 390×844 light, saved under `apps/web/verify/<area>/` and looked at with the Read tool
- **Accessibility:** run axe-core from `require.resolve('axe-core/axe.min.js')` with that same `require` (inject with `page.addScriptTag({ path })`, then `axe.run()`). Fix serious and critical issues.
- **Report:** what you built, what you verified (with numbers), what's mocked or not connected, and any change you need in shared files.
