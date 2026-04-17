/**
 * CLI-based tools for Obsidian MCP
 * These tools use the Obsidian CLI (1.12+) to access features
 * that are not available through filesystem access alone.
 * Requires Obsidian app to be running.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Config } from '../config.js';
import { ToolResponse } from '../types/index.js';
import { execCli, execCliForVault, evalInObsidian, isCliAvailable } from '../cli/bridge.js';

const vaultParam = {
  type: 'string' as const,
  description: 'Vault name (e.g., "Platform", "Helena"). Defaults to first vault if omitted.'
};

/**
 * Wrap a CLI tool handler to check availability first
 */
function withCliCheck(handler: (...args: any[]) => Promise<ToolResponse>): (...args: any[]) => Promise<ToolResponse> {
  return async (...args) => {
    const available = await isCliAvailable();
    if (!available) {
      return {
        content: [{ type: 'text', text: 'Obsidian CLI is not available. Make sure Obsidian 1.12+ is running with CLI enabled.' }],
        isError: true
      };
    }
    return handler(...args);
  };
}

// ─── Tool Definitions ────────────────────────────────────────────────

export const cliTools: Tool[] = [
  // ── Daily Notes ──
  {
    name: 'daily_read',
    description: "Read today's daily note contents. Requires Obsidian running with CLI enabled.",
    inputSchema: {
      type: 'object',
      properties: { vault: vaultParam }
    }
  },
  {
    name: 'daily_append',
    description: 'Append content to today\'s daily note. Creates the note if it doesn\'t exist. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        content: { type: 'string', description: 'Content to append' }
      },
      required: ['content']
    }
  },
  {
    name: 'daily_prepend',
    description: 'Prepend content to today\'s daily note. Creates the note if it doesn\'t exist. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        content: { type: 'string', description: 'Content to prepend' }
      },
      required: ['content']
    }
  },
  {
    name: 'daily_path',
    description: "Get today's daily note path (even if it hasn't been created yet). Requires Obsidian running.",
    inputSchema: {
      type: 'object',
      properties: { vault: vaultParam }
    }
  },

  // ── Tasks ──
  {
    name: 'list_tasks',
    description: 'List tasks across the vault or from a specific file. Filter by done/todo/daily. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'Filter by file name' },
        filter: { type: 'string', enum: ['todo', 'done', 'all'], description: 'Filter tasks (default: all)' },
        daily: { type: 'boolean', description: 'Show tasks from daily note only' },
        verbose: { type: 'boolean', description: 'Group by file with line numbers' },
        format: { type: 'string', enum: ['text', 'json', 'tsv'], description: 'Output format (default: text)' }
      }
    }
  },
  {
    name: 'update_task',
    description: 'Toggle or set the status of a task. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name containing the task' },
        line: { type: 'number', description: 'Line number of the task' },
        action: { type: 'string', enum: ['toggle', 'done', 'todo'], description: 'Action to perform' },
        daily: { type: 'boolean', description: 'Target daily note' }
      },
      required: ['line', 'action']
    }
  },

  // ── Tags ──
  {
    name: 'list_tags',
    description: 'List all tags in the vault with occurrence counts. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        sort: { type: 'string', enum: ['name', 'count'], description: 'Sort order (default: name)' },
        format: { type: 'string', enum: ['tsv', 'json', 'csv'], description: 'Output format (default: tsv)' }
      }
    }
  },
  {
    name: 'get_tag_info',
    description: 'Get details about a specific tag: occurrence count and which files use it. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        name: { type: 'string', description: 'Tag name (with or without #)' }
      },
      required: ['name']
    }
  },

  // ── Properties (vault-wide) ──
  {
    name: 'list_properties',
    description: 'List all frontmatter properties used across the vault with counts and types. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        sort: { type: 'string', enum: ['name', 'count'], description: 'Sort order (default: name)' },
        format: { type: 'string', enum: ['yaml', 'json', 'tsv'], description: 'Output format (default: yaml)' }
      }
    }
  },
  {
    name: 'get_property_values',
    description: 'Get all unique values used for a specific frontmatter property across the vault. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        name: { type: 'string', description: 'Property name (e.g., "status", "type", "domain")' }
      },
      required: ['name']
    }
  },

  // ── Outline ──
  {
    name: 'get_outline',
    description: 'Get the heading structure (outline) of a file as a tree. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name (wikilink-style resolution)' },
        path: { type: 'string', description: 'Exact file path from vault root' },
        format: { type: 'string', enum: ['tree', 'md', 'json'], description: 'Output format (default: tree)' }
      }
    }
  },

  // ── Templates ──
  {
    name: 'list_templates',
    description: 'List available templates in the vault. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: { vault: vaultParam }
    }
  },
  {
    name: 'read_template',
    description: 'Read a template with optional variable resolution ({{date}}, {{time}}, {{title}}). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        name: { type: 'string', description: 'Template name' },
        resolve: { type: 'boolean', description: 'Resolve template variables' },
        title: { type: 'string', description: 'Title for {{title}} variable resolution' }
      },
      required: ['name']
    }
  },

  // ── Bases ──
  {
    name: 'list_bases',
    description: 'List all .base files in the vault. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: { vault: vaultParam }
    }
  },
  {
    name: 'query_base',
    description: 'Query a base and return structured results. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'Base file name' },
        path: { type: 'string', description: 'Base file path' },
        view: { type: 'string', description: 'View name to query' },
        format: { type: 'string', enum: ['json', 'csv', 'tsv', 'md', 'paths'], description: 'Output format (default: json)' }
      }
    }
  },

  // ── Commands ──
  {
    name: 'list_commands',
    description: 'List available Obsidian commands. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        filter: { type: 'string', description: 'Filter by command ID prefix' }
      }
    }
  },
  {
    name: 'execute_command',
    description: 'Execute an Obsidian command by ID. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        id: { type: 'string', description: 'Command ID (e.g., "editor:toggle-bold", "app:open-settings")' }
      },
      required: ['id']
    }
  },

  // ── History ──
  {
    name: 'list_versions',
    description: 'List version history for a file (from local file recovery and/or sync). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        filter: { type: 'string', enum: ['local', 'sync'], description: 'Filter by version source' }
      }
    }
  },
  {
    name: 'read_version',
    description: 'Read a specific version of a file from history. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        version: { type: 'number', description: 'Version number (1 = newest)' }
      },
      required: ['version']
    }
  },

  // ── Eval ──
  {
    name: 'eval_obsidian',
    description: 'Execute JavaScript inside the Obsidian app and return the result. Access to full app API. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        code: { type: 'string', description: 'JavaScript code to execute (has access to app, app.vault, app.metadataCache, etc.)' }
      },
      required: ['code']
    }
  },

  // ── Plugins ──
  {
    name: 'list_plugins',
    description: 'List installed Obsidian plugins. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        filter: { type: 'string', enum: ['core', 'community'], description: 'Filter by plugin type' },
        versions: { type: 'boolean', description: 'Include version numbers' }
      }
    }
  },

  // ── Word Count ──
  {
    name: 'word_count',
    description: 'Count words and characters in a file. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' }
      }
    }
  },

  // ── Targeted Editing (safe alternatives to update_file) ──
  {
    name: 'file_append',
    description: 'Append content to end of a file. Safe alternative to update_file. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name (wikilink-style resolution)' },
        path: { type: 'string', description: 'Exact file path' },
        content: { type: 'string', description: 'Content to append' }
      },
      required: ['content']
    }
  },
  {
    name: 'file_prepend',
    description: 'Prepend content to start of a file (after frontmatter). Safe alternative to update_file. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name (wikilink-style resolution)' },
        path: { type: 'string', description: 'Exact file path' },
        content: { type: 'string', description: 'Content to prepend' }
      },
      required: ['content']
    }
  },
  {
    name: 'search_replace_in_file',
    description: 'Replace specific text in a file using Obsidian\'s atomic app.vault.process(). Only changes the matched text — does NOT replace the whole file. Safe, targeted alternative to update_file. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name (wikilink-style resolution)' },
        path: { type: 'string', description: 'Exact file path' },
        search: { type: 'string', description: 'Exact text to find' },
        replace: { type: 'string', description: 'Replacement text' },
        all: { type: 'boolean', description: 'Replace all occurrences (default: first only)' }
      },
      required: ['search', 'replace']
    }
  },
  {
    name: 'property_set',
    description: 'Set a single frontmatter property on a file. Does not touch file content. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        name: { type: 'string', description: 'Property name' },
        value: { type: 'string', description: 'Property value' },
        type: { type: 'string', enum: ['text', 'list', 'number', 'checkbox', 'date', 'datetime'], description: 'Property type (default: text)' }
      },
      required: ['name', 'value']
    }
  },
  {
    name: 'property_remove',
    description: 'Remove a single frontmatter property from a file. Does not touch file content. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        name: { type: 'string', description: 'Property name to remove' }
      },
      required: ['name']
    }
  },

  // ── Search ──
  {
    name: 'vault_search',
    description: 'Search vault for text with context. Uses Obsidian\'s built-in search. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        query: { type: 'string', description: 'Search query' },
        folder: { type: 'string', description: 'Limit to folder path' },
        limit: { type: 'number', description: 'Max files to return' },
        context: { type: 'boolean', description: 'Include matching line context (default: true)' },
        format: { type: 'string', enum: ['text', 'json'], description: 'Output format (default: text)' }
      },
      required: ['query']
    }
  },

  // ── Backlinks ──
  {
    name: 'get_backlinks',
    description: 'List files that link TO this file (backlinks from Obsidian\'s live index). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        counts: { type: 'boolean', description: 'Include link counts' },
        format: { type: 'string', enum: ['json', 'tsv', 'csv'], description: 'Output format (default: tsv)' }
      }
    }
  },
  {
    name: 'get_outlinks',
    description: 'List files that this file links TO (outgoing links). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' }
      }
    }
  },

  // ── Vault Structure ──
  {
    name: 'list_orphans',
    description: 'List files with no incoming links (orphan notes). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam
      }
    }
  },
  {
    name: 'list_deadends',
    description: 'List files with no outgoing links (dead-end notes). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam
      }
    }
  },
  {
    name: 'unresolved_links',
    description: 'List broken/unresolved wikilinks across the vault. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        verbose: { type: 'boolean', description: 'Include source files' },
        format: { type: 'string', enum: ['json', 'tsv', 'csv'], description: 'Output format (default: tsv)' }
      }
    }
  },

  // ── Metadata & Navigation ──
  {
    name: 'list_aliases',
    description: 'List aliases in the vault or for a specific file. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        verbose: { type: 'boolean', description: 'Include file paths' }
      }
    }
  },
  {
    name: 'get_file_info',
    description: 'Get file metadata — name, path, size, created/modified dates. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' }
      }
    }
  },
  {
    name: 'get_folder_info',
    description: 'Get folder metadata — file count, folder count, size. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        path: { type: 'string', description: 'Folder path' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_folders',
    description: 'List folders in the vault, optionally filtered by parent folder. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        folder: { type: 'string', description: 'Filter by parent folder' }
      }
    }
  },
  {
    name: 'list_recents',
    description: 'List recently opened files. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam
      }
    }
  },
  {
    name: 'read_random',
    description: 'Read a random note from the vault. Useful for exploration and serendipitous discovery. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        folder: { type: 'string', description: 'Limit to folder' }
      }
    }
  },

  // ── Bookmarks ──
  {
    name: 'add_bookmark',
    description: 'Add a bookmark to a file, folder, search query, or URL. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File path to bookmark' },
        subpath: { type: 'string', description: 'Subpath (heading or block) within file' },
        folder: { type: 'string', description: 'Folder to bookmark' },
        search: { type: 'string', description: 'Search query to bookmark' },
        url: { type: 'string', description: 'URL to bookmark' },
        title: { type: 'string', description: 'Bookmark title' }
      }
    }
  },
  {
    name: 'list_bookmarks',
    description: 'List all bookmarks. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        verbose: { type: 'boolean', description: 'Include bookmark types' },
        format: { type: 'string', enum: ['json', 'tsv', 'csv'], description: 'Output format (default: tsv)' }
      }
    }
  },

  // ── File Creation & Rename ──
  {
    name: 'create_from_template',
    description: 'Create a new file using an Obsidian template. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        name: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        template: { type: 'string', description: 'Template name to use' },
        content: { type: 'string', description: 'Additional initial content' },
        overwrite: { type: 'boolean', description: 'Overwrite if file exists' }
      },
      required: ['template']
    }
  },
  {
    name: 'rename_file',
    description: 'Rename a file via Obsidian engine (updates internal link cache). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'Current file name' },
        path: { type: 'string', description: 'Current file path' },
        name: { type: 'string', description: 'New file name' }
      },
      required: ['name']
    }
  },
  {
    name: 'move_file',
    description: 'Move a file via Obsidian engine (updates internal link cache). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        to: { type: 'string', description: 'Destination folder or path' }
      },
      required: ['to']
    }
  },

  // ── Version Management ──
  {
    name: 'diff_versions',
    description: 'Diff between two file versions (local or sync). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        from: { type: 'number', description: 'Version number to diff from' },
        to: { type: 'number', description: 'Version number to diff to' },
        filter: { type: 'string', enum: ['local', 'sync'], description: 'Filter by version source' }
      }
    }
  },
  {
    name: 'restore_version',
    description: 'Restore a file to a previous history version. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        version: { type: 'number', description: 'Version number to restore' }
      },
      required: ['version']
    }
  },
  {
    name: 'list_files_with_history',
    description: 'List files that have version history. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam
      }
    }
  },

  // ── Properties ──
  {
    name: 'property_read',
    description: 'Read a single frontmatter property value from a file. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        name: { type: 'string', description: 'Property name' },
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' }
      },
      required: ['name']
    }
  },

  // ── Search ──
  {
    name: 'search_with_context',
    description: 'Search vault with matching line context from Obsidian search engine. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        query: { type: 'string', description: 'Search query' },
        folder: { type: 'string', description: 'Limit to folder' },
        limit: { type: 'number', description: 'Max files' },
        case_sensitive: { type: 'boolean', description: 'Case sensitive search' },
        format: { type: 'string', enum: ['text', 'json'], description: 'Output format (default: text)' }
      },
      required: ['query']
    }
  },

  // ── Plugin Management ──
  {
    name: 'get_plugin_info',
    description: 'Get detailed info about a specific plugin. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        id: { type: 'string', description: 'Plugin ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'list_enabled_plugins',
    description: 'List only enabled plugins. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        filter: { type: 'string', enum: ['core', 'community'], description: 'Filter by plugin type' },
        versions: { type: 'boolean', description: 'Include version numbers' },
        format: { type: 'string', enum: ['json', 'tsv', 'csv'], description: 'Output format (default: tsv)' }
      }
    }
  },
  {
    name: 'enable_plugin',
    description: 'Enable an installed plugin. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        id: { type: 'string', description: 'Plugin ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'disable_plugin',
    description: 'Disable a plugin. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        id: { type: 'string', description: 'Plugin ID' }
      },
      required: ['id']
    }
  },

  // ── Sync (read-only) ──
  {
    name: 'sync_status',
    description: 'Get Obsidian Sync status (paused/active/connected). Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam
      }
    }
  },
  {
    name: 'sync_history',
    description: 'List sync version history for a file. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' }
      }
    }
  },
  {
    name: 'sync_read_version',
    description: 'Read a specific sync version of a file. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'File name' },
        path: { type: 'string', description: 'File path' },
        version: { type: 'number', description: 'Version number' }
      },
      required: ['version']
    }
  },

  // ── CSS Snippets ──
  {
    name: 'list_snippets',
    description: 'List installed CSS snippets. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam
      }
    }
  },
  {
    name: 'list_enabled_snippets',
    description: 'List enabled CSS snippets. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam
      }
    }
  },
  {
    name: 'enable_snippet',
    description: 'Enable a CSS snippet. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        name: { type: 'string', description: 'Snippet name' }
      },
      required: ['name']
    }
  },
  {
    name: 'disable_snippet',
    description: 'Disable a CSS snippet. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        name: { type: 'string', description: 'Snippet name' }
      },
      required: ['name']
    }
  },

  // ── Themes ──
  {
    name: 'list_themes',
    description: 'List installed themes. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        versions: { type: 'boolean', description: 'Include version numbers' }
      }
    }
  },
  {
    name: 'get_active_theme',
    description: 'Get the active theme name and info. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam
      }
    }
  },
  {
    name: 'set_theme',
    description: 'Set the active theme. Pass empty name for default theme. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        name: { type: 'string', description: 'Theme name (empty for default)' }
      },
      required: ['name']
    }
  },

  // ── Bases / Databases ──
  {
    name: 'create_base_item',
    description: 'Create a new item in an Obsidian base/database. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'Base file name' },
        path: { type: 'string', description: 'Base file path' },
        view: { type: 'string', description: 'View name' },
        name: { type: 'string', description: 'New item name' },
        content: { type: 'string', description: 'Initial content' }
      }
    }
  },
  {
    name: 'list_base_views',
    description: 'List views in a base file. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        file: { type: 'string', description: 'Base file name' },
        path: { type: 'string', description: 'Base file path' }
      }
    }
  },

  // ── Vault Info ──
  {
    name: 'get_vault_info',
    description: 'Get vault metadata — name, path, file count, folder count, size. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam
      }
    }
  },
  {
    name: 'list_known_vaults',
    description: 'List all vaults known to Obsidian with their paths. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        verbose: { type: 'boolean', description: 'Include vault paths' }
      }
    }
  },

  // ── Workspace ──
  {
    name: 'get_workspace',
    description: 'Get the workspace tree showing open panes and layout. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        ids: { type: 'boolean', description: 'Include workspace item IDs' }
      }
    }
  },

  // ── Hotkeys ──
  {
    name: 'get_hotkey',
    description: 'Get the hotkey binding for a specific command. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        id: { type: 'string', description: 'Command ID' },
        verbose: { type: 'boolean', description: 'Show if custom or default' }
      },
      required: ['id']
    }
  },
  {
    name: 'list_hotkeys',
    description: 'List all hotkey bindings. Requires Obsidian running.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: vaultParam,
        verbose: { type: 'boolean', description: 'Show if custom or default' },
        all: { type: 'boolean', description: 'Include commands without hotkeys' },
        format: { type: 'string', enum: ['json', 'tsv', 'csv'], description: 'Output format (default: tsv)' }
      }
    }
  }
];

// ─── Tool Handlers ───────────────────────────────────────────────────

export function createCliHandlers(config: Config): Record<string, (args: any) => Promise<ToolResponse>> {
  const ok = (text: string): ToolResponse => ({
    content: [{ type: 'text', text }],
    isError: false
  });

  const err = (text: string): ToolResponse => ({
    content: [{ type: 'text', text }],
    isError: true
  });

  const fileArg = (args: any): string[] => {
    const a: string[] = [];
    if (args.file) a.push(`file=${args.file}`);
    if (args.path) a.push(`path=${args.path}`);
    return a;
  };

  const handlers: Record<string, (args: any) => Promise<ToolResponse>> = {
    // ── Daily Notes ──
    daily_read: async (args) => {
      const result = await execCliForVault(config, args.vault, 'daily:read');
      return ok(result || '(Daily note is empty or does not exist yet)');
    },

    daily_append: async (args) => {
      await execCliForVault(config, args.vault, 'daily:append', [`content=${args.content}`]);
      return ok('Content appended to daily note.');
    },

    daily_prepend: async (args) => {
      await execCliForVault(config, args.vault, 'daily:prepend', [`content=${args.content}`]);
      return ok('Content prepended to daily note.');
    },

    daily_path: async (args) => {
      const result = await execCliForVault(config, args.vault, 'daily:path');
      return ok(result);
    },

    // ── Tasks ──
    list_tasks: async (args) => {
      const cliArgs: string[] = [];
      if (args.file) cliArgs.push(`file=${args.file}`);
      if (args.filter === 'todo') cliArgs.push('todo');
      if (args.filter === 'done') cliArgs.push('done');
      if (args.daily) cliArgs.push('daily');
      if (args.verbose) cliArgs.push('verbose');
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'tasks', cliArgs);
      return ok(result || 'No tasks found.');
    },

    update_task: async (args) => {
      const cliArgs: string[] = [];
      if (args.file) cliArgs.push(`file=${args.file}`);
      cliArgs.push(`line=${args.line}`);
      if (args.daily) cliArgs.push('daily');
      cliArgs.push(args.action); // toggle, done, or todo
      const result = await execCliForVault(config, args.vault, 'task', cliArgs);
      return ok(result || 'Task updated.');
    },

    // ── Tags ──
    list_tags: async (args) => {
      const cliArgs: string[] = ['counts'];
      if (args.sort) cliArgs.push(`sort=${args.sort}`);
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'tags', cliArgs);
      return ok(result || 'No tags found.');
    },

    get_tag_info: async (args) => {
      const tagName = args.name.startsWith('#') ? args.name : `#${args.name}`;
      const result = await execCliForVault(config, args.vault, 'tag', [`name=${tagName}`, 'verbose']);
      return ok(result || 'Tag not found.');
    },

    // ── Properties ──
    list_properties: async (args) => {
      const cliArgs: string[] = ['counts'];
      if (args.sort) cliArgs.push(`sort=${args.sort}`);
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'properties', cliArgs);
      return ok(result || 'No properties found.');
    },

    get_property_values: async (args) => {
      // Use eval to access getFrontmatterPropertyValuesForKey
      const code = `JSON.stringify(app.metadataCache.getFrontmatterPropertyValuesForKey("${args.name.replace(/"/g, '\\"')}"))`;
      const result = await evalInObsidian(config, args.vault, code);
      try {
        const values = JSON.parse(result);
        if (values.length === 0) return ok(`No values found for property "${args.name}".`);
        return ok(`Values for "${args.name}" (${values.length} unique):\n${values.map((v: string) => `  - ${v}`).join('\n')}`);
      } catch {
        return ok(result);
      }
    },

    // ── Outline ──
    get_outline: async (args) => {
      const cliArgs = [...fileArg(args)];
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'outline', cliArgs);
      return ok(result || 'No headings found.');
    },

    // ── Templates ──
    list_templates: async (args) => {
      const result = await execCliForVault(config, args.vault, 'templates');
      return ok(result || 'No templates found.');
    },

    read_template: async (args) => {
      const cliArgs = [`name=${args.name}`];
      if (args.resolve) cliArgs.push('resolve');
      if (args.title) cliArgs.push(`title=${args.title}`);
      const result = await execCliForVault(config, args.vault, 'template:read', cliArgs);
      return ok(result);
    },

    // ── Bases ──
    list_bases: async (args) => {
      const result = await execCliForVault(config, args.vault, 'bases');
      return ok(result || 'No bases found.');
    },

    query_base: async (args) => {
      const cliArgs = [...fileArg(args)];
      if (args.view) cliArgs.push(`view=${args.view}`);
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'base:query', cliArgs, 30000);
      return ok(result || 'No results.');
    },

    // ── Commands ──
    list_commands: async (args) => {
      const cliArgs: string[] = [];
      if (args.filter) cliArgs.push(`filter=${args.filter}`);
      const result = await execCliForVault(config, args.vault, 'commands', cliArgs);
      return ok(result);
    },

    execute_command: async (args) => {
      const result = await execCliForVault(config, args.vault, 'command', [`id=${args.id}`]);
      return ok(result || `Command "${args.id}" executed.`);
    },

    // ── History ──
    list_versions: async (args) => {
      const cliArgs = [...fileArg(args)];
      if (args.filter) cliArgs.push(`filter=${args.filter}`);
      const result = await execCliForVault(config, args.vault, 'diff', cliArgs);
      return ok(result || 'No version history found.');
    },

    read_version: async (args) => {
      const cliArgs = [...fileArg(args), `version=${args.version}`];
      const result = await execCliForVault(config, args.vault, 'history:read', cliArgs);
      return ok(result);
    },

    // ── Eval ──
    eval_obsidian: async (args) => {
      const result = await evalInObsidian(config, args.vault, args.code, 30000);
      return ok(result);
    },

    // ── Plugins ──
    list_plugins: async (args) => {
      const cliArgs: string[] = [];
      if (args.filter) cliArgs.push(`filter=${args.filter}`);
      if (args.versions) cliArgs.push('versions');
      const result = await execCliForVault(config, args.vault, 'plugins', cliArgs);
      return ok(result);
    },

    // ── Word Count ──
    word_count: async (args) => {
      const result = await execCliForVault(config, args.vault, 'wordcount', fileArg(args));
      return ok(result);
    },

    // ── Targeted Editing ──
    file_append: async (args) => {
      await execCliForVault(config, args.vault, 'append', [...fileArg(args), `content=${args.content}`]);
      return ok('Content appended to file.');
    },

    file_prepend: async (args) => {
      await execCliForVault(config, args.vault, 'prepend', [...fileArg(args), `content=${args.content}`]);
      return ok('Content prepended to file.');
    },

    search_replace_in_file: async (args) => {
      // Build the file path reference for eval
      const fileRef = args.path
        ? `app.vault.getAbstractFileByPath("${args.path.replace(/"/g, '\\"')}")`
        : `app.metadataCache.getFirstLinkpathDest("${(args.file || '').replace(/"/g, '\\"')}", "")`;

      // Escape the search/replace strings for JS
      const escSearch = args.search.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const escReplace = args.replace.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

      const replaceMethod = args.all ? 'replaceAll' : 'replace';
      // SAFETY: The process() callback MUST return valid file content.
      // Previously, returning "NO_CHANGE" when the search text wasn't found
      // caused Obsidian to write that literal string as the file content,
      // destroying the file (bug #4).
      //
      // Fix: The callback always returns valid content (either replaced or
      // original). A closure flag tracks whether a change occurred. The
      // async IIFE awaits process() then returns the flag status.
      const code = `(async function(){var f=${fileRef};if(!f)return "ERROR: File not found";var changed=false;await app.vault.process(f,function(c){var n=c.${replaceMethod}("${escSearch}","${escReplace}");if(n!==c){changed=true;return n}return c});return changed?"REPLACED":"NO_MATCH"})()`;

      const result = await evalInObsidian(config, args.vault, code, 15000);
      if (result === 'ERROR: File not found') {
        return err('File not found.');
      }
      if (result === 'NO_MATCH') {
        return err('Search text not found in file. No changes made.');
      }
      return ok('Text replaced successfully.');
    },

    property_set: async (args) => {
      const cliArgs = [...fileArg(args), `name=${args.name}`, `value=${args.value}`];
      if (args.type) cliArgs.push(`type=${args.type}`);
      await execCliForVault(config, args.vault, 'property:set', cliArgs);
      return ok(`Property "${args.name}" set to "${args.value}".`);
    },

    property_remove: async (args) => {
      await execCliForVault(config, args.vault, 'property:remove', [...fileArg(args), `name=${args.name}`]);
      return ok(`Property "${args.name}" removed.`);
    },

    // ── Search ──
    vault_search: async (args) => {
      const cliArgs = [`query=${args.query}`];
      if (args.folder) cliArgs.push(`path=${args.folder}`);
      if (args.limit) cliArgs.push(`limit=${args.limit}`);
      if (args.format) cliArgs.push(`format=${args.format}`);
      const command = args.context !== false ? 'search:context' : 'search';
      const result = await execCliForVault(config, args.vault, command, cliArgs, 30000);
      return ok(result || 'No results found.');
    },

    // ── Backlinks & Links ──
    get_backlinks: async (args) => {
      const cliArgs = [...fileArg(args)];
      if (args.counts) cliArgs.push('counts');
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'backlinks', cliArgs);
      return ok(result || 'No backlinks found.');
    },

    get_outlinks: async (args) => {
      const result = await execCliForVault(config, args.vault, 'links', fileArg(args));
      return ok(result || 'No outgoing links found.');
    },

    // ── Vault Structure ──
    list_orphans: async (args) => {
      const result = await execCliForVault(config, args.vault, 'orphans');
      return ok(result || 'No orphan notes found.');
    },

    list_deadends: async (args) => {
      const result = await execCliForVault(config, args.vault, 'deadends');
      return ok(result || 'No dead-end notes found.');
    },

    unresolved_links: async (args) => {
      const cliArgs: string[] = ['counts'];
      if (args.verbose) cliArgs.push('verbose');
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'unresolved', cliArgs);
      return ok(result || 'No unresolved links found.');
    },

    // ── Metadata & Navigation ──
    list_aliases: async (args) => {
      const cliArgs = [...fileArg(args)];
      if (args.verbose) cliArgs.push('verbose');
      const result = await execCliForVault(config, args.vault, 'aliases', cliArgs);
      return ok(result || 'No aliases found.');
    },

    get_file_info: async (args) => {
      const result = await execCliForVault(config, args.vault, 'file', fileArg(args));
      return ok(result || 'File not found.');
    },

    get_folder_info: async (args) => {
      const result = await execCliForVault(config, args.vault, 'folder', [`path=${args.path}`]);
      return ok(result || 'Folder not found.');
    },

    list_folders: async (args) => {
      const cliArgs: string[] = [];
      if (args.folder) cliArgs.push(`folder=${args.folder}`);
      const result = await execCliForVault(config, args.vault, 'folders', cliArgs);
      return ok(result || 'No folders found.');
    },

    list_recents: async (args) => {
      const result = await execCliForVault(config, args.vault, 'recents');
      return ok(result || 'No recent files.');
    },

    read_random: async (args) => {
      const cliArgs: string[] = [];
      if (args.folder) cliArgs.push(`folder=${args.folder}`);
      const result = await execCliForVault(config, args.vault, 'random:read', cliArgs);
      return ok(result || 'No notes found.');
    },

    // ── Bookmarks ──
    add_bookmark: async (args) => {
      const cliArgs: string[] = [];
      if (args.file) cliArgs.push(`file=${args.file}`);
      if (args.subpath) cliArgs.push(`subpath=${args.subpath}`);
      if (args.folder) cliArgs.push(`folder=${args.folder}`);
      if (args.search) cliArgs.push(`search=${args.search}`);
      if (args.url) cliArgs.push(`url=${args.url}`);
      if (args.title) cliArgs.push(`title=${args.title}`);
      await execCliForVault(config, args.vault, 'bookmark', cliArgs);
      return ok('Bookmark added.');
    },

    list_bookmarks: async (args) => {
      const cliArgs: string[] = [];
      if (args.verbose) cliArgs.push('verbose');
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'bookmarks', cliArgs);
      return ok(result || 'No bookmarks found.');
    },

    // ── File Creation & Rename ──
    create_from_template: async (args) => {
      const cliArgs: string[] = [`template=${args.template}`];
      if (args.name) cliArgs.push(`name=${args.name}`);
      if (args.path) cliArgs.push(`path=${args.path}`);
      if (args.content) cliArgs.push(`content=${args.content}`);
      if (args.overwrite) cliArgs.push('overwrite');
      await execCliForVault(config, args.vault, 'create', cliArgs);
      return ok(`File created from template "${args.template}".`);
    },

    rename_file: async (args) => {
      const cliArgs = [...fileArg(args), `name=${args.name}`];
      await execCliForVault(config, args.vault, 'rename', cliArgs);
      return ok(`File renamed to "${args.name}".`);
    },

    move_file: async (args) => {
      const cliArgs = [...fileArg(args), `to=${args.to}`];
      await execCliForVault(config, args.vault, 'move', cliArgs);
      return ok(`File moved to "${args.to}".`);
    },

    // ── Version Management ──
    diff_versions: async (args) => {
      const cliArgs = [...fileArg(args)];
      if (args.from !== undefined) cliArgs.push(`from=${args.from}`);
      if (args.to !== undefined) cliArgs.push(`to=${args.to}`);
      if (args.filter) cliArgs.push(`filter=${args.filter}`);
      const result = await execCliForVault(config, args.vault, 'diff', cliArgs);
      return ok(result || 'No versions to diff.');
    },

    restore_version: async (args) => {
      const cliArgs = [...fileArg(args), `version=${args.version}`];
      await execCliForVault(config, args.vault, 'history:restore', cliArgs);
      return ok(`Restored to version ${args.version}.`);
    },

    list_files_with_history: async (args) => {
      const result = await execCliForVault(config, args.vault, 'history:list');
      return ok(result || 'No files with history.');
    },

    // ── Properties ──
    property_read: async (args) => {
      const cliArgs = [`name=${args.name}`, ...fileArg(args)];
      const result = await execCliForVault(config, args.vault, 'property:read', cliArgs);
      return ok(result ?? '(property not set)');
    },

    // ── Search ──
    search_with_context: async (args) => {
      const cliArgs = [`query=${args.query}`];
      if (args.folder) cliArgs.push(`path=${args.folder}`);
      if (args.limit) cliArgs.push(`limit=${args.limit}`);
      if (args.case_sensitive) cliArgs.push('case');
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'search:context', cliArgs, 30000);
      return ok(result || 'No results found.');
    },

    // ── Plugin Management ──
    get_plugin_info: async (args) => {
      const result = await execCliForVault(config, args.vault, 'plugin', [`id=${args.id}`]);
      return ok(result || 'Plugin not found.');
    },

    list_enabled_plugins: async (args) => {
      const cliArgs: string[] = [];
      if (args.filter) cliArgs.push(`filter=${args.filter}`);
      if (args.versions) cliArgs.push('versions');
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'plugins:enabled', cliArgs);
      return ok(result || 'No enabled plugins.');
    },

    enable_plugin: async (args) => {
      await execCliForVault(config, args.vault, 'plugin:enable', [`id=${args.id}`]);
      return ok(`Plugin "${args.id}" enabled.`);
    },

    disable_plugin: async (args) => {
      await execCliForVault(config, args.vault, 'plugin:disable', [`id=${args.id}`]);
      return ok(`Plugin "${args.id}" disabled.`);
    },

    // ── Sync (read-only) ──
    sync_status: async (args) => {
      const result = await execCliForVault(config, args.vault, 'sync:status');
      return ok(result || 'Sync status unavailable.');
    },

    sync_history: async (args) => {
      const result = await execCliForVault(config, args.vault, 'sync:history', fileArg(args));
      return ok(result || 'No sync history.');
    },

    sync_read_version: async (args) => {
      const cliArgs = [...fileArg(args), `version=${args.version}`];
      const result = await execCliForVault(config, args.vault, 'sync:read', cliArgs);
      return ok(result || 'Version not found.');
    },

    // ── CSS Snippets ──
    list_snippets: async (args) => {
      const result = await execCliForVault(config, args.vault, 'snippets');
      return ok(result || 'No snippets installed.');
    },

    list_enabled_snippets: async (args) => {
      const result = await execCliForVault(config, args.vault, 'snippets:enabled');
      return ok(result || 'No snippets enabled.');
    },

    enable_snippet: async (args) => {
      await execCliForVault(config, args.vault, 'snippet:enable', [`name=${args.name}`]);
      return ok(`Snippet "${args.name}" enabled.`);
    },

    disable_snippet: async (args) => {
      await execCliForVault(config, args.vault, 'snippet:disable', [`name=${args.name}`]);
      return ok(`Snippet "${args.name}" disabled.`);
    },

    // ── Themes ──
    list_themes: async (args) => {
      const cliArgs: string[] = [];
      if (args.versions) cliArgs.push('versions');
      const result = await execCliForVault(config, args.vault, 'themes', cliArgs);
      return ok(result || 'No themes installed.');
    },

    get_active_theme: async (args) => {
      const result = await execCliForVault(config, args.vault, 'theme');
      return ok(result || 'Default theme.');
    },

    set_theme: async (args) => {
      await execCliForVault(config, args.vault, 'theme:set', [`name=${args.name}`]);
      return ok(`Theme set to "${args.name || 'default'}".`);
    },

    // ── Bases / Databases ──
    create_base_item: async (args) => {
      const cliArgs = [...fileArg(args)];
      if (args.view) cliArgs.push(`view=${args.view}`);
      if (args.name) cliArgs.push(`name=${args.name}`);
      if (args.content) cliArgs.push(`content=${args.content}`);
      await execCliForVault(config, args.vault, 'base:create', cliArgs);
      return ok('Base item created.');
    },

    list_base_views: async (args) => {
      const result = await execCliForVault(config, args.vault, 'base:views', fileArg(args));
      return ok(result || 'No views found.');
    },

    // ── Vault Info ──
    get_vault_info: async (args) => {
      const result = await execCliForVault(config, args.vault, 'vault');
      return ok(result || 'Vault info unavailable.');
    },

    list_known_vaults: async (_args) => {
      const cliArgs = ['vaults', 'verbose'];
      const result = await execCli(cliArgs);
      return ok(result || 'No vaults found.');
    },

    // ── Workspace ──
    get_workspace: async (args) => {
      const cliArgs: string[] = [];
      if (args.ids) cliArgs.push('ids');
      const result = await execCliForVault(config, args.vault, 'workspace', cliArgs);
      return ok(result || 'Workspace empty.');
    },

    // ── Hotkeys ──
    get_hotkey: async (args) => {
      const cliArgs = [`id=${args.id}`];
      if (args.verbose) cliArgs.push('verbose');
      const result = await execCliForVault(config, args.vault, 'hotkey', cliArgs);
      return ok(result || 'No hotkey assigned.');
    },

    list_hotkeys: async (args) => {
      const cliArgs: string[] = [];
      if (args.verbose) cliArgs.push('verbose');
      if (args.all) cliArgs.push('all');
      if (args.format) cliArgs.push(`format=${args.format}`);
      const result = await execCliForVault(config, args.vault, 'hotkeys', cliArgs);
      return ok(result || 'No hotkeys configured.');
    }
  };

  // Wrap all handlers with CLI availability check
  const wrapped: Record<string, (args: any) => Promise<ToolResponse>> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = withCliCheck(handler);
  }
  return wrapped;
}
