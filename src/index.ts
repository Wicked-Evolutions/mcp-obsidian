#!/usr/bin/env node

/**
 * Obsidian MCP Server
 *
 * A custom MCP server for Obsidian vaults with:
 * - Direct filesystem access (no Obsidian required)
 * - Multi-vault support via environment variables
 * - Wikilink parsing and resolution
 * - Backlink discovery
 * - Semantic search via Ollama embeddings (Phase 3)
 *
 * @author Influencentricity
 * @license MIT
 */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, Config } from './config.js';
import { allTools, createAllHandlers } from './tools/index.js';
import { createVaultWatcher, VaultWatcher } from './embeddings/watcher.js';
import { createHttpServer } from './http-server.js';

// Load configuration
let config: Config;

try {
  config = loadConfig();
  console.error(`[mcp-obsidian] Loaded config: ${config.mode} mode with ${config.vaults.length} vault(s)`);
  for (const vault of config.vaults) {
    console.error(`[mcp-obsidian]   - ${vault.name}: ${vault.path}`);
  }
} catch (error) {
  console.error('[mcp-obsidian] Failed to load config:', error);
  process.exit(1);
}

// Create MCP server
const server = new Server(
  {
    name: 'mcp-obsidian',
    version: '1.2.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Create tool handlers
const handlers = createAllHandlers(config);

// Create file watcher for auto-indexing
let watcher: VaultWatcher | null = null;
const autoIndexEnabled = process.env.OBSIDIAN_AUTO_INDEX !== 'false'; // Enabled by default

if (autoIndexEnabled) {
  watcher = createVaultWatcher({
    vaults: config.vaults,
    ollama: config.ollama,
    debounceMs: 2000
  });
}

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: allTools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[mcp-obsidian] Tool call: ${name}`);

  const handler = handlers[name];
  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true
    } as const;
  }

  try {
    const result = await handler(args as Record<string, unknown>);
    return {
      content: result.content,
      isError: result.isError
    } as const;
  } catch (error) {
    console.error(`[mcp-obsidian] Tool error:`, error);
    return {
      content: [{ type: 'text', text: `Error executing ${name}: ${error}` }],
      isError: true
    } as const;
  }
});

// Process signal handlers
process.on('SIGTERM', () => {
  console.error('[mcp-obsidian] Received SIGTERM, shutting down...');
  if (watcher) watcher.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[mcp-obsidian] Received SIGINT, shutting down...');
  if (watcher) watcher.stop();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[mcp-obsidian] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('[mcp-obsidian] Unhandled rejection:', error);
  process.exit(1);
});

// Start server
async function main() {
  // Check if HTTP server mode is enabled (accept both env var names)
  const httpServerEnabled = process.env.OBSIDIAN_HTTP_SERVER === 'true' || process.env.HTTP_MODE === 'true';
  const httpPort = parseInt(process.env.OBSIDIAN_HTTP_PORT || process.env.HTTP_PORT || '3456', 10);

  if (httpServerEnabled) {
    // HTTP server mode - for Obsidian plugin access
    console.error('[mcp-obsidian] Starting in HTTP server mode...');
    createHttpServer({ port: httpPort, config });
  } else {
    // Standard MCP stdio mode - for Claude Desktop
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[mcp-obsidian] Server started (stdio mode)');
  }
}

main().catch((error) => {
  console.error('[mcp-obsidian] Fatal error:', error);
  process.exit(1);
});
