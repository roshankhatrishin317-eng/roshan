import { UnifiedTransport } from '../transport/unified-transport.js';

// High-performance OpenAI API service using undici connection pooling
export class OpenAIApiService {
    constructor(config) {
        if (!config.OPENAI_API_KEY) {
            throw new Error("OpenAI API Key is required for OpenAIApiService.");
        }
        this.config = config;
        this.apiKey = config.OPENAI_API_KEY;
        this.baseUrl = config.OPENAI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com/v1';
        
        // Initialize unified transport with connection pooling
        this.transport = new UnifiedTransport({
            maxRetries: config.REQUEST_MAX_RETRIES || 3,
            baseDelay: config.REQUEST_BASE_DELAY || 1000,
        });
        
        console.log(`[OpenAI] Initialized with connection pooling - Base URL: ${this.baseUrl}`);
    }

    _getHeaders() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
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
            console.error(`[OpenAI] API error (${endpoint}):`, error.status || error.code, error.message);
            throw error;
        }
    }

    async *streamApi(endpoint, body) {
        const url = `${this.baseUrl}${endpoint}`;
        const streamRequestBody = { ...body, stream: true };
        
        try {
            const stream = this.transport.streamRequest(url, {
                method: 'POST',
                headers: this._getHeaders(),
                body: streamRequestBody,
            });
            
            for await (const chunk of stream) {
                if (chunk.raw) {
                    console.warn("[OpenAI] Non-JSON stream data:", chunk.raw);
                    continue;
                }
                yield chunk;
            }
        } catch (error) {
            console.error(`[OpenAI] Stream error (${endpoint}):`, error.status || error.code, error.message);
            throw error;
        }
    }

    async generateContent(model, requestBody) {
        return this.callApi('/chat/completions', requestBody);
    }

    async *generateContentStream(model, requestBody) {
        yield* this.streamApi('/chat/completions', requestBody);
    }

    async listModels() {
        const url = `${this.baseUrl}/models`;
        try {
            return await this.transport.request(url, {
                method: 'GET',
                headers: this._getHeaders(),
            });
        } catch (error) {
            console.error(`[OpenAI] Error listing models:`, error.status || error.code, error.message);
            throw error;
        }
    }
}
