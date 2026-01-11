/**
 * File watcher for automatic index updates
 * Uses native fs.watch for efficient file system monitoring
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { VaultConfig } from '../types/index.js';
import { EmbeddingStorage } from './storage.js';
import { generateEmbedding, checkOllamaAvailability, OllamaConfig } from './ollama.js';

interface WatcherConfig {
  vaults: VaultConfig[];
  ollama: OllamaConfig;
  debounceMs?: number;
}

interface PendingFile {
  vaultPath: string;
  filePath: string;
  timestamp: number;
}

// Storage instances per vault
const storageMap = new Map<string, EmbeddingStorage>();

function getStorage(vaultPath: string): EmbeddingStorage {
  if (!storageMap.has(vaultPath)) {
    const dbPath = path.join(vaultPath, '.mcp-obsidian', 'embeddings.db');
    storageMap.set(vaultPath, new EmbeddingStorage(dbPath));
  }
  return storageMap.get(vaultPath)!;
}

function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

export class VaultWatcher {
  private watchers: fs.FSWatcher[] = [];
  private pendingFiles: Map<string, PendingFile> = new Map();
  private processTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private config: WatcherConfig;
  private debounceMs: number;

  constructor(config: WatcherConfig) {
    this.config = config;
    this.debounceMs = config.debounceMs || 2000; // 2 second debounce
  }

  /**
   * Start watching all configured vaults
   */
  start(): void {
    for (const vault of this.config.vaults) {
      this.watchDirectory(vault.path, vault.path);
    }
    console.error(`[mcp-obsidian] File watcher started for ${this.config.vaults.length} vault(s)`);
  }

  /**
   * Stop all watchers
   */
  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }
    console.error('[mcp-obsidian] File watcher stopped');
  }

  /**
   * Watch a directory recursively
   */
  private watchDirectory(dirPath: string, vaultPath: string): void {
    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Only watch markdown files
        if (!filename.endsWith('.md')) return;

        // Skip hidden files/directories
        if (filename.includes('/.') || filename.startsWith('.')) return;

        const fullPath = path.join(dirPath, filename);
        const relativePath = path.relative(vaultPath, fullPath);

        // Queue the file for processing
        this.queueFile(vaultPath, relativePath);
      });

      this.watchers.push(watcher);

      watcher.on('error', (error) => {
        console.error(`[mcp-obsidian] Watcher error for ${dirPath}:`, error);
      });
    } catch (error) {
      console.error(`[mcp-obsidian] Failed to watch ${dirPath}:`, error);
    }
  }

  /**
   * Queue a file for indexing (with debounce)
   */
  private queueFile(vaultPath: string, filePath: string): void {
    const key = `${vaultPath}:${filePath}`;

    this.pendingFiles.set(key, {
      vaultPath,
      filePath,
      timestamp: Date.now()
    });

    // Reset the process timer
    if (this.processTimer) {
      clearTimeout(this.processTimer);
    }

    this.processTimer = setTimeout(() => {
      this.processPendingFiles();
    }, this.debounceMs);
  }

  /**
   * Process all pending files
   */
  private async processPendingFiles(): Promise<void> {
    if (this.isProcessing || this.pendingFiles.size === 0) return;

    this.isProcessing = true;

    // Check Ollama availability
    const ollama = await checkOllamaAvailability(this.config.ollama);
    if (!ollama.available || !ollama.hasModel) {
      console.error('[mcp-obsidian] Auto-index skipped: Ollama not available');
      this.pendingFiles.clear();
      this.isProcessing = false;
      return;
    }

    // Copy and clear pending files
    const files = Array.from(this.pendingFiles.values());
    this.pendingFiles.clear();

    let indexed = 0;
    let deleted = 0;
    let skipped = 0;

    for (const file of files) {
      try {
        const absolutePath = path.join(file.vaultPath, file.filePath);

        // Check if file exists
        if (!fs.existsSync(absolutePath)) {
          // File was deleted - remove from index
          const storage = getStorage(file.vaultPath);
          storage.delete(file.filePath);
          deleted++;
          continue;
        }

        // Read file content
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const contentHash = hashContent(content);

        // Check if already up to date
        const storage = getStorage(file.vaultPath);
        if (storage.isUpToDate(file.filePath, contentHash)) {
          skipped++;
          continue;
        }

        // Generate embedding
        const result = await generateEmbedding(content, this.config.ollama);

        // Store embedding
        storage.store(file.filePath, result.embedding, contentHash, {
          indexedAt: new Date().toISOString(),
          autoIndexed: true
        });

        indexed++;
      } catch (error) {
        console.error(`[mcp-obsidian] Auto-index error for ${file.filePath}:`, error);
      }
    }

    if (indexed > 0 || deleted > 0) {
      console.error(`[mcp-obsidian] Auto-indexed: ${indexed} new/updated, ${deleted} deleted, ${skipped} unchanged`);
    }

    this.isProcessing = false;
  }
}

/**
 * Create and start a vault watcher
 */
export function createVaultWatcher(config: WatcherConfig): VaultWatcher {
  const watcher = new VaultWatcher(config);
  watcher.start();
  return watcher;
}
