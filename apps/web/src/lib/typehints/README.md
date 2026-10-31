# Type hints, Layer 1 (measured) — plan item B5a

Finds text on the device and measures type facts from pixels. No AI, no network. Every value is labelled
"measured from pixels"; typeface name and serif/sans are Layer 2 (not built).

## Files
- `engine.ts` — Tesseract.js worker lifecycle (self-hosted assets, one warm worker, Cancel = terminate).
- `prepare.ts` — crop region, measurement raster (≤3200 px side), grey + contrast-stretched OCR canvas
  (scaled to ~2200 px side, 0.35×–3×), inverted first when the background is dark.
- `measure.ts` — per-line pixel measurements (coverage maps, glyph heights, stroke runs, letter gaps).
- `summarise.ts` — size levels, scale, weight/spacing classes, line height, alignment, brief sentence. Constants are
  calibrated against `verify/typehints` ground truth; change them only with a re-run of `verify.mjs`.
- `index.ts` — `measureType(image, { region, signal, onProgress })` → `TypeHintsResult`.
- `types.ts` — the JSON result (`version: 1`, `measuredAt` ISO date).

## Pipeline
1. OCR pass 1 (PSM 3, LSTM). If mean word confidence < 78 or < 2 good words, pass 2 on the inverted image; lines are
   merged, keeping the better-read line where they overlap.
2. Words with confidence ≥ 60 and at least one letter/digit are used. Fewer than 3 such characters → `status: 'no-text'`
   and nothing else.
3. Per line: background = median of a ring outside the line; ink coverage = colour distance ÷ 97th percentile
   (works for any colour pair, light-on-dark included). Glyphs are split at blank columns and matched to OCR letters.
4. Size ≈ weighted mix of cap height ÷ 0.715, ascender (b d h k l) ÷ 0.73, x-height ÷ 0.52, after removing 0.25 px of
   anti-aliasing spread. Lines cluster into levels when within 12%.
5. Weight = median horizontal stroke (summed coverage) across the middle of the x-height band ÷ x-height:
   Light < 0.153 ≤ Regular < 0.205 ≤ Medium < 0.25 ≤ Bold < 0.337 ≤ Black.
6. Spacing = mean of (blank columns per letter pair ÷ x-height) and (mid-band gap between letters ÷ x-height):
   tight < 0.15 ≤ normal < 0.312 ≤ loose. Glyph advance ÷ x-height was rejected: it mixes letter width with tracking.
7. Line height = median baseline pitch ÷ size (stacked lines of one level). Alignment = left/centre/right edge spread
   of stacked lines within max(3 px, 8% of the largest size); blocks whose lines are all the same width don't vote.

## Self-hosted assets (`public/typehints/`) and licences
| File | Source | Size | Licence |
|---|---|---|---|
| `worker.min.js` | npm `tesseract.js@7.0.0` `dist/` (published 2025-12-15) | 111 KB | Apache-2.0 (bundles buffer MIT, ieee754 BSD-3-Clause, regenerator-runtime MIT, zlib.js MIT; see `worker.min.js.LICENSE.txt` in the package) |
| `core/tesseract-core-{,simd-,relaxedsimd-}lstm.wasm.js` | npm `tesseract.js-core@7.0.0` (WASM embedded; the worker picks one by CPU feature) | 3.9 MB each, one is loaded | Apache-2.0 (`core/LICENSE.txt`); Tesseract OCR engine Apache-2.0, Leptonica BSD-2-Clause-style |
| `lang/eng.traineddata.gz` | npm `@tesseract.js-data/eng@1.0.0`, folder `4.0.0_best_int` | 2.95 MB | Package MIT; the model is Tesseract `tessdata_best` English (integerised), Apache-2.0 (github.com/tesseract-ocr/tessdata_best LICENSE) |
| `LICENSE-tesseract.js.txt`, `core/LICENSE.txt` | licence texts | — | Apache-2.0 |

SHA-256: worker `576b7df7…182c6d`, lstm `eef5f8b2…e8680`, simd-lstm `c58b46a4…447b38`, relaxedsimd-lstm
`861a536c…a59b3`, eng `45b4cb34…ff91`.

Installed with `npm install --ignore-scripts --save-exact tesseract.js@7.0.0`. To update: bump the exact version, copy
the same files from `node_modules`, re-run `verify/typehints/verify.mjs` (it also records every network request).
`cacheMethod: 'none'` keeps the traineddata out of IndexedDB; the browser HTTP cache (and later the B1 service worker)
caches it. B1 should precache `/typehints/**` so type hints work offline.

## Limits
- Font size is inferred from glyph proportions; faces with unusual cap/x-height (display, script, condensed) can be off
  by more than the ±10% seen on the test faces.
- Light vs Regular is a narrow band for SF Pro (300 at display sizes ≈ 0.15, 400 at 14 px ≈ 0.155); Bold vs Black
  depends on the face (Georgia Bold ≈ SF Black). Spacing class is relative to typical faces, not the font's own default
  (Verdana reads loose; small SF text is tracked loose by the font itself).
- Latin English OCR only. Rotated, curved, outlined or textured text, and text over photos, may be missed.
- One worker is shared; Cancel stops any run in progress.
