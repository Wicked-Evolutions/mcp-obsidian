/**
 * Tool aggregator for Obsidian MCP
 * Combines all tool definitions and handlers
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Config } from '../config.js';
import { ToolResponse } from '../types/index.js';

// Import tool definitions and handler creators
import { fileTools, createFileHandlers } from './files.js';
import { wikilinkTools, createWikilinkHandlers } from './wikilinks.js';
import { semanticTools, createSemanticHandlers } from './semantic.js';
import { crossVaultTools, createCrossVaultHandlers } from './crossvault.js';
import { sectionTools, createSectionHandlers } from './sections.js';
import { queryTools, createQueryHandlers } from './query.js';
import { analyticsTools, createAnalyticsHandlers } from './analytics.js';
import { cliTools, createCliHandlers } from './cli-tools.js';

/**
 * All tool definitions
 */
export const allTools: Tool[] = [
  ...fileTools,
  ...wikilinkTools,
  ...semanticTools,
  ...crossVaultTools,
  ...sectionTools,
  ...queryTools,
  ...analyticsTools,
  ...cliTools
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (args: any) => Promise<ToolResponse>;

/**
 * Create all tool handlers for a given config
 */
export function createAllHandlers(config: Config): Record<string, AnyHandler> {
  return {
    ...createFileHandlers(config),
    ...createWikilinkHandlers(config),
    ...createSemanticHandlers(config),
    ...createCrossVaultHandlers(config),
    ...createSectionHandlers(config),
    ...createQueryHandlers(config),
    ...createAnalyticsHandlers(config),
    ...createCliHandlers(config)
  } as Record<string, AnyHandler>;
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): Tool | undefined {
  return allTools.find(t => t.name === name);
}
