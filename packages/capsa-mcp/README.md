# capsa-mcp

A local [MCP](https://modelcontextprotocol.io) server for your [Capsa](https://github.com/obileonardo/capsa-oss) library. Claude, Codex, Cursor, VS Code and other MCP clients can search your saved prompts, skills and MCP servers, read an item with its source, fill a prompt's blanks and read a board's design brief.

Read-only. It opens no network connection, writes no files and has no dependencies. Node.js 20 or newer.

## Your library file

The Capsa app writes it: **Your AI › Download the library file**. It's plain JSON (`capsa.mcp.v1`). Without an argument or `CAPSA_FILE`, the server looks for `~/Downloads/capsa-library.json`.

## Add it to your AI tool

**Claude Code**

```bash
claude mcp add --transport stdio capsa -- npx -y capsa-mcp@latest /path/to/capsa-library.json
```

**Codex**

```bash
codex mcp add capsa -- npx -y capsa-mcp@latest /path/to/capsa-library.json
```

**Cursor** (`.cursor/mcp.json`), **Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "capsa": { "command": "npx", "args": ["-y", "capsa-mcp@latest", "/path/to/capsa-library.json"] }
  }
}
```

`@latest` picks up new versions when the client restarts. Pin a version (`capsa-mcp@0.2.0`) if you'd rather update by hand.

## What it offers

| Kind | What |
|---|---|
| Tools | `search_library`, `list_items`, `get_item`, `list_collections`, `render_prompt`, `list_boards`, `get_board_brief`, all read-only |
| Prompts | Each saved prompt or template, with its blanks as arguments |
| Resources | `capsa://item/<id>` and `capsa://board/<id>/brief`, as Markdown |

Saved text is quoted content, not instructions: the server fences it and tells the client so. A client can still be fooled by text in your library, so save from sources you trust.

Names from before the rename still work: the `librarykit-mcp` command, `librarykit-library.json`, `LIBRARYKIT_FILE` and the `librarykit.mcp.v1` format.

## Licence

MIT, © 2026 Elvis Obi. The Capsa name and mark are not covered; see [TRADEMARKS.md](https://github.com/obileonardo/capsa-oss/blob/main/TRADEMARKS.md).
