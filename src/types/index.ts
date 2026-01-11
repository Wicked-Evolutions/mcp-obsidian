/**
 * Obsidian MCP Type Definitions
 */

// Vault configuration
export interface VaultConfig {
  name: string;
  path: string;
}

// Parsed markdown file
export interface ParsedFile {
  path: string;           // Relative path from vault root
  absolutePath: string;   // Full filesystem path
  frontmatter: Record<string, unknown>;
  content: string;        // Content without frontmatter
  rawContent: string;     // Full file content
}

// Wikilink structure
export interface WikiLink {
  raw: string;            // [[folder/note|alias]]
  target: string;         // folder/note
  alias?: string;         // alias (if provided)
  resolved?: string;      // Resolved absolute path
  exists: boolean;        // Whether target file exists
}

// Backlink entry
export interface BacklinkEntry {
  sourcePath: string;     // File containing the link
  sourceTitle: string;    // Title of source file
  context: string;        // Surrounding text context
  lineNumber: number;     // Line where link appears
}

// File listing entry
export interface FileEntry {
  name: string;
  path: string;           // Relative path
  isDirectory: boolean;
  modified: Date;
  size: number;
}

// Search result
export interface SearchResult {
  path: string;
  matches: SearchMatch[];
  score?: number;         // For semantic search
}

export interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

// Semantic search result
export interface SemanticResult {
  path: string;
  content: string;
  similarity: number;
  vault?: string;         // For cross-vault search
}

// Graph node/edge for ecosystem view
export interface GraphNode {
  id: string;
  path: string;
  title: string;
  vault?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'wikilink' | 'backlink';
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Tool response wrapper
export interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}
