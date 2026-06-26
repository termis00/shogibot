export class ClaudeProvider {
  constructor(config) {
    this.endpoint = config.endpoint || 'https://api.anthropic.com';
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-sonnet-4-20250514';
  }

  async generateDialogue(systemPrompt, contextJSON) {
    const base = this.endpoint.replace(/\/+$/, '').replace(/\/v1\/messages$/, '');
    const url = `${base}/v1/messages`;

    const payload = {
      model: this.model,
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `以下の局面情報に基づいて、キャラクターとして一言応答してください。\n\n${JSON.stringify(contextJSON, null, 2)}`,
        },
      ],
    };

    const headers = {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    const startTime = performance.now();

    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, headers, payload }),
    });

    const elapsed = performance.now() - startTime;

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const usage = data.usage || {};
    return {
      text: data.content?.[0]?.text || '',
      timeMs: Math.round(elapsed),
      tokens: {
        prompt: usage.input_tokens || null,
        completion: usage.output_tokens || null,
        total: (usage.input_tokens || 0) + (usage.output_tokens || 0) || null,
      },
    };
  }

  async testConnection() {
    try {
      await this.generateDialogue(
        'テスト用です。「接続成功」とだけ答えてください。',
        { test: true }
      );
      return true;
    } catch {
      return false;
    }
  }
}
