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

  function ensureProvider() {
    if (!provider) {
      if (config) provider = createProvider(config);
      if (!provider) throw new Error('LLM provider not configured');
    }
    return provider;
  }

  async function generateDialogue(systemPrompt, contextJSON) {
    return ensureProvider().generateDialogue(systemPrompt, contextJSON);
  }

  async function generateTwoStage(analysisPrompt, characterPrompt, contextJSON) {
    const p = ensureProvider();

    const analysisStart = performance.now();
    const analysisResult = await p.generateDialogue(analysisPrompt, contextJSON);
    const analysisText = typeof analysisResult === 'string' ? analysisResult : analysisResult.text;
    const analysisTime = performance.now() - analysisStart;

    const enrichedContext = {
      ...contextJSON,
      expert_analysis: analysisText,
    };

    const dialogueStart = performance.now();
    const dialogueResult = await p.generateDialogue(characterPrompt, enrichedContext);
    const dialogueTime = performance.now() - dialogueStart;

    const dText = typeof dialogueResult === 'string' ? dialogueResult : dialogueResult.text;
    const aTokens = analysisResult.tokens || {};
    const dTokens = dialogueResult.tokens || {};

    return {
      text: dText,
      analysis: analysisText,
      timeMs: Math.round(analysisTime + dialogueTime),
      tokens: {
        prompt: (aTokens.prompt || 0) + (dTokens.prompt || 0),
        completion: (aTokens.completion || 0) + (dTokens.completion || 0),
        total: (aTokens.total || 0) + (dTokens.total || 0),
      },
    };
  }

  async function testConnection() {
    return ensureProvider().testConnection();
  }

  if (config) provider = createProvider(config);

  return { saveConfig, getConfig, isConfigured, generateDialogue, generateTwoStage, testConnection };
}
