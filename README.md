# mcp-obsidian

Multi-vault Obsidian MCP server — 63 tools for file operations, wikilinks, semantic search, frontmatter queries, daily notes, tasks, properties, templates, and more.

Two-tier architecture: 30 filesystem tools work without Obsidian running + 33 CLI tools access Obsidian's full runtime API when the app is running with [CLI enabled](https://obsidian.md/help/cli) (1.12+).

## Install

```bash
npm install -g @wickedevolutions/mcp-obsidian
```

Or run directly without installing:

```bash
npx @wickedevolutions/mcp-obsidian
```

Or clone and build from source:

```bash
git clone https://github.com/Wicked-Evolutions/mcp-obsidian.git
cd mcp-obsidian
npm install
npm run build
```

## Setup

Works with Claude Code, Claude Desktop, Gemini CLI, Cursor, Windsurf, VS Code, and any MCP-compatible client.

All clients use the same server config — the only difference is where the config file lives.

### Server Config Block

**If you installed via npm** (`npm install -g @wickedevolutions/mcp-obsidian`):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["mcp-obsidian"],
      "env": {
        "OBSIDIAN_VAULTS": "{\"My Vault\":\"/path/to/your/vault\"}"
      }
    }
  }
}
```

**If you cloned and built from source:**

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/path/to/mcp-obsidian/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULTS": "{\"My Vault\":\"/path/to/your/vault\"}"
      }
    }
  }
}
```

### Where to Put the Config

| Client | Config file |
|--------|-------------|
| **Claude Code** | `.mcp.json` in your project root, or `~/.mcp.json` for global access |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| **Gemini CLI** | `~/.gemini/settings.json` (add the server block inside the existing `mcpServers` object) |
| **Cursor** | `.cursor/mcp.json` in project root |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **VS Code (Copilot)** | `.vscode/mcp.json` in project root |

Any AI client or IDE that supports the Model Context Protocol can use mcp-obsidian — add the server config block to your client's MCP configuration.

### Multiple Vaults

Pass multiple vaults as a JSON object in `OBSIDIAN_VAULTS`:

```json
{
  "OBSIDIAN_VAULTS": "{\"Work\":\"/path/to/work-vault\",\"Personal\":\"/path/to/personal-vault\",\"Notes\":\"/path/to/notes\"}"
}
```

Then use the `vault` parameter on any tool call:

```json
{ "tool": "read_file", "args": { "vault": "Work", "path": "my-note.md" } }
```

Omitting `vault` defaults to the first vault in the list.

### Single Vault (Alternative)

For a single vault, you can use the simpler environment variables instead of `OBSIDIAN_VAULTS`:

```json
{
  "env": {
    "OBSIDIAN_VAULT_PATH": "/path/to/your/vault",
    "OBSIDIAN_VAULT_NAME": "My Vault"
  }
}
```

### Disabling Tools

To prevent specific tools from being exposed to MCP clients, set `OBSIDIAN_DISABLED_TOOLS` in the env block:

```json
{
  "env": {
    "OBSIDIAN_DISABLED_TOOLS": "search_replace_in_file,eval_obsidian"
  }
}
```

Comma-separated list. Disabled tools are removed from both the tool list and handler registry at startup.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OBSIDIAN_VAULTS` | JSON object: `{"name":"path",...}` for multi-vault | - |
| `OBSIDIAN_VAULT_PATH` | Path to single vault (alternative to `OBSIDIAN_VAULTS`) | - |
| `OBSIDIAN_VAULT_NAME` | Display name for single vault | - |
| `OBSIDIAN_DISABLED_TOOLS` | Comma-separated list of tools to disable | - |
| `OLLAMA_HOST` | Ollama API endpoint | `http://localhost:11434` |
| `OLLAMA_EMBEDDING_MODEL` | Model for embeddings | `nomic-embed-text` |
| `HTTP_MODE` | Run as HTTP server instead of STDIO | `false` |
| `HTTP_PORT` | Port for HTTP server | `3456` |

## Features

- **Unified Multi-Vault**: Single server process handles all vaults. Every tool accepts an optional `vault` parameter.
- **Two-Tier Architecture**: 30 filesystem tools (always available) + 33 CLI tools (when Obsidian 1.12+ is running)
- **File Operations**: List, read, create, update, delete, move files with frontmatter support
- **Wikilink Resolution**: Resolve `[[wikilinks]]`, get outlinks/backlinks, follow link chains
- **Semantic Search**: Vector-based similarity search using Ollama embeddings
- **Frontmatter Queries**: Dataview-like query engine with 10 filter operators
- **Vault Analytics**: Health reports, orphan detection, broken links, stale notes
- **Section Editing**: Append, prepend, or replace content within specific markdown sections
- **Cross-Vault Search**: Search across all vaults simultaneously
- **Daily Notes**: Read, append, prepend to daily notes (CLI)
- **Tasks**: List and update tasks across the vault (CLI)
- **Properties**: List all frontmatter properties with types, get all unique values for any property (CLI)
- **Templates & Bases**: Access templates and Obsidian database views (CLI)
- **Commands & History**: Execute Obsidian commands, access file version history (CLI)
- **Tool Filtering**: Disable specific tools via `OBSIDIAN_DISABLED_TOOLS` env var

## Two-Tier Architecture

| Tier | Tools | Requires | Always Available |
|------|-------|----------|-----------------|
| **Filesystem** | 30 tools | Node.js only | Yes — works without Obsidian running |
| **CLI Bridge** | 33 tools | Obsidian 1.12+ running | No — graceful error if app not running |

**Filesystem tools** read and write vault files directly. They work whether Obsidian is open or not.

**CLI tools** access Obsidian's runtime API (`app.vault`, `app.metadataCache`, `app.fileManager`, etc.) via the Obsidian CLI. They provide access to features that only exist in the running app — metadata cache, daily notes configuration, task parsing, property types, backlink index, version history, and more.

If Obsidian is not running, CLI tools return a clear error message. All filesystem tools continue to work normally.

### Enabling the Obsidian CLI

To use the 33 CLI tools, you need Obsidian 1.12+ with CLI enabled. In Obsidian: **Settings → General → Enable "Command line interface"**, then follow the prompt to register. See the [Obsidian CLI documentation](https://obsidian.md/help/cli) for install and troubleshooting details.

## Available Tools (63)

### Filesystem Tools (30 — always available)

#### File Operations (9)

| Tool | Description |
|------|-------------|
| `list_files` | List all markdown files in a vault |
| `read_file` | Read file contents with frontmatter |
| `create_file` | Create a new file with optional frontmatter |
| `update_file` | Overwrite file contents (use section editing for partial changes) |
| `delete_file` | Delete a file |
| `get_frontmatter` | Read only frontmatter metadata |
| `update_frontmatter` | Merge updates into frontmatter |
| `search_content` | Full-text regex search across files |
| `move_note` | Relocate a file and update all wikilinks pointing to it |

#### Wikilink Operations (5)

| Tool | Description |
|------|-------------|
| `resolve_wikilink` | Resolve a `[[wikilink]]` to its file path |
| `get_outlinks` | Get all wikilinks from a note |
| `get_backlinks` | Get all notes that link to a given note |
| `follow_link` | Resolve a wikilink and read the target file |
| `rebuild_link_index` | Rebuild the wikilink resolution index |

#### Semantic Search (5)

| Tool | Description |
|------|-------------|
| `semantic_search` | Find similar content using embeddings (requires Ollama) |
| `index_vault` | Index all files in a vault for search |
| `index_file` | Index a single file |
| `get_similar` | Find notes similar to a given note |
| `index_status` | Check indexing status and stats |

#### Frontmatter Queries (1)

| Tool | Description |
|------|-------------|
| `query_notes` | Dataview-like query engine for frontmatter fields |

Filter operators: `equals`, `not_equals`, `contains`, `not_contains`, `in`, `not_in`, `exists`, `not_exists`, `greater_than`, `less_than`

Example:
```json
{
  "tool": "query_notes",
  "args": {
    "vault": "Main",
    "from": "Projects",
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

#### Vault Analytics (4)

| Tool | Description |
|------|-------------|
| `get_vault_health` | Composite health report (orphans + broken links + stale notes) |
| `get_orphan_notes` | Find notes with zero inbound wikilinks |
| `get_broken_links` | Find wikilinks pointing to non-existent notes |
| `get_stale_notes` | Find notes not modified within N days |

#### Section Editing (3)

| Tool | Description |
|------|-------------|
| `append_to_section` | Add content to the end of a section |
| `prepend_to_section` | Add content to the beginning of a section |
| `update_section` | Replace all content within a section (heading preserved) |

#### Cross-Vault (3)

| Tool | Description |
|------|-------------|
| `search_all_vaults` | Search across all configured vaults |
| `find_note_by_name` | Find a note by name across vaults |
| `get_cross_vault_links` | Find wikilinks between vaults |

---

### CLI Tools (33 — require Obsidian 1.12+)

These tools access Obsidian's runtime API via the CLI bridge. They require the Obsidian app to be running with CLI enabled. If Obsidian is not running, they return a clear error message.

#### Daily Notes (4)

| Tool | Description |
|------|-------------|
| `daily_read` | Read today's daily note |
| `daily_append` | Append content to daily note |
| `daily_prepend` | Prepend content to daily note |
| `daily_path` | Get the configured daily note path |

#### Tasks (2)

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with status, file, line number. Filter by done/todo/daily |
| `update_task` | Toggle, complete, or uncomplete a task by file and line |

#### Tags (2)

| Tool | Description |
|------|-------------|
| `list_tags` | All tags with occurrence counts |
| `get_tag_info` | Tag details including file list |

#### Properties (2)

| Tool | Description |
|------|-------------|
| `list_properties` | All frontmatter properties with types and counts |
| `get_property_values` | All unique values for a property across the vault |

#### Structure (2)

| Tool | Description |
|------|-------------|
| `get_outline` | Heading tree for a file (tree, markdown, or JSON format) |
| `word_count` | Word and character count |

#### Targeted Editing (5)

| Tool | Description |
|------|-------------|
| `file_append` | Append content to end of any file |
| `file_prepend` | Prepend content to start of any file (after frontmatter) |
| `search_replace_in_file` | Atomic find-and-replace via `app.vault.process()` |
| `property_set` | Set a single frontmatter property without touching content |
| `property_remove` | Remove a single frontmatter property without touching content |

#### Search (1)

| Tool | Description |
|------|-------------|
| `vault_search` | Full-text search using Obsidian's built-in search engine with context |

#### Backlinks & Links (2)

| Tool | Description |
|------|-------------|
| `get_backlinks` | Backlinks from Obsidian's live index (includes frontmatter references) |
| `get_outlinks` | Outgoing links from Obsidian's live index |

#### Vault Structure (3)

| Tool | Description |
|------|-------------|
| `list_orphans` | Files with no incoming links |
| `list_deadends` | Files with no outgoing links |
| `unresolved_links` | Broken/unresolved wikilinks across the vault |

#### Templates (2)

| Tool | Description |
|------|-------------|
| `list_templates` | Available templates |
| `read_template` | Read template content, optionally with variables resolved |

#### Bases / Databases (2)

| Tool | Description |
|------|-------------|
| `list_bases` | List all base files in the vault |
| `query_base` | Query a base view (JSON, CSV, TSV, markdown, or paths) |

#### Commands (2)

| Tool | Description |
|------|-------------|
| `list_commands` | Available Obsidian commands with optional filter |
| `execute_command` | Run any Obsidian command by ID |

#### History (2)

| Tool | Description |
|------|-------------|
| `list_versions` | File version history (local and sync) |
| `read_version` | Read a historical version of a file |

#### Plugins (1)

| Tool | Description |
|------|-------------|
| `list_plugins` | Installed plugins with optional version info |

#### Advanced (1)

| Tool | Description |
|------|-------------|
| `eval_obsidian` | Execute JavaScript inside Obsidian's process. Access to the full `app.*` API |

## Semantic Search (Optional)

Semantic search requires [Ollama](https://ollama.ai/) running locally. All other tools (57 of 63) work without Ollama.

```bash
# Install (macOS)
brew install ollama

# Pull embedding model (~274MB)
ollama pull nomic-embed-text

# Verify
curl http://localhost:11434/api/tags
```

### First-Time Indexing

```bash
HTTP_MODE=true npx @wickedevolutions/mcp-obsidian &
curl http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{"tool": "index_vault", "args": {"vault": "MyVault"}}'
```

## HTTP Server Mode

```bash
HTTP_MODE=true HTTP_PORT=3456 npx @wickedevolutions/mcp-obsidian
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
├── types/index.ts        # TypeScript type definitions
├── cli/
│   └── bridge.ts         # Obsidian CLI bridge (1.12+)
├── parsers/
│   ├── markdown.ts       # Markdown/frontmatter parsing, section extraction
│   └── wikilink.ts       # Wikilink parsing + resolution
├── embeddings/
│   ├── ollama.ts         # Ollama API client
│   ├── storage.ts        # SQLite vector storage
│   └── watcher.ts        # File watcher for auto-indexing
└── tools/
    ├── index.ts          # Tool registration hub (8 modules)
    ├── files.ts          # File ops (9 tools)
    ├── wikilinks.ts      # Wikilink ops (5 tools)
    ├── semantic.ts       # Semantic search (5 tools)
    ├── crossvault.ts     # Cross-vault ops (3 tools)
    ├── sections.ts       # Section editing (3 tools)
    ├── query.ts          # Frontmatter queries (1 tool)
    ├── analytics.ts      # Vault health (4 tools)
    └── cli-tools.ts      # CLI-based tools (33 tools)
```

## Known Limitations

- **`update_file` replaces entire content** — Use `append_to_section`, `prepend_to_section`, or `update_section` for partial updates. CLI users can also use `search_replace_in_file` for atomic find-and-replace.
- **CLI tools require Obsidian running** — The 33 CLI tools need Obsidian 1.12+ with [CLI enabled](https://obsidian.md/help/cli). If Obsidian is not running, these tools return a clear error while the 30 filesystem tools continue working.
- **Unicode filenames** — Files with curly apostrophes (U+2019) and some Unicode characters may fail to resolve.
- **Vault path changes** — If a vault folder is renamed on disk, the `OBSIDIAN_VAULTS` environment variable must be updated manually.

## License

MIT — see [LICENSE](LICENSE) for details.
