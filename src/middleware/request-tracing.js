/**
 * Request Tracing Middleware
 * Adds trace IDs and tracks request lifecycle
 */

import { randomUUID } from 'crypto';
import { advancedMetrics } from '../metrics/advanced-metrics.js';

// Async local storage for trace context
import { AsyncLocalStorage } from 'async_hooks';

const traceStorage = new AsyncLocalStorage();

/**
 * Generate a short trace ID
 */
function generateTraceId() {
  return randomUUID().split('-')[0] + randomUUID().split('-')[1];
}

/**
 * Get current trace context
 */
function getTraceContext() {
  return traceStorage.getStore();
}

/**
 * Get current trace ID
 */
function getTraceId() {
  const ctx = getTraceContext();
  return ctx?.traceId;
}

/**
 * Create trace context
 */
function createTraceContext(metadata = {}) {
  const traceId = metadata.traceId || generateTraceId();
  const parentId = metadata.parentId || null;
  const spanId = generateTraceId().substring(0, 8);
  
  return {
    traceId,
    parentId,
    spanId,
    startTime: Date.now(),
    metadata: {
      ...metadata,
      spans: [],
    },
  };
}

/**
 * Start a new span within current trace
 */
function startSpan(name, attributes = {}) {
  const ctx = getTraceContext();
  if (!ctx) return null;
  
  const span = {
    spanId: generateTraceId().substring(0, 8),
    parentSpanId: ctx.spanId,
    name,
    startTime: Date.now(),
    endTime: null,
    duration: null,
    attributes,
    events: [],
    status: 'OK',
  };
  
  ctx.metadata.spans.push(span);
  return span;
}

/**
 * End a span
 */
function endSpan(span, status = 'OK', error = null) {
  if (!span) return;
  
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
  span.status = status;
  
  if (error) {
    span.error = {
      message: error.message,
      stack: error.stack,
    };
  }
}

/**
 * Add event to current span
 */
function addSpanEvent(name, attributes = {}) {
  const ctx = getTraceContext();
  if (!ctx || ctx.metadata.spans.length === 0) return;
  
  const currentSpan = ctx.metadata.spans[ctx.metadata.spans.length - 1];
  currentSpan.events.push({
    name,
    timestamp: Date.now(),
    attributes,
  });
}

/**
 * Fastify request tracing plugin
 */
async function requestTracingPlugin(fastify, options = {}) {
  const headerName = options.headerName || 'x-trace-id';
  const includeInResponse = options.includeInResponse !== false;
  
  // Add trace context to all requests
  fastify.addHook('onRequest', async (request, reply) => {
    // Get or generate trace ID
    const incomingTraceId = request.headers[headerName] || 
                            request.headers['x-request-id'] ||
                            request.headers['x-correlation-id'];
    
    const ctx = createTraceContext({
      traceId: incomingTraceId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    
    // Store in request for access
    request.traceId = ctx.traceId;
    request.traceContext = ctx;
    
    // Start metrics trace
    advancedMetrics.startTrace(ctx.traceId, {
      method: request.method,
      url: request.url,
    });
    
    // Add to response headers
    if (includeInResponse) {
      reply.header(headerName, ctx.traceId);
    }
    
    // Log request start
    request.log.info({ traceId: ctx.traceId }, 'Request started');
  });
  
  // Track response
  fastify.addHook('onResponse', async (request, reply) => {
    const ctx = request.traceContext;
    if (!ctx) return;
    
    const duration = Date.now() - ctx.startTime;
    
    // End metrics trace
    advancedMetrics.endTrace(ctx.traceId, 
      reply.statusCode >= 400 ? new Error(`HTTP ${reply.statusCode}`) : null
    );
    
    // Log request end
    request.log.info({
      traceId: ctx.traceId,
      duration,
      statusCode: reply.statusCode,
    }, 'Request completed');
  });
  
  // Handle errors
  fastify.addHook('onError', async (request, reply, error) => {
    const ctx = request.traceContext;
    if (!ctx) return;
    
    addSpanEvent('error', {
      message: error.message,
      stack: error.stack,
    });
    
    request.log.error({
      traceId: ctx.traceId,
      error: error.message,
    }, 'Request error');
  });
}

/**
 * Trace context propagation for outgoing requests
 */
function getTracingHeaders() {
  const ctx = getTraceContext();
  if (!ctx) return {};
  
  return {
    'x-trace-id': ctx.traceId,
    'x-span-id': ctx.spanId,
    'x-parent-span-id': ctx.parentId,
  };
}

/**
 * Run function with trace context
 */
function runWithTrace(traceContext, fn) {
  return traceStorage.run(traceContext, fn);
}

/**
 * Wrap async function with tracing
 */
function traceAsync(name, fn, attributes = {}) {
  return async (...args) => {
    const span = startSpan(name, attributes);
    try {
      const result = await fn(...args);
      endSpan(span, 'OK');
      return result;
    } catch (error) {
      endSpan(span, 'ERROR', error);
      throw error;
    }
  };
}

/**
 * Express/Connect style middleware
 */
function tracingMiddleware(options = {}) {
  const headerName = options.headerName || 'x-trace-id';
  
  return (req, res, next) => {
    const incomingTraceId = req.headers[headerName] || 
                            req.headers['x-request-id'];
    
    const ctx = createTraceContext({
      traceId: incomingTraceId,
      method: req.method,
      url: req.url,
    });
    
    req.traceId = ctx.traceId;
    req.traceContext = ctx;
    res.setHeader(headerName, ctx.traceId);
    
    // Start metrics trace
    advancedMetrics.startTrace(ctx.traceId, {
      method: req.method,
      url: req.url,
    });
    
    // Track response
    const originalEnd = res.end;
    res.end = function(...args) {
      advancedMetrics.endTrace(ctx.traceId,
        res.statusCode >= 400 ? new Error(`HTTP ${res.statusCode}`) : null
      );
      return originalEnd.apply(this, args);
    };
    
    runWithTrace(ctx, () => next());
  };
}

export {
  generateTraceId,
  getTraceContext,
  getTraceId,
  createTraceContext,
  startSpan,
  endSpan,
  addSpanEvent,
  getTracingHeaders,
  runWithTrace,
  traceAsync,
  requestTracingPlugin,
  tracingMiddleware,
};
