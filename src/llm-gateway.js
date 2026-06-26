import { ClaudeProvider } from './providers/claude.js';
import { OpenAICompatProvider } from './providers/openai-compat.js';

const STORAGE_KEY = 'shogibot-llm-config';

export function createLLMGateway() {
  let provider = null;
  let config = loadConfig();

  function loadConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  }

  function saveConfig(cfg) {
    config = cfg;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    provider = createProvider(cfg);
  }

  function createProvider(cfg) {
    if (!cfg) return null;
    switch (cfg.type) {
      case 'claude': return new ClaudeProvider(cfg);
      case 'openai': return new OpenAICompatProvider(cfg);
      default: return null;
    }
  }

  function getConfig() {
    return config;
  }

  function isConfigured() {
    return config && config.apiKey && config.endpoint;
  }

  async function generateDialogue(systemPrompt, contextJSON) {
    if (!provider) {
      if (config) provider = createProvider(config);
      if (!provider) throw new Error('LLM provider not configured');
    }
    return provider.generateDialogue(systemPrompt, contextJSON);
  }

  async function testConnection() {
    if (!provider) {
      if (config) provider = createProvider(config);
      if (!provider) throw new Error('LLM provider not configured');
    }
    return provider.testConnection();
  }

  if (config) provider = createProvider(config);

  return { saveConfig, getConfig, isConfigured, generateDialogue, testConnection };
}
