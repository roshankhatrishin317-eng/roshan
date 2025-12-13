import { metrics } from '../../metrics/metrics-core.js';

export default async function (fastify, opts) {
  fastify.get('/stats', async (request, reply) => {
    return metrics.getStats();
  });
}
