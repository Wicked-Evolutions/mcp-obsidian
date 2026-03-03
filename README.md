# MCP Obsidian

A Model Context Protocol (MCP) server for Obsidian vault integration with Claude. Provides file operations, wikilink resolution, semantic search, frontmatter queries, vault analytics, and section-level editing — all from a single unified multi-vault server.

## Features

- **Unified Multi-Vault**: Single server process handles all vaults. Every tool accepts an optional `vault` parameter for per-request routing.
- **File Operations**: List, read, create, update, delete, move files with frontmatter support
- **Wikilink Resolution**: Resolve `[[wikilinks]]`, get outlinks/backlinks, follow link chains
- **Semantic Search**: Vector-based similarity search using Ollama embeddings (hybrid semantic + keyword)
- **Frontmatter Queries**: Dataview-like query engine — filter by type, status, tags, or any field
- **Vault Analytics**: Health reports, orphan detection, broken link detection, stale note detection
- **Section Editing**: Append, prepend, or replace content within specific markdown sections
- **Cross-Vault Search**: Search across all vaults simultaneously

## Prerequisites

- Node.js 18+
- [Ollama](https://ollama.ai/) running locally (for semantic search only)
- Obsidian vault(s)

## Installation

```bash
git clone https://github.com/Influencentricity/mcp-obsidian.git
cd mcp-obsidian
npm install
npm run build
```

## Configuration

### Single Server, Multiple Vaults (Recommended)

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/path/to/mcp-obsidian/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULTS": "{\"Platform\":\"/path/to/vault1\",\"Helena\":\"/path/to/vault2\",\"Finding\":\"/path/to/vault3\"}"
      }
    }
  }
}
```

Then use the `vault` parameter on any tool call:
```json
{ "tool": "read_file", "args": { "vault": "Helena", "path": "my-note.md" } }
```

Omitting `vault` defaults to the first vault in the list.

### Single Vault

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/path/to/mcp-obsidian/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/your/vault",
        "OBSIDIAN_VAULT_NAME": "My Vault"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OBSIDIAN_VAULTS` | JSON object: `{"name":"path",...}` for multi-vault | - |
| `OBSIDIAN_VAULT_PATH` | Path to single vault (alternative to OBSIDIAN_VAULTS) | - |
| `OBSIDIAN_VAULT_NAME` | Display name for single vault | - |
| `OLLAMA_HOST` | Ollama API endpoint | `http://localhost:11434` |
| `OLLAMA_EMBEDDING_MODEL` | Model for embeddings | `nomic-embed-text` |
| `HTTP_MODE` | Run as HTTP server instead of MCP | `false` |
| `HTTP_PORT` | Port for HTTP server | `3456` |

## Available Tools (33)

### File Operations (9)

| Tool | Description |
|------|-------------|
| `list_files` | List all markdown files in a vault |
| `read_file` | Read file contents with frontmatter |
| `create_file` | Create a new file with optional frontmatter |
| `update_file` | Overwrite file contents |
| `delete_file` | Delete a file |
| `get_frontmatter` | Read only frontmatter metadata |
| `update_frontmatter` | Merge updates into frontmatter |
| `search_content` | Full-text search across files |
| `move_note` | Relocate a file and update all wikilinks pointing to it |

### Wikilink Operations (5)

| Tool | Description |
|------|-------------|
| `resolve_wikilink` | Resolve a `[[wikilink]]` to its file path |
| `get_outlinks` | Get all wikilinks from a note |
| `get_backlinks` | Get all notes that link to a given note |
| `follow_link` | Resolve a wikilink and read the target file |
| `rebuild_link_index` | Rebuild the wikilink resolution index |

### Semantic Search (5)

| Tool | Description |
|------|-------------|
| `semantic_search` | Find similar content using embeddings |
| `index_vault` | Index all files in a vault for search |
| `index_file` | Index a single file |
| `get_similar` | Find notes similar to a given note |
| `index_status` | Check indexing status and stats |

### Frontmatter Queries (1)

| Tool | Description |
|------|-------------|
| `query_notes` | Dataview-like query engine for frontmatter fields |

Filter operators: `equals`, `not_equals`, `contains`, `not_contains`, `in`, `not_in`, `exists`, `not_exists`, `greater_than`, `less_than`

Example:
```json
{
  "tool": "query_notes",
  "args": {
    "vault": "Helena",
    "from": "03 Projects",
    "where": [
      { "field": "type", "op": "equals", "value": "PROJECT" },
      { "field": "status", "op": "not_equals", "value": "archived" }
    ],
    "fields": ["type", "status", "updated"],
    "sort_by": "-updated",
    "limit": 10
  }
}
```

### Vault Analytics (4)

| Tool | Description |
|------|-------------|
| `get_vault_health` | Composite health report (orphans + broken links + stale notes) |
| `get_orphan_notes` | Find notes with zero inbound wikilinks |
| `get_broken_links` | Find wikilinks pointing to non-existent notes |
| `get_stale_notes` | Find notes not modified within N days |

### Section Editing (3)

| Tool | Description |
|------|-------------|
| `append_to_section` | Add content to the end of a section |
| `prepend_to_section` | Add content to the beginning of a section |
| `update_section` | Replace all content within a section |

### Cross-Vault (6)

| Tool | Description |
|------|-------------|
| `search_all_vaults` | Search across all configured vaults |
| `semantic_search_all` | Semantic search across all vaults |
| `find_note_by_name` | Find a note by name across vaults |
| `get_ecosystem_stats` | Stats for all vaults |
| `get_cross_vault_links` | Find wikilinks between vaults |

## Ollama Setup (Required for Semantic Search)

Semantic search requires [Ollama](https://ollama.ai/) running locally. All other tools work without Ollama.

### Quick Setup

```bash
# Install (macOS)
brew install ollama

# Pull embedding model (~274MB)
ollama pull nomic-embed-text

# Optional: query expansion model (~4.7GB)
ollama pull qwen2.5:7b

# Verify
curl http://localhost:11434/api/tags
```

### First-Time Indexing

Call `index_vault` via Claude or HTTP server:

```bash
HTTP_MODE=true node dist/index.js &
curl http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{"tool": "index_vault", "args": {"vault": "MyVault"}}'
```

Indexing creates heading-based chunks with vector embeddings (768d) and FTS5 full-text index, stored in SQLite alongside your vault.

### Troubleshooting

- **"Ollama embedding failed: 500"**: Check `curl http://localhost:11434/api/tags`, ensure model is pulled
- **Slow indexing**: Initial run processes 1-2 sections/second. Subsequent runs only index changed files.
- **Memory**: nomic-embed-text uses ~500MB RAM; qwen2.5:7b uses ~5GB (only loaded during query expansion)

## HTTP Server Mode

```bash
HTTP_MODE=true HTTP_PORT=3456 node dist/index.js
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/tools` | GET | List available tools |
| `/call` | POST | Call any tool |
| `/search` | POST | Semantic search shorthand |

## Architecture

```
src/
├── index.ts              # Entry point, MCP server setup
├── http-server.ts        # HTTP server mode
├── config.ts             # Config loading + resolveVault() helper
├── parsers/
│   ├── markdown.ts       # Markdown/frontmatter parsing, section extraction
│   └── wikilink.ts       # Wikilink parsing + resolution
├── embeddings/
│   ├── ollama.ts         # Ollama API client
│   ├── storage.ts        # SQLite vector storage
│   └── watcher.ts        # File watcher for auto-indexing
└── tools/
    ├── index.ts          # Tool registration hub
    ├── files.ts          # File ops (9 tools)
    ├── wikilinks.ts      # Wikilink ops (5 tools)
    ├── semantic.ts       # Semantic search (5 tools)
    ├── crossvault.ts     # Cross-vault ops (6 tools)
    ├── sections.ts       # Section editing (3 tools)
    ├── query.ts          # Frontmatter queries (1 tool)
    └── analytics.ts      # Vault health (4 tools)
```

## Known Limitations

- **`update_file` replaces entire content** — Use `append_to_section`, `prepend_to_section`, or `update_section` for partial updates. `update_file` is retained for full rewrites only.
- **Unicode filenames** — Files with curly apostrophes (U+2019) and some Unicode characters may fail to resolve in `read_file` and `update_frontmatter`.
- **Vault path changes** — If a vault folder is renamed on disk, the `OBSIDIAN_VAULTS` environment variable must be updated manually. The server does not auto-detect path changes.

## Changelog

### v2.1.0 (2026-02-25)
- **Security hardening**: TOCTOU race condition fixes, FTS injection prevention, timing attack mitigations
- **Semantic search fixes**: Improved embedding stability and error handling

### v2.0.0 (2026-02-23)
- **Unified multi-vault server**: All tools accept optional `vault` parameter for per-request vault routing. Eliminates need for separate server processes per vault.
- **New tools**: `query_notes`, `get_vault_health`, `get_orphan_notes`, `get_broken_links`, `get_stale_notes`, `move_note`
- **Per-vault caching**: Wikilink index and semantic storage are now vault-isolated
- Total tools: 33

### v1.0.0 (2026-01-16)
- Initial release: file ops, wikilinks, semantic search, cross-vault, section editing
- 27 tools across 5 modules

## License

MIT
