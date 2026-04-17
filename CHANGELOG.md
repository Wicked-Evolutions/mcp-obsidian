# Changelog

All notable changes to mcp-obsidian are documented here.

## [1.0.0] - 2026-04-17

First public release under the Wicked Evolutions org. Consolidates all prior development into a stable v1.0.0.

### Features

- **63 tools** across two tiers — 30 filesystem (always available) + 33 CLI (Obsidian 1.12+)
- **Unified multi-vault** — single server process handles all vaults via `vault` parameter
- **File operations** — list, read, create, update, delete, move files with frontmatter support
- **Wikilink resolution** — resolve `[[wikilinks]]`, backlinks, outlinks, follow link chains
- **Semantic search** — vector-based similarity search using Ollama embeddings
- **Frontmatter queries** — Dataview-like query engine with 10 filter operators
- **Vault analytics** — health reports, orphan detection, broken links, stale notes
- **Section editing** — append, prepend, or replace content within specific markdown sections
- **Cross-vault search** — search across all configured vaults simultaneously
- **CLI bridge** — daily notes, tasks, tags, properties, templates, bases, commands, history, plugins, eval
- **Tool filtering** — `OBSIDIAN_DISABLED_TOOLS` env var to disable specific tools at startup
- **HTTP server mode** — REST API for testing and integration
- **npm installable** — `npx mcp-obsidian` or global install

### Security

- Path traversal prevention — all file operations validate paths within vault boundaries
- TOCTOU race condition mitigations
- FTS injection prevention in semantic search
- Timing attack mitigations
- `OBSIDIAN_DISABLED_TOOLS` allows operators to disable dangerous tools (e.g. `search_replace_in_file`)

---

## Pre-1.0 Development History

Development history from the `Influencentricity/mcp-obsidian` era:

### v2.2.0 (2026-03-07)
- CLI bridge: 33 new tools via Obsidian 1.12+ CLI
- Two-tier architecture (filesystem + CLI)
- `OBSIDIAN_DISABLED_TOOLS` env var for tool filtering
- Total: 63 tools

### v2.1.1 (2026-03-05)
- Fix: `create_file` frontmatter serialization (JSON string no longer produces corrupt YAML)
- Fix: Unicode filename handling (NFC/NFD normalization fallback)

### v2.1.0 (2026-02-25)
- Security hardening: TOCTOU fixes, FTS injection prevention, timing attack mitigations

### v2.0.0 (2026-02-23)
- Unified multi-vault server (all tools accept optional `vault` parameter)
- New tools: `query_notes`, `get_vault_health`, `get_orphan_notes`, `get_broken_links`, `get_stale_notes`, `move_note`
- Total: 32 tools

### v1.0.0 (2026-01-16)
- Initial release: file ops, wikilinks, semantic search, cross-vault, section editing
- 27 tools across 5 modules

---

## License

MIT
