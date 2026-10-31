# Capsa web app

The Capsa app: Next.js 16, React 19 and TypeScript. Your library lives in your browser, on this device.

## Run it

Node.js 24 or newer.

```bash
cd apps/web
npm ci
npm run dev        # http://127.0.0.1:3100
```

- `npm run typecheck`: type check
- `npm run build`, then `npm start`: a production build on the same address
- `node ../../packages/capsa-mcp/server.mjs <capsa-library.json>`: the local MCP server, which reads the file **Your AI › Download the library file** writes

`dev`, `build` and `typecheck` first run `scripts/features.mjs`, which writes the feature registry's files (below). Run it yourself before a bare `next dev`.

## What's in it

| Area | Routes | What it does |
|---|---|---|
| **Capture** | the capture box, quick capture (C) | A link, pasted text, an image or a file. Pasted text is split on this device into prompts, templates, workflows, MCP servers, skills and commands, each keeping its exact words. Text in images is read on this device |
| **Inbox and review** | `/inbox`, `/inbox/[id]` | What a capture holds, to keep or skip; the evidence beside it |
| **Library** | `/library`, `/library/[id]` | Search, filters, cards and list, multi-select and export; each item's page with its source quoted exactly |
| **Collections and projects** | `/collections`, `/projects` and their pages | Groups of items, each with its own page |
| **Deleted** | `/deleted` | Deleted items, to restore or empty; Settings chooses whether they go after 30 days |
| **Your AI** | `/ai` | The library file for the MCP server and `capsa`, and setup steps for each AI tool |
| **Settings and Help** | `/settings`, `/help` | Theme, capture and GitHub reading, storage, back up and restore, demo data, start over; shortcuts and help |
| **Offline** | `/offline` | A service worker (`public/sw.js`) keeps the app working without a connection |

Features beyond this core register through `src/lib/features.ts`: each has a `feature.ts` in its folder, and the core asks `has('<feature>')` before it links to one or shows text about it. A public release ships only the features released so far, and builds without the rest.

## Where things are

| Path | What's there |
|---|---|
| `src/app/` | The routes |
| `src/components/` | The screens, by area; `ui/` holds the shared parts |
| `src/lib/` | The data layer: `store.ts` (one state object, saved to IndexedDB through `db.ts`), `types.ts`, capture rules, backup and export |
| `src/lib/features.ts`, `scripts/features.mjs` | The feature registry and its generator |
| `public/` | The service worker, the OCR engine (`typehints/`), the illustrations and icons, the AI product marks (`brands/`) |
| `verify/` | Node checks and browser suites |

## Limits

- **On this device only.** Everything is saved in the browser (IndexedDB). There is no account, no server and no sync, and nothing is uploaded. Another browser, device or address starts empty; use **Settings › Data › Back up** to move a library.
- **Links wait.** Videos, posts and articles are saved with their link and wait in the Inbox; pasted text is unpacked on the device by plain rules, with no AI.
- **GitHub reading** is off by default and asks before each read. It sends only the repository's address to GitHub's public API, and it is the app's only network call besides its own address.
- **Demo data** is labelled as such, and is fictional.

## Checks

The Node checks need no install (Node 24 runs the TypeScript as written):

```bash
for t in capture/extract capture/rules imports/unit notify/notify search/search reuse/reuse; do node verify/$t-test.mjs; done
```

The browser suites use Playwright, which isn't a dependency of the app: set `PW_FROM` to a folder whose `node_modules` has `playwright` and `axe-core`. Then, with the app running:

```bash
CAPSA_BASE=http://127.0.0.1:3100 node verify/suites.mjs pr chromium      # the quick set
CAPSA_BASE=http://127.0.0.1:3100 node verify/suites.mjs full all         # every suite, Chromium and WebKit
```

`verify/suites.mjs` lists the sets. `BUILD_NOTES.md` has the design and accessibility rules the app is built to.
