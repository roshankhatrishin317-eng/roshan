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

    // Handle multipart/form-data for file uploads
    if (request.isMultipart && request.isMultipart()) {
      const rawReq = request.raw;

      try {
        // Parse multipart data using Fastify's multipart plugin
        const data = await request.file();

        if (data) {
          // Convert Fastify multipart format to multer format for legacy handler
          const buffer = await data.toBuffer();
          rawReq.file = {
            fieldname: data.fieldname,
            originalname: data.filename,
            encoding: data.encoding,
            mimetype: data.mimetype,
            buffer: buffer,
            size: buffer.length,
            filename: `upload-${Date.now()}-${data.filename}`,
            path: null  // Will be set by the handler
          };

          // Parse form fields
          rawReq.body = {};
          for (const [key, value] of Object.entries(data.fields || {})) {
            rawReq.body[key] = value.value;
          }
        }
      } catch (err) {
        console.error('[UI Adapter] Multipart parsing error:', err);
      }
    }
    // If the body was parsed by Fastify (e.g. via content-type parser),
    // we need to make sure the legacy handler can still read it.
    // handleUIApiRequests uses `req.on('data')`.
    else if (request.body) {
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
