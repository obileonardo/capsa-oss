# Brand marks: sources

Used for nominative use only (naming the AI product in the "Add AI" picker). Every file comes from the owner's own site or a download linked from its brand page. All were retrieved on 2026-10-25. Paths and colours are unchanged from the source. `<name>.svg` is for light backgrounds and `<name>-dark.svg` is for dark backgrounds.

| File | Product | Owner | Brand page | Direct download | File inside the zip |
|---|---|---|---|---|---|
| `claude.svg` | Claude | Anthropic | https://www.anthropic.com/press-kit (redirects to the zip) | https://www-cdn.anthropic.com/ae59ca4ca194dac9c9dc3bc78c5829468cb0e8af.zip | `Anthropic media resources/Anthropic logos/Claude logos/3 Claude Spark/SVG/Claude Spark - Clay.svg` |
| `chatgpt.svg` | ChatGPT / OpenAI (Blossom) | OpenAI | https://openai.com/brand/ | https://cdn.openai.com/brand/openai-logos.zip | `OpenAI-logos/SVGs/OAI_OpenAI-Blossom_Black.svg` |
| `chatgpt-dark.svg` | ChatGPT / OpenAI (Blossom) | OpenAI | https://openai.com/brand/ | https://cdn.openai.com/brand/openai-logos.zip | `OpenAI-logos/SVGs/OAI_OpenAI-Blossom_White.svg` |
| `cursor.svg` | Cursor | Anysphere | https://cursor.com/brand | `cursor-brand-assets.zip`, from "Download brand assets" on the brand page | `General Logos/Cube/SVG/CUBE_2D_LIGHT.svg` |
| `cursor-dark.svg` | Cursor | Anysphere | https://cursor.com/brand | same zip | `General Logos/Cube/SVG/CUBE_2D_DARK.svg` |
| `vscode.svg` | Visual Studio Code | Microsoft | https://code.visualstudio.com/brand | https://code.visualstudio.com/assets/branding/visual-studio-code-icons.zip | `visual-studio-code-icons/vscode.svg` |
| `lechat.svg` | Le Chat (Mistral emblem) | Mistral AI | https://mistral.ai/brand | https://mistral.ai/cms-media/api/documents/file/Mistral_Logos_2026.zip | `Mistral_Logos_2026/Icon/Gradient/RGB/SVG/Mistral-Icon-Gradient-RGB.svg` |
| `gemini.svg` | Google Gemini (spark) | Google | https://gemini.google/about/ | none: inline `<svg class="_footerSpark_…">` in the page footer | n/a |

## Notes per file

- **claude.svg**: the Claude Spark in Clay `#D97757`. The press kit has only this one colour of the Spark, so there is no dark variant. The zip has no usage text.
- **chatgpt.svg / -dark.svg**: openai.com/brand blocks scripted requests (403). We found the zip link in an archived copy of the page (web.archive.org, snapshot 20260921094430) and downloaded the file itself from cdn.openai.com. The 716×716 viewBox includes OpenAI's own padding around the Blossom (the mark is about 350 units across), so the files were left as published.
- **cursor.svg / -dark.svg**: Cursor's brand page says the 2D cube is the default. The Illustrator export was cleaned. We removed the XML prolog, the generator comment and `id="Ebene_1"`, and replaced the `<style>` class `.st0` with the same `fill` attribute. That stops CSS classes clashing when the file is inlined. Path and colour are byte-identical (`#26251e` light, `#edecec` dark).
- **vscode.svg**: the blue "stable" icon, unchanged. It uses the internal IDs `mask0`, `filter0_d`, `filter1_d` and `paint0_linear`, so inlining two copies on one page would clash; use it via `<img>`. The zip also has `vscode-alt.svg` (white). Microsoft says to use that only when contrast is too low, for example on blue, so it is not a dark-mode version and was not saved.
- **lechat.svg**: the Mistral brand page does not offer a separate Le Chat mark. This is the Mistral "pixel cat" M emblem, gradient version, unchanged. The page's own download links point to `cms.globalaegis.net`, which is behind Cloudflare and returned 403. The same file path served from `mistral.ai/cms-media/…` returned the zip. The gradient icon has no dark variant because the "inverted" lockup changes only the wordmark colour and keeps the M colours the same.
- **gemini.svg**: Google's Gemini brand kit is on the Partner Marketing Hub (https://partnermarketinghub.withgoogle.com/brands/google-gemini/brand-introduction/), which needs a partner login. No public Google press download offers an SVG. This file is the full-colour spark that gemini.google uses in its own page footer, copied verbatim; only the page's CSS `class` attribute was removed. A monochrome black spark is also on Google's CDN at https://storage.googleapis.com/gweb-gemini-cdn/gemini/uploads/c546a20243c57b297546630cf76e417a2483acb8.svg (used as the "Gemini app" icon on the same page).

## Not included

- **copilot.svg**: downloaded from https://brand.github.com/GitHub_Logos.zip, then left out. GitHub says Copilot has had no standalone icon logo since 2025, and the app names VS Code (with GitHub Copilot as its subtitle) using the VS Code icon instead.

- **codex.svg**: OpenAI's brand page has no separate Codex mark. Reuse the OpenAI Blossom.
- **perplexity.svg**: we found no brand or press page on perplexity.ai. `/press`, `/brand`, `/press-kit` and `/hub/press-kit` return 404, the sitemaps list none, and the hub page links to none. The only SVGs on the site are `/favicon.svg`, a potrace auto-trace of the app tile with a 2001 DTD, and the header wordmark. The wordmark is not the mark and has a cropped viewBox. Neither is a brand-kit asset, so we did not use them.

## Usage rules from the guidelines

- **OpenAI** (https://openai.com/brand/): "DON'T add any colors to the Blossom"; "DON'T use the Blossom as the primary branding"; "DON'T use the Blossom over a busy image"; "use the Blossom with lots of open space" and "the prescribed spacing". Use the logo "only when it directly relates to OpenAI services", "exactly as provided", and not "more prominently than your own". Do not "imply endorsement". Permission requests go to the partner communications email address on that page.
- **Cursor** (https://cursor.com/brand): 2D logos are the default. Call it "Cursor", not "Cursor AI" or "Cursor Code".
- **VS Code** (https://code.visualstudio.com/brand): keep clear space around the icon equal to 25% of the "fish" motif. Do not add text, images or a background (so no coloured tile). Do not recolour, redraw, stretch or deform it. Do not use the icon "to associate your offerings with Microsoft". Name it "Visual Studio Code" at first mention, then "VS Code", and never "vscode", "VSCode" or "VSC". Action labels follow "Open in VS Code".
- **GitHub** (https://brand.github.com/foundations/logo): allowed uses include "Show integration: use a permitted GitHub logo to inform others that your project integrates with GitHub" and "Secondary placement". Do not add shadows or gradients, use busy or low-contrast backgrounds, or change colour or dimensions. Do not imply affiliation or endorsement.
- **Mistral** (https://mistral.ai/brand): respect clear space, prefer the gradient version, and use monochrome on busy backgrounds. Do not stretch, recolour or rotate it, "Do not use on a colored background", and "Do not use a frame".
- **Anthropic** and **Google Gemini**: no public guideline text was available with these files. Google's rules are behind the Partner Marketing Hub login.
