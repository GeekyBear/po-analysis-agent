'use strict';

/**
 * Factory that returns the configured AI provider based on the AI_PROVIDER env var.
 *
 * Supported values:
 *   mock     – hardcoded realistic responses, no external calls (default)
 *   claude   – Anthropic API via @anthropic-ai/sdk (requires ANTHROPIC_API_KEY)
 *   aicore   – SAP AI Core inference endpoint (requires AICORE_* vars)
 */
function getAIProvider() {
  const provider = (process.env.AI_PROVIDER || 'mock').toLowerCase();

  switch (provider) {
    case 'claude':
      return require('./claude-provider');
    case 'aicore':
      return require('./aicore-provider');
    case 'mock':
      return require('./mock-provider');
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${provider}". Valid values: mock | claude | aicore`
      );
  }
}

module.exports = { getAIProvider };
