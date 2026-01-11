/**
 * Semantic search tools for Obsidian MCP
 * Phase 3: Embedding-based search via Ollama
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Config, getPrimaryVault } from '../config.js';
import { ToolResponse } from '../types/index.js';
import { parseMarkdownFile, extractTitle } from '../parsers/markdown.js';
import {
  generateEmbedding,
  checkOllamaAvailability,
  OllamaConfig
} from '../embeddings/ollama.js';
import { EmbeddingStorage } from '../embeddings/storage.js';

// Storage instance (lazy initialized)
let storage: EmbeddingStorage | null = null;

/**
 * Get or create storage instance
 */
function getStorage(vaultPath: string): EmbeddingStorage {
  if (!storage) {
    const dbPath = path.join(vaultPath, '.mcp-obsidian', 'embeddings.db');
    storage = new EmbeddingStorage(dbPath);
  }
  return storage;
}

/**
 * Generate content hash for change detection
 */
function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Tool definitions for semantic search
 */
export const semanticTools: Tool[] = [
  {
    name: 'semantic_search',
    description: 'Search vault using semantic similarity. Finds content by meaning, not just keywords. Requires indexed vault.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query (e.g., "notes about marketing strategy")'
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return',
          default: 10
        },
        minSimilarity: {
          type: 'number',
          description: 'Minimum similarity score (0-1)',
          default: 0.5
        }
      },
      required: ['query']
    }
  },
  {
    name: 'index_vault',
    description: 'Build or rebuild the semantic search index. Processes all markdown files and generates embeddings. May take a while for large vaults.',
    inputSchema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: 'Re-index all files even if unchanged',
          default: false
        },
        directory: {
          type: 'string',
          description: 'Only index files in this directory'
        }
      }
    }
  },
  {
    name: 'index_file',
    description: 'Index a single file for semantic search.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'get_similar',
    description: 'Find files similar to a given file based on semantic similarity.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the reference file'
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return',
          default: 5
        }
      },
      required: ['path']
    }
  },
  {
    name: 'index_status',
    description: 'Get status of the semantic search index.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Handler functions for semantic tools
 */
export function createSemanticHandlers(config: Config) {
  const vault = getPrimaryVault(config);
  const ollamaConfig: OllamaConfig = {
    host: config.ollama.host,
    model: config.ollama.model
  };

  return {
    semantic_search: async (args: {
      query: string;
      limit?: number;
      minSimilarity?: number;
    }): Promise<ToolResponse> => {
      try {
        // Check Ollama availability
        const ollama = await checkOllamaAvailability(ollamaConfig);
        if (!ollama.available || !ollama.hasModel) {
          return {
            content: [{ type: 'text', text: `Ollama not ready: ${ollama.error}` }],
            isError: true
          };
        }

        const store = getStorage(vault.path);
        const stats = store.getStats();

        if (stats.totalEmbeddings === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'No indexed content. Run index_vault first.',
                indexed: 0
              }, null, 2)
            }],
            isError: false
          };
        }

        // Generate query embedding
        const queryResult = await generateEmbedding(args.query, ollamaConfig);

        // Search
        const results = store.search(
          queryResult.embedding,
          args.limit || 10,
          args.minSimilarity || 0.5
        );

        // Enrich results with file titles
        const enrichedResults = await Promise.all(results.map(async r => {
          try {
            const parsed = await parseMarkdownFile(r.filePath, vault.path);
            return {
              path: r.filePath,
              title: extractTitle(parsed),
              similarity: Math.round(r.similarity * 1000) / 1000,
              preview: parsed.content.slice(0, 200) + (parsed.content.length > 200 ? '...' : '')
            };
          } catch {
            return {
              path: r.filePath,
              title: path.basename(r.filePath, '.md'),
              similarity: Math.round(r.similarity * 1000) / 1000,
              preview: ''
            };
          }
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: args.query,
              resultCount: enrichedResults.length,
              results: enrichedResults
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Semantic search error: ${error}` }],
          isError: true
        };
      }
    },

    index_vault: async (args: {
      force?: boolean;
      directory?: string;
    }): Promise<ToolResponse> => {
      try {
        // Check Ollama availability
        const ollama = await checkOllamaAvailability(ollamaConfig);
        if (!ollama.available || !ollama.hasModel) {
          return {
            content: [{ type: 'text', text: `Ollama not ready: ${ollama.error}` }],
            isError: true
          };
        }

        const store = getStorage(vault.path);
        const searchDir = args.directory
          ? path.join(vault.path, args.directory)
          : vault.path;

        let indexed = 0;
        let skipped = 0;
        let errors = 0;

        // Collect all markdown files
        const files = await collectMarkdownFiles(searchDir, vault.path);

        for (const filePath of files) {
          try {
            const content = await fs.readFile(path.join(vault.path, filePath), 'utf-8');

            // Skip empty or nearly empty files
            const trimmedContent = content.trim();
            if (trimmedContent.length < 10) {
              skipped++;
              continue;
            }

            const contentHash = hashContent(content);

            // Skip if already indexed and unchanged
            if (!args.force && store.isUpToDate(filePath, contentHash)) {
              skipped++;
              continue;
            }

            // Generate embedding
            const result = await generateEmbedding(content, ollamaConfig);

            // Skip if embedding generation failed or returned empty
            if (!result.embedding || result.embedding.length === 0) {
              console.error(`[mcp-obsidian] Empty embedding for ${filePath}, skipping`);
              skipped++;
              continue;
            }

            // Store embedding
            store.store(filePath, result.embedding, contentHash, {
              indexedAt: new Date().toISOString()
            });

            indexed++;

            // Log progress every 10 files
            if (indexed % 10 === 0) {
              console.error(`[mcp-obsidian] Indexed ${indexed} files...`);
            }
          } catch (err) {
            console.error(`[mcp-obsidian] Error indexing ${filePath}:`, err);
            errors++;
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              indexed,
              skipped,
              errors,
              totalFiles: files.length
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Index error: ${error}` }],
          isError: true
        };
      }
    },

    index_file: async (args: { path: string }): Promise<ToolResponse> => {
      try {
        // Check Ollama availability
        const ollama = await checkOllamaAvailability(ollamaConfig);
        if (!ollama.available || !ollama.hasModel) {
          return {
            content: [{ type: 'text', text: `Ollama not ready: ${ollama.error}` }],
            isError: true
          };
        }

        const store = getStorage(vault.path);
        const absolutePath = path.join(vault.path, args.path);

        const content = await fs.readFile(absolutePath, 'utf-8');
        const contentHash = hashContent(content);

        // Generate embedding
        const result = await generateEmbedding(content, ollamaConfig);

        // Store embedding
        store.store(args.path, result.embedding, contentHash, {
          indexedAt: new Date().toISOString()
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              indexed: true,
              path: args.path,
              embeddingDimensions: result.embedding.length
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Index file error: ${error}` }],
          isError: true
        };
      }
    },

    get_similar: async (args: {
      path: string;
      limit?: number;
    }): Promise<ToolResponse> => {
      try {
        const store = getStorage(vault.path);

        // Get embedding for reference file
        const stored = store.get(args.path);

        if (!stored) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'File not indexed. Run index_file first.',
                path: args.path
              }, null, 2)
            }],
            isError: false
          };
        }

        // Handle empty embeddings
        if (!stored.embedding || stored.embedding.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'File has empty embedding (likely empty/minimal content). Try re-indexing.',
                path: args.path
              }, null, 2)
            }],
            isError: false
          };
        }

        // Search for similar (excluding self)
        const results = store.search(stored.embedding, (args.limit || 5) + 1, 0)
          .filter(r => r.filePath !== args.path)
          .slice(0, args.limit || 5);

        // Enrich results
        const enrichedResults = await Promise.all(results.map(async r => {
          try {
            const parsed = await parseMarkdownFile(r.filePath, vault.path);
            return {
              path: r.filePath,
              title: extractTitle(parsed),
              similarity: Math.round(r.similarity * 1000) / 1000
            };
          } catch {
            return {
              path: r.filePath,
              title: path.basename(r.filePath, '.md'),
              similarity: Math.round(r.similarity * 1000) / 1000
            };
          }
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              referencePath: args.path,
              similarFiles: enrichedResults
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Get similar error: ${error}` }],
          isError: true
        };
      }
    },

    index_status: async (): Promise<ToolResponse> => {
      try {
        const store = getStorage(vault.path);
        const stats = store.getStats();

        // Check Ollama
        const ollama = await checkOllamaAvailability(ollamaConfig);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              vault: vault.name,
              totalEmbeddings: stats.totalEmbeddings,
              uniqueFiles: stats.uniqueFiles,
              lastUpdated: stats.lastUpdated
                ? new Date(stats.lastUpdated).toISOString()
                : null,
              ollama: {
                available: ollama.available,
                model: ollamaConfig.model,
                hasModel: ollama.hasModel,
                error: ollama.error
              }
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Index status error: ${error}` }],
          isError: true
        };
      }
    }
  };
}

/**
 * Helper: Collect all markdown files recursively
 */
async function collectMarkdownFiles(
  dirPath: string,
  vaultPath: string,
  files: string[] = []
): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files and directories
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await collectMarkdownFiles(fullPath, vaultPath, files);
    } else if (entry.name.endsWith('.md')) {
      files.push(path.relative(vaultPath, fullPath));
    }
  }

  return files;
}
