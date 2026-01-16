/**
 * HTTP Server for mcp-obsidian
 *
 * Provides REST API access to semantic search and vault tools
 * for use by the Obsidian plugin and other local clients.
 *
 * Start with: OBSIDIAN_HTTP_SERVER=true node dist/index.js
 */

import express, { Request, Response } from 'express';
import { Config, getPrimaryVault } from './config.js';
import { allTools, createAllHandlers } from './tools/index.js';

export interface HttpServerOptions {
  port: number;
  config: Config;
}

export function createHttpServer(options: HttpServerOptions) {
  const { port, config } = options;
  const app = express();

  app.use(express.json());

  // CORS for local Obsidian plugin
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Create all handlers
  const allHandlers = createAllHandlers(config);
  const vault = getPrimaryVault(config);

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', vault: vault.name });
  });

  // List all available tools with their schemas
  app.get('/tools', (req: Request, res: Response) => {
    res.json(allTools);
  });

  // Execute any tool by name
  app.post('/call', async (req: Request, res: Response) => {
    try {
      const { tool, args = {} } = req.body;

      if (!tool) {
        return res.status(400).json({ error: 'tool name is required' });
      }

      const handler = allHandlers[tool];
      if (!handler) {
        return res.status(404).json({
          error: `Tool not found: ${tool}`,
          available: allTools.map(t => t.name)
        });
      }

      const result = await handler(args);

      if (result.isError) {
        return res.status(500).json({ error: result.content[0]?.text });
      }

      // Parse the JSON result
      const data = JSON.parse(result.content[0]?.text || '{}');
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Legacy endpoints for backwards compatibility

  // Semantic search (legacy)
  app.post('/search', async (req: Request, res: Response) => {
    try {
      const { query, limit = 10, minSimilarity = 0.5, expand = false } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'query is required' });
      }

      const result = await allHandlers.semantic_search({
        query,
        limit,
        minSimilarity,
        expand
      });

      if (result.isError) {
        return res.status(500).json({ error: result.content[0]?.text });
      }

      const data = JSON.parse(result.content[0]?.text || '{}');
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Read file (legacy)
  app.post('/read', async (req: Request, res: Response) => {
    try {
      const { path: filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: 'path is required' });
      }

      const result = await allHandlers.read_file({ path: filePath });

      if (result.isError) {
        return res.status(500).json({ error: result.content[0]?.text });
      }

      const data = JSON.parse(result.content[0]?.text || '{}');
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Index status (legacy)
  app.get('/index/status', async (req: Request, res: Response) => {
    try {
      const result = await allHandlers.index_status({});
      const data = JSON.parse(result.content[0]?.text || '{}');
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Start server
  const server = app.listen(port, () => {
    console.error(`[mcp-obsidian] HTTP server started on port ${port}`);
  });

  return server;
}
