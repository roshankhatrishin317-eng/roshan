import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import pino from 'pino';
import { CONFIG, initializeConfig } from './config-manager.js';
import { prewarmConnections, getPoolStats } from './transport/unified-transport.js';

// Import Middleware
import { requestCache } from './middleware/request-cache.js';
import { circuitBreaker } from './middleware/circuit-breaker.js';
import { requestQueue } from './middleware/request-queue.js';
import { advancedMetrics } from './metrics/advanced-metrics.js';
import { gracefulShutdown } from './middleware/graceful-shutdown.js';
import { requestTracingPlugin } from './middleware/request-tracing.js';
import { compressionPlugin } from './middleware/compression.js';
import { autoFailover } from './middleware/auto-failover.js';
import { requestDedup } from './middleware/request-dedup.js';
import { speculativeExecutor } from './middleware/speculative-execution.js';
import { loadBalancer } from './middleware/adaptive-load-balancer.js';
import { semanticCache } from './middleware/semantic-cache.js';
import { tokenEstimator } from './middleware/token-estimator.js';
import { smartFallback } from './middleware/smart-fallback.js';
import { requestBatcher } from './middleware/request-batching.js';
import { qualityScorer } from './middleware/quality-scoring.js';
import { contentFilter } from './middleware/content-filter.js';
import { promptOptimizer } from './middleware/prompt-optimizer.js';
import { abTesting } from './middleware/ab-testing.js';
import { anomalyDetector } from './middleware/anomaly-detection.js';
import { requestReplay } from './middleware/request-replay.js';
import { debugMode } from './middleware/debug-mode.js';
import { webhookManager } from './middleware/webhooks.js';
import { auditLogger } from './middleware/audit-log.js';
import { multiTenant } from './middleware/multi-tenant.js';
import { apiKeyManager } from './middleware/api-key-manager.js';
import { clientRateLimiter } from './middleware/client-rate-limiter.js';
import { ipFilter } from './middleware/ip-filter.js';
import { requestSigning } from './middleware/request-signing.js';
import { promptTemplates } from './middleware/prompt-templates.js';
import { modelOrchestrator } from './middleware/model-orchestration.js';
import { conversationMemory } from './middleware/conversation-memory.js';
import { functionRouter } from './middleware/function-router.js';
import { streamingOptimizer } from './middleware/streaming-optimizer.js';
import { canaryDeployment } from './middleware/canary-deployment.js';
import { trafficShadow } from './middleware/traffic-shadow.js';
import { geographicRouter } from './middleware/geographic-routing.js';
import { customAlerts } from './middleware/custom-alerts.js';
import { slaMonitor } from './middleware/sla-monitor.js';
import { usageAnalytics } from './middleware/usage-analytics.js';

// Import Routes
import chatRoutes from './routes/v1/chat.js';
import monitorRoutes from './routes/v1/monitor.js';
import monitorSseRoutes from './routes/v1/monitor-sse.js';
import uiAdapterRoutes from './routes/v1/ui-adapter.js';
import modelsRoutes from './routes/v1/models.js';
import altChatRoutes from './routes/v1/alt-chat.js';
import ollamaRoutes from './routes/v1/ollama.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  await initializeConfig();

  const isProduction = process.env.NODE_ENV === 'production';
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: isProduction ? undefined : {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
    disableRequestLogging: false,
    trustProxy: true,
    connectionTimeout: 0,
    keepAliveTimeout: 120000,
    maxRequestsPerSocket: 0,
    bodyLimit: 10 * 1024 * 1024,
    caseSensitive: false,
  });

  // Add Zod Validation Support
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Register middleware plugins
  await server.register(requestTracingPlugin);
  await server.register(compressionPlugin, { threshold: 1024, level: 6 });

  // Serve Static Files (UI)
  server.register(fastifyStatic, {
    root: path.join(__dirname, '../static'),
    prefix: '/',
  });

  // Register Routes
  server.register(chatRoutes, { prefix: '/v1' });
  server.register(monitorRoutes, { prefix: '/monitor' });
  server.register(monitorSseRoutes, { prefix: '/monitor' });
  server.register(modelsRoutes);
  server.register(altChatRoutes);
  server.register(ollamaRoutes);
  server.register(uiAdapterRoutes);

  // ============ Health & Monitoring Endpoints ============

  // Health Check with comprehensive stats
  server.get('/health', async () => {
    return { 
      status: 'ok', 
      stack: 'fastify-ferrari',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  });

  // Connection pool stats
  server.get('/pool-stats', async () => {
    return {
      pools: getPoolStats(),
      timestamp: new Date().toISOString(),
    };
  });

  // Advanced metrics endpoint
  server.get('/metrics', async () => {
    return advancedMetrics.getStats();
  });

  // Prometheus metrics endpoint
  server.get('/metrics/prometheus', async (request, reply) => {
    reply.type('text/plain');
    return advancedMetrics.toPrometheus();
  });

  // Circuit breaker status
  server.get('/circuits', async () => {
    return circuitBreaker.getAllStatus();
  });

  // Reset circuit for a provider
  server.post('/circuits/:providerId/reset', async (request) => {
    const { providerId } = request.params;
    circuitBreaker.reset(providerId);
    return { success: true, message: `Circuit reset for ${providerId}` };
  });

  // Request queue stats
  server.get('/queue-stats', async () => {
    return requestQueue.getStats();
  });

  // Cache stats
  server.get('/cache-stats', async () => {
    return requestCache.getStats();
  });

  // Clear cache
  server.post('/cache/clear', async () => {
    requestCache.clear();
    return { success: true, message: 'Cache cleared' };
  });

  // Failover stats
  server.get('/failover-stats', async () => {
    return autoFailover.getStats();
  });

  // Request deduplication stats
  server.get('/dedup-stats', async () => {
    return requestDedup.getStats();
  });

  // Speculative execution stats
  server.get('/speculative-stats', async () => {
    return speculativeExecutor.getStats();
  });

  // Load balancer stats
  server.get('/loadbalancer-stats', async () => {
    return loadBalancer.getStats();
  });

  // Set load balancer strategy
  server.post('/loadbalancer/strategy/:strategy', async (request) => {
    const { strategy } = request.params;
    loadBalancer.setStrategy(strategy);
    return { success: true, strategy };
  });

  // Semantic cache stats
  server.get('/semantic-cache-stats', async () => {
    return semanticCache.getStats();
  });

  // Token estimation endpoint
  server.post('/estimate-tokens', async (request) => {
    const { model, messages, system } = request.body;
    const requestBody = { messages, system };
    
    return {
      estimatedTokens: tokenEstimator.estimateRequestTokens(requestBody, model),
      contextLimit: tokenEstimator.getContextLimit(model),
      outputLimit: tokenEstimator.getOutputLimit(model),
      check: tokenEstimator.checkFits(requestBody, model),
    };
  });

  // Smart fallback stats
  server.get('/fallback-stats', async () => {
    return smartFallback.getStats();
  });

  // Request batcher stats
  server.get('/batcher-stats', async () => {
    return requestBatcher.getStats();
  });

  // Quality scoring stats
  server.get('/quality-stats', async () => {
    return qualityScorer.getStats();
  });

  // Content filter stats
  server.get('/filter-stats', async () => {
    return contentFilter.getStats();
  });

  // Check content against filter
  server.post('/filter/check', async (request) => {
    return contentFilter.check(request.body.content || request.body.text);
  });

  // Prompt optimizer stats
  server.get('/optimizer-stats', async () => {
    return promptOptimizer.getStats();
  });

  // Optimize a prompt
  server.post('/optimize-prompt', async (request) => {
    const { text, level } = request.body;
    return promptOptimizer.optimize(text, { level });
  });

  // A/B testing endpoints
  server.get('/ab-tests', async () => {
    return abTesting.getStats();
  });

  server.post('/ab-tests', async (request) => {
    return abTesting.createExperiment(request.body);
  });

  server.get('/ab-tests/:id', async (request) => {
    return abTesting.getExperimentResults(request.params.id);
  });

  // Anomaly detection stats
  server.get('/anomaly-stats', async () => {
    return anomalyDetector.getStats();
  });

  // Request replay endpoints
  server.get('/replay-stats', async () => {
    return requestReplay.getStats();
  });

  server.get('/replay/failed', async () => {
    return requestReplay.getFailedRequests();
  });

  // Debug mode endpoints
  server.get('/debug-stats', async () => {
    return debugMode.getStats();
  });

  server.post('/debug/enable', async () => {
    debugMode.setEnabled(true);
    return { enabled: true };
  });

  server.post('/debug/disable', async () => {
    debugMode.setEnabled(false);
    return { enabled: false };
  });

  server.get('/debug/logs', async (request) => {
    return debugMode.getLogs(request.query);
  });

  // Webhook endpoints
  server.get('/webhooks', async () => {
    return webhookManager.getStats();
  });

  server.post('/webhooks', async (request) => {
    return webhookManager.register(request.body);
  });

  server.delete('/webhooks/:id', async (request) => {
    webhookManager.unregister(request.params.id);
    return { success: true };
  });

  // Audit log endpoints
  server.get('/audit-stats', async () => {
    return auditLogger.getStats();
  });

  server.get('/audit/logs', async (request) => {
    return auditLogger.query(request.query);
  });

  server.get('/audit/export', async (request, reply) => {
    const format = request.query.format || 'json';
    const data = await auditLogger.export({ ...request.query, format });
    
    if (format === 'csv') {
      reply.type('text/csv');
    }
    return data;
  });

  // Multi-tenant endpoints
  server.get('/tenants', async () => multiTenant.getStats());
  server.post('/tenants', async (req) => multiTenant.createTenant(req.body));
  server.get('/tenants/:id', async (req) => multiTenant.getTenant(req.params.id));
  server.put('/tenants/:id', async (req) => multiTenant.updateTenant(req.params.id, req.body));
  server.delete('/tenants/:id', async (req) => ({ success: multiTenant.deleteTenant(req.params.id) }));

  // API Key management
  server.get('/api-keys', async () => apiKeyManager.getStats());
  server.post('/api-keys', async (req) => apiKeyManager.generateKey(req.body));
  server.get('/api-keys/:id', async (req) => apiKeyManager.getKeyById(req.params.id));
  server.delete('/api-keys/:id', async (req) => ({ success: apiKeyManager.deleteKey(req.params.id) }));

  // Client rate limiting
  server.get('/rate-limits', async () => clientRateLimiter.getStats());
  server.get('/rate-limits/:clientId', async (req) => clientRateLimiter.getClientStatus(req.params.clientId));
  server.post('/rate-limits/:clientId', async (req) => { clientRateLimiter.setLimits(req.params.clientId, req.body); return { success: true }; });

  // IP filter
  server.get('/ip-filter', async () => ipFilter.getStats());
  server.post('/ip-filter/whitelist', async (req) => { ipFilter.addToWhitelist(req.body.ip); return { success: true }; });
  server.post('/ip-filter/blacklist', async (req) => { ipFilter.addToBlacklist(req.body.ip); return { success: true }; });

  // Request signing
  server.get('/signing-stats', async () => requestSigning.getStats());

  // Prompt templates
  server.get('/templates', async () => promptTemplates.list());
  server.post('/templates', async (req) => promptTemplates.create(req.body));
  server.get('/templates/:id', async (req) => promptTemplates.get(req.params.id));
  server.post('/templates/:id/render', async (req) => ({ result: promptTemplates.render(req.params.id, req.body) }));
  server.delete('/templates/:id', async (req) => ({ success: promptTemplates.delete(req.params.id) }));

  // Model orchestration
  server.get('/pipelines', async () => modelOrchestrator.getStats());
  server.post('/pipelines', async (req) => modelOrchestrator.createPipeline(req.body));
  server.get('/pipelines/:id', async (req) => modelOrchestrator.getPipeline(req.params.id));

  // Conversation memory
  server.get('/conversations', async () => conversationMemory.getStats());
  server.get('/conversations/:id', async (req) => conversationMemory.get(req.params.id));
  server.get('/conversations/:id/messages', async (req) => conversationMemory.getMessages(req.params.id, req.query));
  server.delete('/conversations/:id', async (req) => ({ success: conversationMemory.delete(req.params.id) }));

  // Function router
  server.get('/functions', async () => functionRouter.getStats());
  server.get('/functions/schemas', async () => functionRouter.getSchemas());

  // Streaming optimizer
  server.get('/streaming-stats', async () => streamingOptimizer.getStats());

  // Canary deployments
  server.get('/canary', async () => canaryDeployment.getStats());
  server.post('/canary', async (req) => canaryDeployment.create(req.body));
  server.get('/canary/:id', async (req) => canaryDeployment.getDeployment(req.params.id));
  server.post('/canary/:id/rollback', async (req) => canaryDeployment.rollback(req.params.id, req.body.reason));
  server.post('/canary/:id/promote', async (req) => canaryDeployment.promote(req.params.id));

  // Traffic shadowing
  server.get('/shadows', async () => trafficShadow.getStats());
  server.post('/shadows', async (req) => trafficShadow.createShadow(req.body));
  server.delete('/shadows/:id', async (req) => ({ success: trafficShadow.deleteShadow(req.params.id) }));

  // Geographic routing
  server.get('/geo-routing', async () => geographicRouter.getStats());
  server.post('/geo-routing/endpoints', async (req) => geographicRouter.registerEndpoint(req.body));

  // Custom alerts
  server.get('/alerts', async () => customAlerts.getStats());
  server.post('/alerts/rules', async (req) => customAlerts.createRule(req.body));
  server.get('/alerts/history', async (req) => customAlerts.getAlerts(req.query));

  // SLA monitoring
  server.get('/sla', async () => slaMonitor.getStats());
  server.post('/sla', async (req) => slaMonitor.defineSla(req.body));
  server.get('/sla/:id', async (req) => slaMonitor.getSla(req.params.id));

  // Usage analytics
  server.get('/analytics', async () => usageAnalytics.getStats());
  server.get('/analytics/summary', async (req) => usageAnalytics.getSummary(req.query));
  server.get('/analytics/by-model', async () => usageAnalytics.getByModel());
  server.get('/analytics/by-provider', async () => usageAnalytics.getByProvider());
  server.get('/analytics/by-client', async () => usageAnalytics.getByClient());
  server.get('/analytics/cost', async () => usageAnalytics.getCostBreakdown());
  server.get('/analytics/trends', async (req) => usageAnalytics.getTrends(req.query));
  server.get('/analytics/report', async (req) => usageAnalytics.exportReport(req.query));

  // System status (all-in-one)
  server.get('/status', async () => {
    return {
      server: {
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        shutdownPending: gracefulShutdown.isTerminating(),
      },
      connectionPools: getPoolStats(),
      circuits: circuitBreaker.getAllStatus(),
      queue: requestQueue.getStats(),
      cache: requestCache.getStats(),
      semanticCache: semanticCache.getStats(),
      dedup: requestDedup.getStats(),
      failover: autoFailover.getStats(),
      speculative: speculativeExecutor.getStats(),
      loadBalancer: loadBalancer.getStats(),
      smartFallback: smartFallback.getStats(),
      batcher: requestBatcher.getStats(),
      quality: qualityScorer.getStats(),
      contentFilter: contentFilter.getStats(),
      promptOptimizer: promptOptimizer.getStats(),
      abTesting: abTesting.getStats(),
      anomalyDetection: anomalyDetector.getStats(),
      requestReplay: requestReplay.getStats(),
      debug: debugMode.getStats(),
      webhooks: webhookManager.getStats(),
      audit: auditLogger.getStats(),
      multiTenant: multiTenant.getStats(),
      apiKeys: apiKeyManager.getStats(),
      clientRateLimiter: clientRateLimiter.getStats(),
      ipFilter: ipFilter.getStats(),
      requestSigning: requestSigning.getStats(),
      templates: promptTemplates.getStats(),
      orchestration: modelOrchestrator.getStats(),
      conversations: conversationMemory.getStats(),
      functions: functionRouter.getStats(),
      streaming: streamingOptimizer.getStats(),
      canary: canaryDeployment.getStats(),
      shadows: trafficShadow.getStats(),
      geoRouting: geographicRouter.getStats(),
      alerts: customAlerts.getStats(),
      sla: slaMonitor.getStats(),
      analytics: usageAnalytics.getStats(),
      metrics: advancedMetrics.getStats(),
      timestamp: new Date().toISOString(),
    };
  });

  const port = process.env.PORT_FASTIFY || 3001;
  const host = CONFIG.HOST || '0.0.0.0';

  // Register graceful shutdown handlers
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Clearing request cache...');
    requestCache.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping circuit breaker...');
    circuitBreaker.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Draining request queue...');
    requestQueue.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Flushing request batcher...');
    await requestBatcher.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Clearing dedup cache...');
    requestDedup.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Clearing semantic cache...');
    semanticCache.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping load balancer...');
    loadBalancer.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping anomaly detector...');
    anomalyDetector.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping webhooks...');
    webhookManager.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Flushing audit logs...');
    await auditLogger.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping client rate limiter...');
    clientRateLimiter.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping conversation memory...');
    conversationMemory.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping traffic shadow...');
    trafficShadow.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping custom alerts...');
    customAlerts.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping SLA monitor...');
    slaMonitor.shutdown();
  });
  
  gracefulShutdown.onShutdown(async () => {
    console.log('[Shutdown] Stopping usage analytics...');
    usageAnalytics.shutdown();
  });

  try {
    await server.listen({ port, host });
    
    // Register server for graceful shutdown
    gracefulShutdown.registerServer(server);
    
    console.log(`\n[Server] Fastify "Ferrari" Server running at http://${host}:${port}`);
    console.log(`   - Health:     http://${host}:${port}/health`);
    console.log(`   - Chat:       http://${host}:${port}/v1/chat/completions`);
    console.log(`   - Status:     http://${host}:${port}/status`);
    console.log(`   - Metrics:    http://${host}:${port}/metrics`);
    console.log(`   - Prometheus: http://${host}:${port}/metrics/prometheus`);
    console.log(`   - Circuits:   http://${host}:${port}/circuits`);
    console.log(`   - UI:         http://${host}:${port}/`);
    
    // Pre-warm connection pools
    const customOrigins = [];
    if (CONFIG.OPENAI_BASE_URL) {
      try { customOrigins.push(new URL(CONFIG.OPENAI_BASE_URL).origin); } catch (e) {}
    }
    if (CONFIG.CLAUDE_BASE_URL) {
      try { customOrigins.push(new URL(CONFIG.CLAUDE_BASE_URL).origin); } catch (e) {}
    }
    
    await prewarmConnections(customOrigins);
    console.log(`[Server] Connection pools pre-warmed`);
    console.log(`[Server] All middleware initialized: cache, circuit-breaker, queue, tracing, compression`);
    
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

startServer();
