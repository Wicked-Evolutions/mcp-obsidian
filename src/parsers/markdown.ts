/**
 * Markdown parser for Obsidian files
 * Handles frontmatter extraction and content parsing
 */

import matter from 'gray-matter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ParsedFile } from '../types/index.js';

/**
 * Parse a markdown file, extracting frontmatter and content
 */
export async function parseMarkdownFile(filePath: string, vaultPath: string): Promise<ParsedFile> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(vaultPath, filePath);

  const rawContent = await fs.readFile(absolutePath, 'utf-8');
  const { data: frontmatter, content } = matter(rawContent);

  // Calculate relative path from vault root
  const relativePath = path.relative(vaultPath, absolutePath);

  return {
    path: relativePath,
    absolutePath,
    frontmatter,
    content: content.trim(),
    rawContent
  };
}

/**
 * Extract title from a parsed file
 * Priority: frontmatter.title > first H1 > filename
 */
export function extractTitle(parsed: ParsedFile): string {
  // Check frontmatter
  if (parsed.frontmatter.title && typeof parsed.frontmatter.title === 'string') {
    return parsed.frontmatter.title;
  }

  // Check for first H1
  const h1Match = parsed.content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fall back to filename without extension
  return path.basename(parsed.path, '.md');
}

/**
 * Update frontmatter in a file
 */
export async function updateFrontmatter(
  filePath: string,
  vaultPath: string,
  updates: Record<string, unknown>
): Promise<ParsedFile> {
  const parsed = await parseMarkdownFile(filePath, vaultPath);

  // Merge frontmatter updates
  const newFrontmatter = { ...parsed.frontmatter, ...updates };

  // Reconstruct file content
  const newContent = matter.stringify(parsed.content, newFrontmatter);

  // Write back to file
  await fs.writeFile(parsed.absolutePath, newContent, 'utf-8');

  // Return updated parsed file
  return {
    ...parsed,
    frontmatter: newFrontmatter,
    rawContent: newContent
  };
}

/**
 * Create a new markdown file with frontmatter
 */
export async function createMarkdownFile(
  filePath: string,
  vaultPath: string,
  content: string,
  frontmatter: Record<string, unknown> = {}
): Promise<ParsedFile> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(vaultPath, filePath);

  // Ensure directory exists
  const dir = path.dirname(absolutePath);
  await fs.mkdir(dir, { recursive: true });

  // Create file content with frontmatter
  const fileContent = Object.keys(frontmatter).length > 0
    ? matter.stringify(content, frontmatter)
    : content;

  await fs.writeFile(absolutePath, fileContent, 'utf-8');

  return parseMarkdownFile(absolutePath, vaultPath);
}

/**
 * Check if a file exists in the vault
 */
export async function fileExists(filePath: string, vaultPath: string): Promise<boolean> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(vaultPath, filePath);

  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}
