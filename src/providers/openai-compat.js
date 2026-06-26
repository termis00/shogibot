export class OpenAICompatProvider {
  constructor(config) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4o-mini';
  }

  async generateDialogue(systemPrompt, contextJSON) {
    const base = this.endpoint.replace(/\/+$/, '').replace(/\/v1\/chat\/completions$/, '').replace(/\/v1$/, '');
    const url = `${base}/v1/chat/completions`;

    const payload = {
      model: this.model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `以下の局面情報に基づいて、キャラクターとして一言応答してください。\n\n${JSON.stringify(contextJSON, null, 2)}`,
        },
      ],
    };

    const headers = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const startTime = performance.now();

    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, headers, payload }),
    });

    const elapsed = performance.now() - startTime;

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const usage = data.usage || {};
    return {
      text: data.choices?.[0]?.message?.content || '',
      timeMs: Math.round(elapsed),
      tokens: {
        prompt: usage.prompt_tokens || null,
        completion: usage.completion_tokens || null,
        total: usage.total_tokens || null,
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
