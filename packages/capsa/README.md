# capsa-cli

Your [Capsa](https://github.com/obileonardo/capsa-oss) library in the terminal: search, list, show, fill a prompt's blanks and copy it.

Read-only and offline. Node.js 20 or newer. Its only dependency is [`capsa-mcp`](https://www.npmjs.com/package/capsa-mcp), which reads the library file.

## Install

```bash
npm install -g capsa-cli                 # installs the `capsa` command
export CAPSA_FILE=~/capsa-library.json      # or pass --file
```

The Capsa app writes the file: **Your AI › Download the library file**. Without `--file` or `CAPSA_FILE`, `capsa` looks for `~/Downloads/capsa-library.json`.

## Use

```bash
capsa search deploy checklist            # every word must match
capsa list --type prompt --starred
capsa show <id>                          # the text, and where it came from
capsa render <id> subject="a lighthouse"
capsa copy <id> subject="a lighthouse"   # to the clipboard
capsa collections
capsa boards
capsa brief "calm onboarding"
```

Add `--json` for machine-readable output. `copy` uses your system's clipboard command (`pbcopy`, `wl-copy`, `xclip`, `xsel` or `clip`); nothing else runs. The old `lk` command still works.

## Licence

MIT, © 2026 Elvis Obi. The Capsa name and mark are not covered; see [TRADEMARKS.md](https://github.com/obileonardo/capsa-oss/blob/main/TRADEMARKS.md).
