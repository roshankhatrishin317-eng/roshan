import { handleOllamaRequest, handleOllamaShow } from '../../ollama-handler.js';
import { getApiService, getProviderPoolManager } from '../../service-manager.js';
import { CONFIG } from '../../config-manager.js';

export default async function (fastify, opts) {
  
  // POST /ollama/api/show
  fastify.post('/ollama/api/show', async (request, reply) => {
    reply.hijack();
    
    // Inject raw body mechanism
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
        await handleOllamaShow(request.raw, reply.raw);
    } catch (error) {
        request.log.error(error);
        if (!reply.raw.headersSent) {
            reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
            reply.raw.end(JSON.stringify({ error: error.message }));
        }
    }
  });

  // Catch-all for other Ollama routes
  // The original handleOllamaRequest expects normalized paths,
  // but Fastify routing is different. We should register specific routes 
  // or a wildcard that mimics the logic.
  
  // Common Ollama endpoints:
  // /api/generate
  // /api/chat
  // /api/tags (list models)
  
  // The legacy handler `handleOllamaRequest` normalizes `/ollama/api/...` to `/v1/...`
  // and then calls standard API handlers.
  // We can just call it directly with the hijacked response.

  fastify.all('/ollama/*', async (request, reply) => {
    reply.hijack();
    
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
      const apiService = await getApiService(CONFIG);
      const providerPoolManager = getProviderPoolManager();
      
      // Need to reconstruct the full URL for handleOllamaRequest
      // It uses `new URL(req.url, ...)`
      // Fastify's req.url is the path.
      
      const { handled } = await handleOllamaRequest(
        request.raw.method,
        request.raw.url,
        new URL(request.raw.url, `http://${request.raw.headers.host}`),
        request.raw,
        reply.raw,
        apiService,
        CONFIG,
        providerPoolManager
      );

      if (!handled && !reply.raw.headersSent) {
         reply.raw.writeHead(404, { 'Content-Type': 'application/json' });
         reply.raw.end(JSON.stringify({ error: 'Ollama endpoint not found or not handled' }));
      }

    } catch (error) {
      request.log.error(error);
      if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
          reply.raw.end(JSON.stringify({ error: error.message }));
      }
    }
  });
}
