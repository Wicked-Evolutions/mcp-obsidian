/**
 * SQLite vector storage for embeddings
 * Stores embeddings as binary blobs for efficient retrieval
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { cosineSimilarity } from './ollama.js';

export interface StoredEmbedding {
  id: number;
  filePath: string;
  blockId: string | null;
  contentHash: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  updatedAt: number;
}

export interface SearchResult {
  filePath: string;
  blockId: string | null;
  similarity: number;
  metadata: Record<string, unknown>;
}

export class EmbeddingStorage {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initialize();
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        block_id TEXT,
        content_hash TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT,
        updated_at INTEGER NOT NULL,
        UNIQUE(file_path, block_id)
      );

      CREATE INDEX IF NOT EXISTS idx_file_path ON embeddings(file_path);
      CREATE INDEX IF NOT EXISTS idx_content_hash ON embeddings(content_hash);
      CREATE INDEX IF NOT EXISTS idx_updated_at ON embeddings(updated_at);
    `);
  }

  /**
   * Store an embedding
   */
  store(
    filePath: string,
    embedding: number[],
    contentHash: string,
    metadata: Record<string, unknown> = {},
    blockId: string | null = null
  ): void {
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (file_path, block_id, content_hash, embedding, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      filePath,
      blockId,
      contentHash,
      embeddingBlob,
      JSON.stringify(metadata),
      Date.now()
    );
  }

  /**
   * Get embedding for a file
   */
  get(filePath: string, blockId: string | null = null): StoredEmbedding | null {
    const stmt = this.db.prepare(`
      SELECT * FROM embeddings WHERE file_path = ? AND (block_id = ? OR (block_id IS NULL AND ? IS NULL))
    `);

    const row = stmt.get(filePath, blockId, blockId) as {
      id: number;
      file_path: string;
      block_id: string | null;
      content_hash: string;
      embedding: Buffer;
      metadata: string;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      filePath: row.file_path,
      blockId: row.block_id,
      contentHash: row.content_hash,
      embedding: Array.from(new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.length / 4)),
      metadata: JSON.parse(row.metadata || '{}'),
      updatedAt: row.updated_at
    };
  }

  /**
   * Check if embedding exists and is up to date
   */
  isUpToDate(filePath: string, contentHash: string, blockId: string | null = null): boolean {
    const stmt = this.db.prepare(`
      SELECT content_hash FROM embeddings
      WHERE file_path = ? AND (block_id = ? OR (block_id IS NULL AND ? IS NULL))
    `);

    const row = stmt.get(filePath, blockId, blockId) as { content_hash: string } | undefined;
    return row?.content_hash === contentHash;
  }

  /**
   * Delete embeddings for a file
   */
  delete(filePath: string): void {
    const stmt = this.db.prepare('DELETE FROM embeddings WHERE file_path = ?');
    stmt.run(filePath);
  }

  /**
   * Delete all embeddings
   */
  clear(): void {
    this.db.exec('DELETE FROM embeddings');
  }

  /**
   * Get all embeddings (for similarity search)
   * Filters out empty embeddings that would cause dimension mismatch
   */
  getAll(): StoredEmbedding[] {
    // Only get embeddings with actual content (non-empty blobs)
    const stmt = this.db.prepare('SELECT * FROM embeddings WHERE LENGTH(embedding) > 0');
    const rows = stmt.all() as Array<{
      id: number;
      file_path: string;
      block_id: string | null;
      content_hash: string;
      embedding: Buffer;
      metadata: string;
      updated_at: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      blockId: row.block_id,
      contentHash: row.content_hash,
      embedding: Array.from(new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.length / 4)),
      metadata: JSON.parse(row.metadata || '{}'),
      updatedAt: row.updated_at
    }));
  }

  /**
   * Search for similar embeddings
   */
  search(queryEmbedding: number[], limit: number = 10, minSimilarity: number = 0): SearchResult[] {
    const allEmbeddings = this.getAll();

    const results: SearchResult[] = allEmbeddings
      .map(stored => ({
        filePath: stored.filePath,
        blockId: stored.blockId,
        similarity: cosineSimilarity(queryEmbedding, stored.embedding),
        metadata: stored.metadata
      }))
      .filter(r => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  /**
   * Get statistics
   */
  getStats(): { totalEmbeddings: number; uniqueFiles: number; lastUpdated: number | null } {
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM embeddings');
    const filesStmt = this.db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM embeddings');
    const lastUpdatedStmt = this.db.prepare('SELECT MAX(updated_at) as last FROM embeddings');

    const count = (countStmt.get() as { count: number }).count;
    const files = (filesStmt.get() as { count: number }).count;
    const lastUpdated = (lastUpdatedStmt.get() as { last: number | null }).last;

    return {
      totalEmbeddings: count,
      uniqueFiles: files,
      lastUpdated
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
