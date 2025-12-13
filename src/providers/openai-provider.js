import { BaseProvider } from './base-provider.js';

export class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.OPENAI_API_KEY;
    this.baseUrl = config.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  async generate(payload) {
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`
    };

    return this.transport.request(url, {
      method: 'POST',
      headers,
      body: payload
    });
  }

  async *stream(payload) {
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`
    };

    // Ensure stream flag is true and request usage
    const streamPayload = { 
      ...payload, 
      stream: true,
      stream_options: { include_usage: true } // Request usage stats from OpenAI
    };

    const stream = await this.transport.request(url, {
      method: 'POST',
      headers,
      body: streamPayload,
      stream: true
    });

    // Parse SSE stream
    // Undici stream is a ReadableStream or similar.
    // We need to decode chunks and parse 'data: ...' lines.
    
    // Note: Node.js 18+ global fetch returns a web-standard ReadableStream
    // but Undici request returns a Node stream or body mixin.
    // The UnifiedTransport implementation returns response.body (which is a ReadableStream in native fetch)
    
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep partial line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try {
              yield JSON.parse(data);
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
