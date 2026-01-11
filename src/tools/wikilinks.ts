/**
 * Wikilink tools for Obsidian MCP
 * Phase 2: Link parsing, resolution, and backlink discovery
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Config, getPrimaryVault } from '../config.js';
import { WikiLink, BacklinkEntry, ToolResponse } from '../types/index.js';
import { parseMarkdownFile, extractTitle } from '../parsers/markdown.js';
import {
  extractWikilinks,
  resolveWikilink,
  buildFileIndex,
  getWikilinkLineNumber,
  getWikilinkContext
} from '../parsers/wikilink.js';

// Cache for file index (rebuilt on demand)
let fileIndexCache: Map<string, string> | null = null;
let fileIndexVault: string | null = null;

/**
 * Tool definitions for wikilink operations
 */
export const wikilinkTools: Tool[] = [
  {
    name: 'resolve_wikilink',
    description: 'Resolve a [[wikilink]] to its actual file path in the vault. Returns null if not found.',
    inputSchema: {
      type: 'object',
      properties: {
        link: {
          type: 'string',
          description: 'The wikilink target (e.g., "My Note" or "folder/My Note")'
        }
      },
      required: ['link']
    }
  },
  {
    name: 'get_outlinks',
    description: 'Get all wikilinks FROM a file (outgoing links). Shows which notes this file links to.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file'
        },
        resolveLinks: {
          type: 'boolean',
          description: 'Resolve each link to its actual file path',
          default: true
        }
      },
      required: ['path']
    }
  },
  {
    name: 'get_backlinks',
    description: 'Get all files linking TO a note (incoming links/backlinks). Shows which notes reference this one.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the target file'
        },
        includeContext: {
          type: 'boolean',
          description: 'Include surrounding text context for each backlink',
          default: true
        }
      },
      required: ['path']
    }
  },
  {
    name: 'follow_link',
    description: 'Resolve a wikilink and return its content. Combines resolve + read in one operation.',
    inputSchema: {
      type: 'object',
      properties: {
        link: {
          type: 'string',
          description: 'The wikilink to follow (e.g., "My Note" or "folder/My Note")'
        }
      },
      required: ['link']
    }
  },
  {
    name: 'rebuild_link_index',
    description: 'Rebuild the internal file index for faster wikilink resolution. Run after adding many files.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Handler functions for wikilink tools
 */
export function createWikilinkHandlers(config: Config) {
  const vault = getPrimaryVault(config);

  // Helper to get or build file index
  async function getFileIndex(): Promise<Map<string, string>> {
    if (fileIndexCache && fileIndexVault === vault.path) {
      return fileIndexCache;
    }
    fileIndexCache = await buildFileIndex(vault.path);
    fileIndexVault = vault.path;
    return fileIndexCache;
  }

  return {
    resolve_wikilink: async (args: { link: string }): Promise<ToolResponse> => {
      try {
        const fileIndex = await getFileIndex();
        const resolved = await resolveWikilink(args.link, vault.path, fileIndex);

        if (resolved) {
          const relativePath = path.relative(vault.path, resolved);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                link: args.link,
                resolved: relativePath,
                exists: true
              }, null, 2)
            }],
            isError: false
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                link: args.link,
                resolved: null,
                exists: false
              }, null, 2)
            }],
            isError: false
          };
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error resolving wikilink: ${error}` }],
          isError: true
        };
      }
    },

    get_outlinks: async (args: {
      path: string;
      resolveLinks?: boolean;
    }): Promise<ToolResponse> => {
      try {
        const parsed = await parseMarkdownFile(args.path, vault.path);
        const links = extractWikilinks(parsed.rawContent);

        // Resolve links if requested
        if (args.resolveLinks !== false) {
          const fileIndex = await getFileIndex();
          for (const link of links) {
            const resolved = await resolveWikilink(link.target, vault.path, fileIndex);
            if (resolved) {
              link.resolved = path.relative(vault.path, resolved);
              link.exists = true;
            }
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              file: args.path,
              linkCount: links.length,
              links: links.map(l => ({
                target: l.target,
                alias: l.alias,
                resolved: l.resolved,
                exists: l.exists
              }))
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error getting outlinks: ${error}` }],
          isError: true
        };
      }
    },

    get_backlinks: async (args: {
      path: string;
      includeContext?: boolean;
    }): Promise<ToolResponse> => {
      try {
        const targetPath = args.path;
        const targetName = path.basename(targetPath, '.md');
        const backlinks: BacklinkEntry[] = [];

        // Search all markdown files in vault
        await searchForBacklinks(
          vault.path,
          vault.path,
          targetPath,
          targetName,
          args.includeContext !== false,
          backlinks
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              target: targetPath,
              backlinkCount: backlinks.length,
              backlinks
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error getting backlinks: ${error}` }],
          isError: true
        };
      }
    },

    follow_link: async (args: { link: string }): Promise<ToolResponse> => {
      try {
        const fileIndex = await getFileIndex();
        const resolved = await resolveWikilink(args.link, vault.path, fileIndex);

        if (!resolved) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                link: args.link,
                found: false,
                error: 'Link target not found'
              }, null, 2)
            }],
            isError: false
          };
        }

        const parsed = await parseMarkdownFile(resolved, vault.path);
        const title = extractTitle(parsed);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              link: args.link,
              found: true,
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
          content: [{ type: 'text', text: `Error following link: ${error}` }],
          isError: true
        };
      }
    },

    rebuild_link_index: async (): Promise<ToolResponse> => {
      try {
        fileIndexCache = null;
        fileIndexVault = null;
        const index = await getFileIndex();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              rebuilt: true,
              fileCount: index.size
            }, null, 2)
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error rebuilding index: ${error}` }],
          isError: true
        };
      }
    }
  };
}

/**
 * Helper: Search vault for files that link to a target
 */
async function searchForBacklinks(
  dirPath: string,
  vaultPath: string,
  targetPath: string,
  targetName: string,
  includeContext: boolean,
  backlinks: BacklinkEntry[]
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await searchForBacklinks(fullPath, vaultPath, targetPath, targetName, includeContext, backlinks);
    } else if (entry.name.endsWith('.md')) {
      // Don't include self-references
      const relativePath = path.relative(vaultPath, fullPath);
      if (relativePath === targetPath) continue;

      const content = await fs.readFile(fullPath, 'utf-8');
      const links = extractWikilinks(content);

      // Check if any link points to our target
      for (const link of links) {
        const normalizedTarget = link.target.toLowerCase();
        const normalizedName = targetName.toLowerCase();

        // Match by name or path
        if (
          normalizedTarget === normalizedName ||
          normalizedTarget === normalizedName + '.md' ||
          normalizedTarget.endsWith('/' + normalizedName) ||
          normalizedTarget.endsWith('/' + normalizedName + '.md') ||
          path.basename(targetPath, '.md').toLowerCase() === normalizedTarget
        ) {
          try {
            const parsed = await parseMarkdownFile(fullPath, vaultPath);
            const title = extractTitle(parsed);

            backlinks.push({
              sourcePath: relativePath,
              sourceTitle: title,
              context: includeContext ? getWikilinkContext(content, link.raw) : '',
              lineNumber: getWikilinkLineNumber(content, link.raw)
            });
          } catch {
            // Skip files that can't be parsed
          }
          break; // Only count one backlink per file
        }
      }
    }
  }
}
