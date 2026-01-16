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

/**
 * Section boundaries in a markdown file
 */
export interface SectionBoundary {
  headingStart: number;  // Start of heading line
  headingEnd: number;    // End of heading line (after newline)
  contentStart: number;  // Start of section content
  contentEnd: number;    // End of section content (before next heading or EOF)
  level: number;         // Heading level (1-6)
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find section boundaries by heading text
 * Returns null if heading not found
 */
export function findSectionByHeading(content: string, heading: string): SectionBoundary | null {
  // Normalize heading - user might pass "Progress Log" or "## Progress Log"
  const headingMatch = heading.match(/^(#{1,6})\s+(.+)$/);
  let targetLevel: number | null = null;
  let headingText: string;

  if (headingMatch) {
    targetLevel = headingMatch[1].length;
    headingText = headingMatch[2].trim();
  } else {
    headingText = heading.trim();
  }

  // Build regex to find the heading
  // If level specified, match exactly that level; otherwise match any level
  const levelPattern = targetLevel ? `#{${targetLevel}}` : '#{1,6}';
  const headingRegex = new RegExp(`^(${levelPattern})\\s+${escapeRegex(headingText)}\\s*$`, 'mi');

  const match = headingRegex.exec(content);
  if (!match || match.index === undefined) {
    return null;
  }

  const headingStart = match.index;
  const level = match[1].length;

  // Find end of heading line
  const lineEnd = content.indexOf('\n', headingStart);
  const headingEnd = lineEnd === -1 ? content.length : lineEnd + 1;
  const contentStart = headingEnd;

  // Find next heading of same or higher level (lower number = higher level)
  // E.g., if we're in ## Section, stop at # or ##, but not ###
  const nextHeadingRegex = new RegExp(`^#{1,${level}}\\s+`, 'm');
  const restOfContent = content.slice(contentStart);
  const nextMatch = nextHeadingRegex.exec(restOfContent);

  const contentEnd = nextMatch?.index !== undefined
    ? contentStart + nextMatch.index
    : content.length;

  return {
    headingStart,
    headingEnd,
    contentStart,
    contentEnd,
    level
  };
}

/**
 * Append content to a section (before the next heading)
 */
export async function appendToSection(
  filePath: string,
  vaultPath: string,
  heading: string,
  newContent: string
): Promise<{ success: boolean; error?: string }> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(vaultPath, filePath);

  const rawContent = await fs.readFile(absolutePath, 'utf-8');
  const section = findSectionByHeading(rawContent, heading);

  if (!section) {
    return { success: false, error: `Section "${heading}" not found` };
  }

  // Ensure proper spacing
  const existingContent = rawContent.slice(section.contentStart, section.contentEnd);
  const needsLeadingNewline = existingContent.length > 0 && !existingContent.endsWith('\n\n');
  const needsTrailingNewline = section.contentEnd < rawContent.length;

  const insertion = (needsLeadingNewline ? '\n' : '') +
                    newContent +
                    (needsTrailingNewline ? '\n\n' : '\n');

  // Insert at end of section
  const updatedContent =
    rawContent.slice(0, section.contentEnd).trimEnd() + '\n\n' +
    newContent.trim() + '\n' +
    (section.contentEnd < rawContent.length ? '\n' + rawContent.slice(section.contentEnd) : '');

  await fs.writeFile(absolutePath, updatedContent, 'utf-8');

  return { success: true };
}

/**
 * Prepend content to a section (right after the heading)
 */
export async function prependToSection(
  filePath: string,
  vaultPath: string,
  heading: string,
  newContent: string
): Promise<{ success: boolean; error?: string }> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(vaultPath, filePath);

  const rawContent = await fs.readFile(absolutePath, 'utf-8');
  const section = findSectionByHeading(rawContent, heading);

  if (!section) {
    return { success: false, error: `Section "${heading}" not found` };
  }

  // Insert right after heading with proper spacing
  const updatedContent =
    rawContent.slice(0, section.headingEnd) +
    '\n' + newContent.trim() + '\n' +
    rawContent.slice(section.contentStart);

  await fs.writeFile(absolutePath, updatedContent, 'utf-8');

  return { success: true };
}

/**
 * Replace entire section content (between heading and next heading)
 */
export async function replaceSection(
  filePath: string,
  vaultPath: string,
  heading: string,
  newContent: string
): Promise<{ success: boolean; error?: string }> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(vaultPath, filePath);

  const rawContent = await fs.readFile(absolutePath, 'utf-8');
  const section = findSectionByHeading(rawContent, heading);

  if (!section) {
    return { success: false, error: `Section "${heading}" not found` };
  }

  // Replace section content
  const updatedContent =
    rawContent.slice(0, section.headingEnd) +
    '\n' + newContent.trim() + '\n\n' +
    rawContent.slice(section.contentEnd);

  await fs.writeFile(absolutePath, updatedContent, 'utf-8');

  return { success: true };
}

/**
 * Section extracted from markdown for chunking
 */
export interface ExtractedSection {
  heading: string;      // Full heading text with # prefix
  level: number;        // 1-6 for h1-h6
  content: string;      // Section content without heading
  blockId: string;      // Slugified heading for unique ID
  startLine: number;    // Line number where section starts
}

/**
 * Convert heading text to a URL-safe block ID
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')       // Spaces to hyphens
    .replace(/-+/g, '-')        // Collapse multiple hyphens
    .trim();
}

/**
 * Extract all sections from markdown content for chunking
 * Each section includes its heading and content until the next heading of same or higher level
 */
export function extractSections(content: string): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  const lines = content.split('\n');

  // Regex to match markdown headings
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  let currentSection: {
    heading: string;
    level: number;
    blockId: string;
    startLine: number;
    contentLines: string[];
  } | null = null;

  // Track leading content before first heading (preamble)
  const preambleLines: string[] = [];
  let foundFirstHeading = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(headingRegex);

    if (match) {
      foundFirstHeading = true;
      const level = match[1].length;
      const headingText = match[2].trim();

      // Save previous section if exists
      if (currentSection) {
        sections.push({
          heading: currentSection.heading,
          level: currentSection.level,
          content: currentSection.contentLines.join('\n').trim(),
          blockId: currentSection.blockId,
          startLine: currentSection.startLine
        });
      }

      // Start new section
      currentSection = {
        heading: line,
        level,
        blockId: slugify(headingText),
        startLine: i + 1,  // 1-indexed
        contentLines: []
      };
    } else if (currentSection) {
      currentSection.contentLines.push(line);
    } else if (!foundFirstHeading) {
      preambleLines.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection) {
    sections.push({
      heading: currentSection.heading,
      level: currentSection.level,
      content: currentSection.contentLines.join('\n').trim(),
      blockId: currentSection.blockId,
      startLine: currentSection.startLine
    });
  }

  // Add preamble as special section if it has meaningful content
  const preambleContent = preambleLines.join('\n').trim();
  if (preambleContent.length > 50) {  // Only if substantial
    sections.unshift({
      heading: '',
      level: 0,
      content: preambleContent,
      blockId: '_preamble',
      startLine: 1
    });
  }

  return sections;
}
