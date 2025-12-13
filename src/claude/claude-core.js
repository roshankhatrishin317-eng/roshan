import { UnifiedTransport } from '../transport/unified-transport.js';
import { fetch, Agent } from 'undici';

/**
 * High-performance Claude API Service using undici connection pooling
 */
export class ClaudeApiService {
    constructor(config) {
        if (!config.CLAUDE_API_KEY) {
            throw new Error("Claude API Key is required for ClaudeApiService.");
        }
        this.config = config;
        this.apiKey = config.CLAUDE_API_KEY;
        this.baseUrl = config.CLAUDE_BASE_URL?.replace(/\/$/, '') || 'https://api.anthropic.com/v1';
        
        // Initialize unified transport with connection pooling
        this.transport = new UnifiedTransport({
            maxRetries: config.REQUEST_MAX_RETRIES || 3,
            baseDelay: config.REQUEST_BASE_DELAY || 1000,
        });
        
        console.log(`[Claude] Initialized with connection pooling - Base URL: ${this.baseUrl}`);
    }

    _getHeaders() {
        return {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
        };
    }

    async callApi(endpoint, body) {
        const url = `${this.baseUrl}${endpoint}`;
        try {
            return await this.transport.request(url, {
                method: 'POST',
                headers: this._getHeaders(),
                body,
            });
        } catch (error) {
            console.error(`[Claude] API error (${endpoint}):`, error.status || error.code, error.message);
            throw error;
        }
    }

    async *streamApi(endpoint, body) {
        const url = `${this.baseUrl}${endpoint}`;
        const streamRequestBody = { ...body, stream: true };
        
        try {
            // Claude uses a different SSE format, parse it specially
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...this._getHeaders(),
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify(streamRequestBody),
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                const error = new Error(`HTTP ${response.status}: ${errorText.substring(0, 500)}`);
                error.status = response.status;
                throw error;
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    let boundary;
                    
                    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                        const eventBlock = buffer.substring(0, boundary);
                        buffer = buffer.substring(boundary + 2);

                        const lines = eventBlock.split('\n');
                        let data = '';
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                data = line.substring(6).trim();
                            }
                        }

                        if (data) {
                            try {
                                const parsedChunk = JSON.parse(data);
                                yield parsedChunk;
                                if (parsedChunk.type === 'message_stop') {
                                    return;
                                }
                            } catch (e) {
                                console.warn("[Claude] Failed to parse stream chunk:", data.substring(0, 100));
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            console.error(`[Claude] Stream error (${endpoint}):`, error.status || error.code, error.message);
            throw error;
        }
    }

    /**
     * Generates content (non-streaming).
     * @param {string} model - Model name.
     * @param {object} requestBody - Request body (Claude format).
     * @returns {Promise<object>} Claude API response (Claude compatible format).
     */
    async generateContent(model, requestBody) {
        const response = await this.callApi('/messages', requestBody);
        return response;
    }

    /**
     * Streams content generation.
     * @param {string} model - Model name.
     * @param {object} requestBody - Request body (Claude format).
     * @returns {AsyncIterable<object>} Claude API response stream (Claude compatible format).
     */
    async *generateContentStream(model, requestBody) {
        const stream = this.streamApi('/messages', requestBody);
        for await (const chunk of stream) {
            yield chunk;
        }
    }

    /**
     * Lists available models.
     * The Claude API does not have a direct '/models' endpoint; typically, supported models need to be hardcoded.
     * @returns {Promise<object>} List of models.
     */
    async listModels() {
        console.log('[ClaudeApiService] Listing available models.');
        // Claude API 没有直接的 /models 端点来列出所有模型。
        // 通常，你需要根据 Anthropic 的文档硬编码你希望支持的模型。
        // 这里我们返回一些常见的 Claude 模型作为示例。
        const models = [
            { id: "claude-4-sonnet", name: "claude-4-sonnet" },
            { id: "claude-sonnet-4-20250514", name: "claude-sonnet-4-20250514" },
            { id: "claude-opus-4-20250514", name: "claude-opus-4-20250514" },
            { id: "claude-3-7-sonnet-20250219", name: "claude-3-7-sonnet-20250219" },
            { id: "claude-3-5-sonnet-20241022", name: "claude-3-5-sonnet-20241022" },
            { id: "claude-3-5-haiku-20241022", name: "claude-3-5-haiku-20241022" },
            { id: "claude-3-opus-20240229", name: "claude-3-opus-20240229" },
            { id: "claude-3-haiku-20240307", name: "claude-3-haiku-20240307" },
        ];

        return { models: models.map(m => ({ name: m.name })) };
    }
}
