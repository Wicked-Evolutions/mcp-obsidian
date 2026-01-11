/**
 * Configuration handler for Obsidian MCP
 * Supports single vault and multi-vault modes
 */

import { VaultConfig } from './types/index.js';

export interface Config {
  mode: 'single' | 'multi';
  vaults: VaultConfig[];
  ollama: {
    host: string;
    model: string;
  };
}

export function loadConfig(): Config {
  // Check for multi-vault mode first
  const vaultsJson = process.env.OBSIDIAN_VAULTS;

  if (vaultsJson) {
    try {
      const vaultsObj = JSON.parse(vaultsJson) as Record<string, string>;
      const vaults: VaultConfig[] = Object.entries(vaultsObj).map(([name, path]) => ({
        name,
        path
      }));

      if (vaults.length === 0) {
        throw new Error('OBSIDIAN_VAULTS is empty');
      }

      return {
        mode: 'multi',
        vaults,
        ollama: {
          host: process.env.OLLAMA_HOST || 'http://localhost:11434',
          model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'
        }
      };
    } catch (e) {
      console.error('Failed to parse OBSIDIAN_VAULTS:', e);
      throw new Error('Invalid OBSIDIAN_VAULTS JSON');
    }
  }

  // Single vault mode
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  const vaultName = process.env.OBSIDIAN_VAULT_NAME || 'Vault';

  if (!vaultPath) {
    throw new Error('OBSIDIAN_VAULT_PATH environment variable is required');
  }

  return {
    mode: 'single',
    vaults: [{ name: vaultName, path: vaultPath }],
    ollama: {
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
      model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'
    }
  };
}

// Get the primary vault (first one in multi-vault, only one in single)
export function getPrimaryVault(config: Config): VaultConfig {
  return config.vaults[0];
}

// Find vault by name
export function getVaultByName(config: Config, name: string): VaultConfig | undefined {
  return config.vaults.find(v => v.name.toLowerCase() === name.toLowerCase());
}
