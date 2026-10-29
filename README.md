# Capsa: MCP server and `capsa`

Your saved prompts, skills, MCP servers and design boards, readable by your AI tools and your terminal. Read-only, offline, no dependencies.

Capsa is a local-first library for what you learn about working with AI. Every item keeps its evidence: the post, video moment or README line it came from, quoted exactly. This repository is Capsa's public source. It grows in releases. Release 1 (0.1.0) has two parts:

| Part | What it does |
|---|---|
| [`packages/capsa-mcp`](packages/capsa-mcp) | A local [MCP](https://modelcontextprotocol.io) server. Claude, Codex, Cursor, VS Code and other MCP clients can search your library, read items, fill a prompt's blanks and read a board's design brief. |
| [`packages/capsa`](packages/capsa) | The same library in your terminal: search, list, show, fill and copy. |

Both read one file, `capsa-library.json`. Neither writes files, opens a network connection or needs `npm install`.

> **Status: early.** Version 0.1.0. The file format is `capsa.mcp.v1` and may grow, but new fields are added, not renamed. The Capsa app that writes the file comes to this repository in later releases; see the [changelog](CHANGELOG.md).

## Requirements

Node.js 20 or newer. The tests run on Node 20, 22 and 24 on Linux in CI, and were run on Node 24 on macOS for this release. Windows hasn't been checked.

## Try it in a minute

```bash
git clone https://github.com/obileonardo/capsa-oss.git
cd capsa-oss
node packages/capsa/capsa.mjs search release --file packages/capsa-mcp/examples/sample-library.json
```

[`examples/sample-library.json`](packages/capsa-mcp/examples/sample-library.json) is a small made-up library: two prompts, an MCP server and a board.

## Your library file

The Capsa app writes it: **Your AI › Download the library file**. You can also write or generate one yourself; the [format](#the-file-format) is plain JSON. Keep it anywhere, for example `~/capsa-library.json`. Download it again when your library changes: both tools notice a newer file and read it again.

## Use it from your AI tools

Use absolute paths. `~/` works inside the server's arguments, but not every client expands it elsewhere.

**Claude Code**

```bash
claude mcp add --transport stdio capsa -- node /path/to/capsa-oss/packages/capsa-mcp/server.mjs /path/to/capsa-library.json
```

**Codex**

```bash
codex mcp add capsa -- node /path/to/capsa-oss/packages/capsa-mcp/server.mjs /path/to/capsa-library.json
```

**Cursor** (`.cursor/mcp.json`) and **Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "capsa": {
      "command": "node",
      "args": ["/path/to/capsa-oss/packages/capsa-mcp/server.mjs", "/path/to/capsa-library.json"]
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`)

```json
{
  "servers": {
    "capsa": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/capsa-oss/packages/capsa-mcp/server.mjs", "/path/to/capsa-library.json"]
    }
  }
}
```

Instead of the second argument you can set `CAPSA_FILE`.

### What the server offers

| Kind | What |
|---|---|
| Tools | `search_library`, `list_items`, `get_item`, `list_collections`, `render_prompt`, `list_boards`, `get_board_brief`. All are marked read-only. |
| Prompts | Each saved prompt or template, with its blanks as arguments (client support varies). |
| Resources | `capsa://item/<id>` and `capsa://board/<id>/brief`, as Markdown. |

Transport: stdio, newline-delimited JSON-RPC 2.0. Protocol versions 2025-06-18, 2025-03-26 and 2024-11-05.

**Saved text is quoted content, not instructions.** Items come from posts, READMEs and transcripts you saved. The server fences that text and tells the client it is material to use, not instructions to follow. A client can still be fooled by text in your library, so save from sources you trust.

## Use it in your terminal

```bash
alias capsa="node /path/to/capsa-oss/packages/capsa/capsa.mjs"
export CAPSA_FILE=~/capsa-library.json

capsa search deploy checklist        # every word must match
capsa list --type prompt --starred
capsa show <id>                      # the text, and where it came from
capsa render <id> subject="a lighthouse"
capsa copy <id> subject="a lighthouse"   # to the clipboard
capsa collections
capsa boards
capsa brief "calm onboarding"
```

Without `--file` or `CAPSA_FILE`, `capsa` looks for `~/Downloads/capsa-library.json`. Add `--json` for machine-readable output. `copy` uses your system's clipboard command (`pbcopy`, `wl-copy`, `xclip`, `xsel` or `clip`); nothing else runs.

From npm: `npm install -g capsa-cli` (the command is `capsa`), and `npx -y capsa-mcp@latest` in your AI tool's config. From a clone, keep the two folders side by side, as in this repository.

## The file format

`capsa.mcp.v1` is one JSON object (files from before 29 Oct 2026, when Capsa was called LibraryKit, say `librarykit.mcp.v1` and still load, as do the old `librarykit-library.json` name and `LIBRARYKIT_FILE`):

| Field | What |
|---|---|
| `format` | Always `"capsa.mcp.v1"`. Other files are refused. |
| `items` | Saved items: `id`, `type` (`prompt`, `template`, `skill`, `mcp_server`, `workflow`, `technique`, `command`, `tool`, `reference`...), `typeLabel`, `title`, `text`, `exact`, `yours`, `summary`, `evidence`, `quote`, `source` (`title`, `url`, `kind`), `tags`, `starred`, `collections`, `projects`, `savedAt` |
| `collections`, `projects` | `id` and `name` (projects also `note`) |
| `boards` | Optional. `id`, `title`, `project`, `references` (credit, link, rights, palette, what you like and avoid) and `brief` (Markdown) |

The sample file shows every field. Blanks in a prompt are written `[like this]` or `{{ like this }}`.

## Checks

```bash
npm test     # both packages; no install needed
```

## Contributing

Issues and pull requests are welcome for what is in this repository. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: every commit is signed off under the [DCO](DCO). For security problems, see [SECURITY.md](SECURITY.md).

## Licence

The code is under the [MIT License](LICENSE). The Capsa name and the mark are not; see [TRADEMARKS.md](TRADEMARKS.md).
