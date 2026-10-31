# Changelog

Capsa's public source arrives in releases. Each release adds a part that works on its own. Versions follow [Semantic Versioning](https://semver.org); before 1.0.0, a minor version can change behaviour, and the notes say when it does.

## 0.2.0: Release 2, 2026-10-31

The Capsa app, the core of it: everything you need to save what you find and use it again.

- `apps/web`: capture a link, a post, a video moment or an image; review what it holds in the Inbox and keep what you want; the Library and each item's page, with the source quoted exactly; collections and projects; Deleted; backup, restore and export; offline use; Help; Connect your AI, which writes the library file the two tools read; and Settings for these.
- Your library stays in your browser (IndexedDB). Text in images is read on your device. Reading public GitHub links is off by default and asks first.
- The MCP server and `capsa` are unchanged.

Coming in later releases: organising (smart collections, saved searches, filing rules, types), the command menu, Profile and the Paper style, imports, boards and the Playground, Learn and Activity, and Ask your library.

## 0.1.0: Release 1, 2026-10-29

The first public release: the two tools that let your AI and your terminal read a Capsa library.

- `packages/capsa-mcp` 0.2.0: a read-only local MCP server over stdio. Seven tools (`search_library`, `list_items`, `get_item`, `list_collections`, `render_prompt`, `list_boards`, `get_board_brief`), saved prompts as MCP prompts, and `capsa://` resources. No network, no file writes, no dependencies.
- `packages/capsa` 0.1.0 (npm: `capsa-cli`, command `capsa`): the same library in a terminal: `search`, `list`, `show`, `render`, `copy`, `collections`, `boards`, `brief`.
- A sample library file and tests for both packages (`npm test`).
- The library file format, `capsa.mcp.v1`, described in the README.
