import { handleUIApiRequests } from '../../ui-manager.js';
import { getProviderPoolManager } from '../../service-manager.js';
import { CONFIG } from '../../config-manager.js';

export default async function (fastify, opts) {
  // Catch-all for UI API
  fastify.all('/api/*', async (request, reply) => {
    // Hijack the response to prevent Fastify from sending its own response
    reply.hijack();
    
    const method = request.raw.method;
    const url = request.raw.url; 
    
    // If the body was parsed by Fastify (e.g. via content-type parser), 
    // we need to make sure the legacy handler can still read it.
    // handleUIApiRequests uses `req.on('data')`.
    
    // If request.body exists, it means Fastify consumed the stream.
    if (request.body) {
       const rawReq = request.raw;
       let bodyContent = request.body;
       
       if (typeof bodyContent === 'object' && !Buffer.isBuffer(bodyContent)) {
           bodyContent = JSON.stringify(bodyContent);
       }
       
       // Override 'on' to replay data for the legacy handler
       // This effectively mocks the stream for `parseRequestBody` in ui-manager.js
       rawReq.on = (event, callback) => {
          if (event === 'data') {
             if (bodyContent) {
                 process.nextTick(() => callback(Buffer.from(bodyContent)));
             }
          }
          if (event === 'end') {
             process.nextTick(() => callback());
          }
          return rawReq;
       };
    }

    const handled = await handleUIApiRequests(
      method,
      url,
      request.raw,
      reply.raw,
      CONFIG,
      getProviderPoolManager()
    );

    if (!handled) {
        // If not handled by UI manager, we should probably return 404
        // But since we hijacked, we must write the response manually via reply.raw
        reply.raw.writeHead(404, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: 'Not Found' }));
    }
  });
}
