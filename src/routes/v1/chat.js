import { ChatCompletionRequestSchema } from '../../schemas/openai-schemas.js';
import { CONFIG } from '../../config-manager.js';
import { metrics } from '../../metrics/metrics-core.js';
import { getApiService, getProviderPoolManager } from '../../service-manager.js';
import { handleContentGenerationRequest, ENDPOINT_TYPE } from '../../common.js';
import { getProviderByModel, resolveModelAlias } from '../../provider-models.js';
import deepmerge from 'deepmerge';

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
        // Deep copy config for this request
        let currentConfig = deepmerge({}, CONFIG);
        
        // Force iFlow provider for specific models (no auto-detect, direct routing)
        if (model) {
            const detectedProvider = getProviderByModel(model);
            if (detectedProvider) {
                // Always switch to the detected provider for these models
                if (detectedProvider !== currentConfig.MODEL_PROVIDER) {
                    request.log.info({ from: currentConfig.MODEL_PROVIDER, to: detectedProvider }, 'MODEL_PROVIDER switched based on model');
                    currentConfig.MODEL_PROVIDER = detectedProvider;
                }
            }
        }
        
        // Get provider pool manager first to check for pools
        const providerPoolManager = getProviderPoolManager();
        
        // Load provider pools into currentConfig if available
        if (providerPoolManager && providerPoolManager.providerPools) {
            currentConfig.providerPools = providerPoolManager.providerPools;
        }
        
        // Use the existing Service Manager to get the correct provider (Pools, OAuth, etc.)
        const apiService = await getApiService(currentConfig, model);
        
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
            currentConfig,
            currentConfig.PROMPT_LOG_FILENAME,
            providerPoolManager,
            currentConfig.uuid,
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
