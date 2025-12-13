import { metrics } from '../../metrics/metrics-core.js';

export default async function (fastify, opts) {
  fastify.get('/events', async (request, reply) => {
    // SSE Headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial stats
    const initialStats = metrics.getStats();
    reply.raw.write(`data: ${JSON.stringify(initialStats)}\n\n`);

    // Listener for updates
    const onTick = (stats) => {
      reply.raw.write(`data: ${JSON.stringify(stats)}\n\n`);
    };

    metrics.on('update', onTick);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      metrics.off('update', onTick);
      reply.raw.end();
    });
    
    // Keep connection open
    return new Promise(() => {}); 
  });
}
