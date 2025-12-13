import { getApiService, getProviderPoolManager } from '../../service-manager.js';
import { handleContentGenerationRequest, ENDPOINT_TYPE } from '../../common.js';
import { CONFIG } from '../../config-manager.js';
import { metrics } from '../../metrics/metrics-core.js';

async function handleChatRequest(request, reply, endpointType) {
    reply.hijack();
    const { model, stream } = request.body;
    request.log.info({ model, stream, endpoint: endpointType }, 'Received chat completion request');

    metrics.trackRequestStart();

    // Inject raw request body back if Fastify parsed it
    if (request.body) {
       const rawReq = request.raw;
       let bodyContent = request.body;
       if (typeof bodyContent === 'object' && !Buffer.isBuffer(bodyContent)) {
           bodyContent = JSON.stringify(bodyContent);
       }
       rawReq.on = (event, callback) => {
          if (event === 'data') {
             if (bodyContent) process.nextTick(() => callback(Buffer.from(bodyContent)));
          }
          if (event === 'end') process.nextTick(() => callback());
          return rawReq;
       };
    }

    try {
        const apiService = await getApiService(CONFIG, model);
        const providerPoolManager = getProviderPoolManager();
        
        await handleContentGenerationRequest(
            request.raw,
            reply.raw,
            apiService,
            endpointType,
            CONFIG,
            CONFIG.PROMPT_LOG_FILENAME,
            providerPoolManager,
            CONFIG.uuid
        );

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
}

export default async function (fastify, opts) {
  // Claude Messages API
  fastify.post('/v1/messages', async (request, reply) => {
    await handleChatRequest(request, reply, ENDPOINT_TYPE.CLAUDE_MESSAGE);
  });

  // OpenAI Responses API
  fastify.post('/v1/responses', async (request, reply) => {
    await handleChatRequest(request, reply, ENDPOINT_TYPE.OPENAI_RESPONSES);
  });

  // Gemini Content Generation
  // Combined route to handle both generateContent and streamGenerateContent
  // to avoid Fastify route duplication errors with regex parameters
  fastify.post('/v1beta/models/:model([^:]+)::method', async (request, reply) => {
    const { model, method } = request.params;
    
    // Validate method suffix
    if (method !== 'generateContent' && method !== 'streamGenerateContent') {
        reply.callNotFound();
        return;
    }

    if (request.body && !request.body.model) {
        request.body.model = model;
    }
    await handleChatRequest(request, reply, ENDPOINT_TYPE.GEMINI_CONTENT);
  });
}
