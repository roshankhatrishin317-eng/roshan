import { getApiService, getProviderPoolManager } from '../../service-manager.js';
import { handleModelListRequest, ENDPOINT_TYPE } from '../../common.js';
import { CONFIG } from '../../config-manager.js';

export default async function (fastify, opts) {
  // GET /v1/models (OpenAI style)
  fastify.get('/v1/models', async (request, reply) => {
    // Hijack response for consistency with common handler
    reply.hijack();
    try {
      const apiService = await getApiService(CONFIG);
      const providerPoolManager = getProviderPoolManager();
      
      await handleModelListRequest(
        request.raw,
        reply.raw,
        apiService,
        ENDPOINT_TYPE.OPENAI_MODEL_LIST,
        CONFIG,
        providerPoolManager,
        CONFIG.uuid
      );
    } catch (error) {
      request.log.error(error);
      reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
      reply.raw.end(JSON.stringify({ error: error.message }));
    }
  });

  // GET /v1beta/models (Gemini style)
  fastify.get('/v1beta/models', async (request, reply) => {
    reply.hijack();
    try {
      const apiService = await getApiService(CONFIG);
      const providerPoolManager = getProviderPoolManager();
      
      await handleModelListRequest(
        request.raw,
        reply.raw,
        apiService,
        ENDPOINT_TYPE.GEMINI_MODEL_LIST,
        CONFIG,
        providerPoolManager,
        CONFIG.uuid
      );
    } catch (error) {
      request.log.error(error);
      reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
      reply.raw.end(JSON.stringify({ error: error.message }));
    }
  });
}
