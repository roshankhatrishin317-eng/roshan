import { ChatCompletionRequestSchema } from '../../schemas/openai-schemas.js';
import { CONFIG } from '../../config-manager.js';
import { metrics } from '../../metrics/metrics-core.js';
import { getApiService, getProviderPoolManager } from '../../service-manager.js';
import { handleContentGenerationRequest, ENDPOINT_TYPE } from '../../common.js';

export default async function (fastify, opts) {
  fastify.post('/chat/completions', {
    schema: {
      body: ChatCompletionRequestSchema,
    }
  }, async (request, reply) => {
    // Hijack the response to allow handleContentGenerationRequest to manage the stream directly
    reply.hijack();
    const { model, messages, stream } = request.body;
    request.log.info({ model, stream }, 'Received chat completion request');

    metrics.trackRequestStart();

    try {
        // Use the existing Service Manager to get the correct provider (Pools, OAuth, etc.)
        const apiService = await getApiService(CONFIG, model);
        const providerPoolManager = getProviderPoolManager();
        
        // Delegate to the unified content generation handler
        // This handles:
        // 1. Format conversion (OpenAI -> Gemini/Claude)
        // 2. Stream/Unary dispatch
        // 3. Response conversion
        // 4. Logging
        await handleContentGenerationRequest(
            request.raw,
            reply.raw,
            apiService,
            ENDPOINT_TYPE.OPENAI_CHAT, // We assume this endpoint receives OpenAI format
            CONFIG,
            CONFIG.PROMPT_LOG_FILENAME,
            providerPoolManager,
            CONFIG.uuid,
            request.body // Pass the pre-parsed body
        );

        // Metrics tracking for the legacy path
        // Since handleContentGenerationRequest manages the stream, we can't easily intercept chunks here
        // UNLESS we wrap the response writer.
        // For now, we track the request start/end.
        // Advanced token tracking with legacy handler requires hooking into the stream.
        
        metrics.trackRequestEnd();

    } catch (error) {
        metrics.trackError();
        metrics.trackRequestEnd();
        request.log.error(error);
        
        if (!reply.raw.headersSent) {
            reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
            reply.raw.end(JSON.stringify({
                error: {
                    message: error.message,
                    type: 'internal_error',
                    code: 500
                }
            }));
        }
    }
  });
}
