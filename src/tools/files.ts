/**
 * File operation tools for Obsidian MCP
 * Phase 1: Core CRUD operations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Config, getPrimaryVault } from '../config.js';
import { FileEntry, ToolResponse, SearchResult, SearchMatch } from '../types/index.js';
import {
  parseMarkdownFile,
  createMarkdownFile,
  updateFrontmatter,
  fileExists,
  extractTitle
} from '../parsers/markdown.js';

/**
 * Tool definitions for file operations
 */
export const fileTools: Tool[] = [
  {
    name: 'list_files',
    description: 'List files and folders in an Obsidian vault directory. Returns name, path, type (file/folder), size, and modification date.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Relative path from vault root. Empty or "/" for vault root.'
        },
        pattern: {
          type: 'string',
          description: 'Optional glob pattern to filter files (e.g., "*.md", "PROJECT*")'
        },
        recursive: {
          type: 'boolean',
          description: 'Include files in subdirectories',
          default: false
        }
      }
    }
  },
  {
    name: 'read_file',
    description: 'Read a markdown file from the Obsidian vault. Returns parsed frontmatter (YAML) and content separately.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from vault root (e.g., "01 Evergreen Notes/My Note.md")'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'create_file',
    description: 'Create a new markdown file in the vault. Will create parent directories if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path for the new file (e.g., "03 Projects/New Project.md")'
        },
        content: {
          type: 'string',
          description: 'Markdown content for the file'
        },
        frontmatter: {
          type: 'object',
          description: 'Optional YAML frontmatter as key-value pairs'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'update_file',
    description: 'Replace the entire content of a markdown file. Preserves frontmatter unless new frontmatter is provided.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file'
        },
        content: {
          type: 'string',
          description: 'New markdown content'
        },
        frontmatter: {
          type: 'object',
          description: 'Optional new frontmatter (replaces existing if provided)'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the vault. Use with caution!',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file to delete'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'get_frontmatter',
    description: 'Get only the YAML frontmatter from a file, without loading full content.',
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
    name: 'update_frontmatter',
    description: 'Update specific frontmatter fields without changing file content. Merges with existing frontmatter.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file'
        },
        updates: {
          type: 'object',
          description: 'Frontmatter fields to update or add'
        }
      },
      required: ['path', 'updates']
    }
  },
  {
    name: 'search_content',
    description: 'Search for text or regex pattern across vault files. Returns matching files with line numbers and context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text or regex pattern to search for'
        },
        directory: {
          type: 'string',
          description: 'Limit search to a specific directory'
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Case-sensitive search',
          default: false
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of files to return',
          default: 20
        }
      },
      required: ['query']
    }
  }
];

/**
 * Handler functions for file tools
 */
export function createFileHandlers(config: Config) {
  const vault = getPrimaryVault(config);

  return {
    list_files: async (args: {
      directory?: string;
      pattern?: string;
      recursive?: boolean;
    }): Promise<ToolResponse> => {
      try {
        const dir = args.directory || '';
        const targetPath = path.join(vault.path, dir);

        const entries = await listDirectory(targetPath, vault.path, args.recursive || false);

        // Filter by pattern if provided
        let filtered = entries;
        if (args.pattern) {
          const regex = globToRegex(args.pattern);
          filtered = entries.filter(e => regex.test(e.name));
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error listing files: ${error}` }],
          isError: true
        };
      }
    },

    read_file: async (args: { path: string }): Promise<ToolResponse> => {
      try {
        const parsed = await parseMarkdownFile(args.path, vault.path);
        const title = extractTitle(parsed);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              path: parsed.path,
              title,
              frontmatter: parsed.frontmatter,
              content: parsed.content
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error reading file: ${error}` }],
          isError: true
        };
      }
    },

    create_file: async (args: {
      path: string;
      content: string;
      frontmatter?: Record<string, unknown>;
    }): Promise<ToolResponse> => {
      try {
        // Check if file already exists
        if (await fileExists(args.path, vault.path)) {
          return {
            content: [{ type: 'text', text: `File already exists: ${args.path}` }],
            isError: true
          };
        }

        const parsed = await createMarkdownFile(
          args.path,
          vault.path,
          args.content,
          args.frontmatter || {}
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              created: true,
              path: parsed.path,
              frontmatter: parsed.frontmatter
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error creating file: ${error}` }],
          isError: true
        };
      }
    },

    update_file: async (args: {
      path: string;
      content: string;
      frontmatter?: Record<string, unknown>;
    }): Promise<ToolResponse> => {
      try {
        const absolutePath = path.join(vault.path, args.path);

        // Read existing file to preserve frontmatter if not provided
        let finalFrontmatter = args.frontmatter;
        if (!finalFrontmatter) {
          try {
            const existing = await parseMarkdownFile(args.path, vault.path);
            finalFrontmatter = existing.frontmatter;
          } catch {
            finalFrontmatter = {};
          }
        }

        // Create/update file
        const parsed = await createMarkdownFile(
          args.path,
          vault.path,
          args.content,
          finalFrontmatter
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              updated: true,
              path: parsed.path
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error updating file: ${error}` }],
          isError: true
        };
      }
    },

    delete_file: async (args: { path: string }): Promise<ToolResponse> => {
      try {
        const absolutePath = path.join(vault.path, args.path);
        await fs.unlink(absolutePath);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ deleted: true, path: args.path }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error deleting file: ${error}` }],
          isError: true
        };
      }
    },

    get_frontmatter: async (args: { path: string }): Promise<ToolResponse> => {
      try {
        const parsed = await parseMarkdownFile(args.path, vault.path);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              path: parsed.path,
              frontmatter: parsed.frontmatter
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error getting frontmatter: ${error}` }],
          isError: true
        };
      }
    },

    update_frontmatter: async (args: {
      path: string;
      updates: Record<string, unknown>;
    }): Promise<ToolResponse> => {
      try {
        const parsed = await updateFrontmatter(args.path, vault.path, args.updates);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              updated: true,
              path: parsed.path,
              frontmatter: parsed.frontmatter
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error updating frontmatter: ${error}` }],
          isError: true
        };
      }
    },

    search_content: async (args: {
      query: string;
      directory?: string;
      caseSensitive?: boolean;
      maxResults?: number;
    }): Promise<ToolResponse> => {
      try {
        const searchDir = args.directory
          ? path.join(vault.path, args.directory)
          : vault.path;

        const flags = args.caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(args.query, flags);
        const maxResults = args.maxResults || 20;

        const results = await searchFiles(searchDir, vault.path, regex, maxResults);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: args.query,
              resultCount: results.length,
              results
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error searching: ${error}` }],
          isError: true
        };
      }
    }
  };
}

/**
 * Helper: List directory contents
 */
async function listDirectory(
  dirPath: string,
  vaultPath: string,
  recursive: boolean,
  results: FileEntry[] = []
): Promise<FileEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(vaultPath, fullPath);
    const stats = await fs.stat(fullPath);

    results.push({
      name: entry.name,
      path: relativePath,
      isDirectory: entry.isDirectory(),
      modified: stats.mtime,
      size: stats.size
    });

    if (recursive && entry.isDirectory()) {
      await listDirectory(fullPath, vaultPath, true, results);
    }
  }

  return results;
}

/**
 * Helper: Search files for content
 */
async function searchFiles(
  dirPath: string,
  vaultPath: string,
  regex: RegExp,
  maxResults: number,
  results: SearchResult[] = []
): Promise<SearchResult[]> {
  if (results.length >= maxResults) return results;

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= maxResults) break;
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await searchFiles(fullPath, vaultPath, regex, maxResults, results);
    } else if (entry.name.endsWith('.md')) {
      const content = await fs.readFile(fullPath, 'utf-8');
      const matches = findMatches(content, regex);

      if (matches.length > 0) {
        results.push({
          path: path.relative(vaultPath, fullPath),
          matches
        });
      }
    }
  }

  return results;
}

/**
 * Helper: Find regex matches in content with context
 */
function findMatches(content: string, regex: RegExp): SearchMatch[] {
  const lines = content.split('\n');
  const matches: SearchMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    regex.lastIndex = 0; // Reset regex state

    while ((match = regex.exec(line)) !== null) {
      matches.push({
        lineNumber: i + 1,
        lineContent: line.trim(),
        matchStart: match.index,
        matchEnd: match.index + match[0].length
      });

      // Prevent infinite loops with zero-length matches
      if (match[0].length === 0) break;
    }
  }

  return matches;
}

/**
 * Helper: Convert glob pattern to regex
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}
