# Third-party notices

Capsa's own code is under the [MIT License](LICENSE). Its artwork and brand are reserved ([TRADEMARKS.md](TRADEMARKS.md)). The parts below come from other people and keep their own licences. The MIT License doesn't relicense them.

## Shipped with the app

| Part | Where | Licence | Notes |
|---|---|---|---|
| Tesseract.js worker | `apps/web/public/typehints/worker.min.js` | Apache License 2.0 | Licence beside it: `apps/web/public/typehints/LICENSE-tesseract.js.txt` |
| Tesseract.js core (WebAssembly) | `apps/web/public/typehints/core/` | Apache License 2.0 | Licence beside it: `apps/web/public/typehints/core/LICENSE.txt` |
| English OCR model | `apps/web/public/typehints/lang/eng.traineddata.gz` | Apache License 2.0 | Tesseract `tessdata_best` English, integerised, from npm `@tesseract.js-data/eng@1.0.0` (package MIT). The full Apache text is in `core/LICENSE.txt`. Provenance: `apps/web/src/lib/typehints/README.md` |
| Inter 4.001, JetBrains Mono 2.211, Newsreader 1.003 (16 pt Medium) | `apps/web/src/app/fonts/` | SIL Open Font License 1.1 | The WOFF2 files Google Fonts serves (the Latin, Latin Extended, Vietnamese, Greek and Cyrillic subsets), unchanged. Licences beside them: `Inter-OFL.txt` (© 2016 The Inter Project Authors), `JetBrainsMono-OFL.txt` (© 2020 The JetBrains Mono Project Authors), `Newsreader-OFL.txt` (© 2020 The Newsreader Project Authors) |
| AI product marks: Claude, ChatGPT, Cursor, VS Code, Le Chat, Gemini | `apps/web/public/brands/` | Owned by their companies | Used only to name those products. Source and date for each: `apps/web/public/brands/SOURCES.md` |

## The packages

`packages/capsa-mcp` and `packages/capsa` use only Node.js's built-in modules and have no npm dependencies.

## npm dependencies

Installed by `npm ci` and covered by their own licences, listed in each package's `package.json` and in the lockfile.

| Lockfile | Packages | Licences (count) |
|---|---|---|
| `apps/web/package-lock.json` | 87 | MIT 44, Apache-2.0 22, LGPL-3.0-or-later 10 and mixed 4 (all from the optional `sharp` image packages, not shipped by this repo), ISC 3, CC-BY-4.0 1 (`caniuse-lite`, build time only), BSD 2, 0BSD 1 |

Counted on 28 Oct 2026. Run a licence check again when dependencies change.

## Other

`DCO` is the Developer Certificate of Origin 1.1, © The Linux Foundation and its contributors, which may be copied verbatim.

Product names in the README (Claude, Codex, Cursor, VS Code and others) belong to their owners and are used only to name those products.
