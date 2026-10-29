# Changelog

Capsa's public source arrives in releases. Each release adds a part that works on its own. Versions follow [Semantic Versioning](https://semver.org); before 1.0.0, a minor version can change behaviour, and the notes say when it does.

## 0.1.0: Release 1, 2026-10-28

The first public release: the two tools that let your AI and your terminal read a Capsa library.

- `packages/capsa-mcp` 0.2.0: a read-only local MCP server over stdio. Seven tools (`search_library`, `list_items`, `get_item`, `list_collections`, `render_prompt`, `list_boards`, `get_board_brief`), saved prompts as MCP prompts, and `capsa://` resources. No network, no file writes, no dependencies.
- `packages/capsa` 0.1.0 (npm: `capsa-cli`, command `capsa`): the same library in a terminal: `search`, `list`, `show`, `render`, `copy`, `collections`, `boards`, `brief`.
- A sample library file and tests for both packages (`npm test`).
- The library file format, `capsa.mcp.v1`, described in the README.

Coming in later releases: the Capsa web app, from capture and the Library onwards.
