# MCP Obsidian

A Model Context Protocol (MCP) server for Obsidian vault integration with Claude. Provides file operations, semantic search with local embeddings, and section-level editing capabilities.

## Features

- **File Operations**: List, read, write, create, and search files in Obsidian vaults
- **Semantic Search**: Vector-based similarity search using Ollama embeddings
  - Hybrid search (semantic + keyword matching)
  - Query expansion for better recall
  - Heading-based chunking for precise results
- **Section Editing**: Read and update specific sections by heading
- **Multi-Vault Support**: Manage multiple vaults from a single server
- **Auto-Indexing**: File watcher automatically indexes new/changed files

## Prerequisites

- Node.js 18+
- [Ollama](https://ollama.ai/) running locally (for semantic search)
- Obsidian vault(s)

## Installation

```bash
git clone https://github.com/Influencentricity/mcp-obsidian.git
cd mcp-obsidian
npm install
npm run build
```

## Configuration

### For Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

### Multi-Vault Configuration

```json
{
  "mcpServers": {
    "obsidian-ecosystem": {
      "command": "node",
      "args": ["/path/to/mcp-obsidian/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULTS": "{\"vault1\":\"/path/to/vault1\",\"vault2\":\"/path/to/vault2\"}"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OBSIDIAN_VAULT_PATH` | Path to single vault | - |
| `OBSIDIAN_VAULT_NAME` | Display name for vault | - |
| `OBSIDIAN_VAULTS` | JSON object for multi-vault mode | - |
| `OLLAMA_HOST` | Ollama API endpoint | `http://localhost:11434` |
| `OLLAMA_EMBEDDING_MODEL` | Model for embeddings | `nomic-embed-text` |
| `HTTP_MODE` | Run as HTTP server instead of MCP | `false` |
| `HTTP_PORT` | Port for HTTP server | `3456` |

## Ollama Setup (Required for Semantic Search)

Semantic search requires [Ollama](https://ollama.ai/) running locally to generate embeddings.

### 1. Install Ollama

**macOS:**
```bash
# Using Homebrew
brew install ollama

# Or download from https://ollama.ai/download
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download from https://ollama.ai/download

### 2. Start Ollama

```bash
# Start the Ollama service (runs on port 11434 by default)
ollama serve
```

On macOS, Ollama runs automatically after installation. Check with:
```bash
curl http://localhost:11434/api/tags
```

### 3. Pull Required Models

**Embedding model (required):**
```bash
ollama pull nomic-embed-text
```

This model generates 768-dimensional vectors for semantic similarity. It's ~274MB.

**Query expansion model (optional but recommended):**
```bash
ollama pull qwen2.5:7b
```

This enables query expansion which improves search recall. It's ~4.7GB.

### 4. Verify Setup

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Test embedding generation
curl http://localhost:11434/api/embeddings \
  -d '{"model": "nomic-embed-text", "prompt": "Hello world"}'
```

You should see a response with an `embedding` array of 768 numbers.

### 5. First-Time Indexing

The first time you use semantic search, the vault needs to be indexed:

```bash
# Via HTTP server
HTTP_MODE=true node dist/index.js &
curl http://localhost:3456/call \
  -H "Content-Type: application/json" \
  -d '{"tool": "index_vault", "args": {}}'
```

Or via Claude Desktop, just call the `index_vault` tool.

Indexing creates:
- Vector embeddings for each section (split by markdown headings)
- Full-text search index for keyword matching
- SQLite database stored alongside your vault

### Troubleshooting

**"Ollama embedding failed: 500"**
- Check Ollama is running: `curl http://localhost:11434/api/tags`
- Ensure model is pulled: `ollama list`
- Restart Ollama: `ollama serve`

**"Model not found"**
```bash
ollama pull nomic-embed-text
```

**Slow indexing**
- Initial indexing of large vaults takes time (1-2 sections/second)
- Subsequent runs only index changed files
- Consider running indexing overnight for large vaults

**Memory issues**
- nomic-embed-text uses ~500MB RAM
- qwen2.5:7b uses ~5GB RAM (only loaded during query expansion)
- Close other apps if needed

## Available Tools

### File Operations

| Tool | Description |
|------|-------------|
| `list_files` | List all markdown files in vault |
| `read_file` | Read contents of a file |
| `write_file` | Overwrite file contents |
| `create_file` | Create a new file |
| `search_files` | Search files by pattern |

### Section Operations

| Tool | Description |
|------|-------------|
| `read_section` | Read a specific section by heading |
| `update_section` | Update content under a heading |

### Semantic Search

| Tool | Description |
|------|-------------|
| `semantic_search` | Find similar content using embeddings |
| `index_vault` | Reindex all files in vault |
| `index_file` | Index a single file |

### Semantic Search Parameters

```typescript
semantic_search({
  query: "how to start a session",  // Search query
  limit: 10,                         // Max results (default: 10)
  minSimilarity: 0.5,               // Minimum similarity threshold (default: 0.5)
  expand: true                       // Use query expansion (default: false)
})
```

## HTTP Server Mode

For testing or integration with other tools, run as an HTTP server:

```bash
HTTP_MODE=true HTTP_PORT=3456 node dist/index.js
```

Endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/tools` | GET | List available tools |
| `/call` | POST | Call any tool |
| `/search` | POST | Semantic search shorthand |

Example:
```bash
curl http://localhost:3456/search \
  -H "Content-Type: application/json" \
  -d '{"query": "project notes", "limit": 5, "expand": true}'
```

## How Semantic Search Works

1. **Indexing**: Files are split by headings into sections. Each section gets:
   - A vector embedding (768 dimensions via nomic-embed-text)
   - Full-text search index (FTS5 with BM25 scoring)

2. **Hybrid Search**: Queries use both:
   - Semantic similarity (70% weight) - finds conceptually similar content
   - Keyword matching (30% weight) - finds exact term matches

3. **Query Expansion** (optional): Uses a local LLM to generate alternative phrasings, improving recall for ambiguous queries.

4. **Results**: Returns file path, section heading, and similarity score.

## Development

```bash
# Build
npm run build

# Watch mode
npm run watch

# Run HTTP server for testing
HTTP_MODE=true npm start
```

## Architecture

```
src/
├── index.ts           # Entry point, MCP server setup
├── http-server.ts     # HTTP server mode
├── config.ts          # Configuration loading
├── watcher.ts         # File system watcher
├── parsers/
│   └── markdown.ts    # Markdown parsing, section extraction
├── embeddings/
│   ├── ollama.ts      # Ollama API client
│   └── storage.ts     # SQLite vector storage
└── tools/
    ├── files.ts       # File operation handlers
    ├── sections.ts    # Section editing handlers
    └── semantic.ts    # Semantic search handlers
```

## Database

Embeddings are stored in SQLite at `data/embeddings.db`:

- `embeddings` table: Vector embeddings as binary blobs
- `content_fts` table: FTS5 full-text search index

The database is created automatically on first run.

## License

MIT
