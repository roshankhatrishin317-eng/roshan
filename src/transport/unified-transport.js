import { fetch, Agent, Pool, setGlobalDispatcher, Dispatcher } from 'undici';
import { randomUUID } from 'crypto';
import { lookup } from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(lookup);

// DNS Cache for faster resolution (reduces 50-150ms per new connection)
const dnsCache = new Map();
const DNS_CACHE_TTL = 300000; // 5 minutes TTL

function cachedDnsLookup(hostname, options, callback) {
  // Handle case where options is the callback (2-arg call)
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  
  const cacheKey = `${hostname}:${options?.family || 0}`;
  const cached = dnsCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL) {
    if (callback) {
      setImmediate(() => callback(null, cached.address, cached.family));
      return;
    }
    return { address: cached.address, family: cached.family };
  }
  
  // Use the original lookup with callback
  lookup(hostname, options || {}, (err, address, family) => {
    if (err) {
      if (callback) {
        callback(err);
      }
      return;
    }
    
    dnsCache.set(cacheKey, {
      address,
      family,
      timestamp: Date.now()
    });
    
    if (callback) {
      callback(null, address, family);
    }
  });
}

// Connection pool registry for different origins
const connectionPools = new Map();

// Optimized Agent for High-Throughput API Gateway
// 1. Keep-Alive: Critical for avoiding SSL handshake overhead
// 2. Connections: High limit for concurrent provider requests
// 3. Timeouts: Balanced to fail fast but allow long LLM generations
const globalAgent = new Agent({
  keepAliveTimeout: 120000, // 120s Keep-Alive (increased for LLM workloads)
  keepAliveMaxTimeout: 1200000, // 20 min max session (longer for persistent connections)
  connections: 256, // Per-origin connection limit
  pipelining: 1, // Enable HTTP/1.1 pipelining (safe for modern APIs)
  connectTimeout: 15000, // 15s connection timeout
  headersTimeout: 120000, // 120s header timeout (LLM APIs can be slow)
  bodyTimeout: 0, // 0 = disabled (crucial for long streams)
  maxResponseSize: 0, // No limit
  allowH2: true, // Allow HTTP/2 when supported
  connect: {
    lookup: cachedDnsLookup, // Use cached DNS lookup
    rejectUnauthorized: true,
    keepAlive: true,
    keepAliveInitialDelay: 60000, // 60s before first keep-alive probe
  }
});

setGlobalDispatcher(globalAgent);

// Get or create a connection pool for a specific origin
function getPoolForOrigin(origin) {
  if (!connectionPools.has(origin)) {
    const pool = new Pool(origin, {
      connections: 128, // Max connections per origin
      pipelining: 1,
      keepAliveTimeout: 120000,
      keepAliveMaxTimeout: 1200000,
      bodyTimeout: 0,
      headersTimeout: 120000,
      connect: {
        lookup: cachedDnsLookup,
        rejectUnauthorized: true,
        keepAlive: true,
        keepAliveInitialDelay: 60000,
      }
    });
    connectionPools.set(origin, pool);
  }
  return connectionPools.get(origin);
}

// Pool stats for monitoring
export function getPoolStats() {
  const stats = {};
  for (const [origin, pool] of connectionPools) {
    stats[origin] = {
      connected: pool.stats?.connected || 0,
      free: pool.stats?.free || 0,
      pending: pool.stats?.pending || 0,
      queued: pool.stats?.queued || 0,
      running: pool.stats?.running || 0,
      size: pool.stats?.size || 0,
    };
  }
  return stats;
}

// Clear DNS cache entry
export function clearDnsCache(hostname) {
  if (hostname) {
    dnsCache.delete(`${hostname}:0`);
    dnsCache.delete(`${hostname}:4`);
    dnsCache.delete(`${hostname}:6`);
  } else {
    dnsCache.clear();
  }
}

export class UnifiedTransport {
  constructor(config = {}) {
    this.agent = config.agent || globalAgent;
    this.timeout = config.timeout || 300000;
    this.usePooling = config.usePooling !== false; // Default to true
    this.retryConfig = {
      maxRetries: config.maxRetries || 3,
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 30000,
    };
  }

  // Calculate delay with exponential backoff and jitter
  _getRetryDelay(attempt) {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt),
      this.retryConfig.maxDelay
    );
    // Add 10-30% jitter to prevent thundering herd
    return delay * (0.9 + Math.random() * 0.2);
  }

  // Check if error is retryable
  _isRetryable(error, status) {
    if (status === 429 || (status >= 500 && status < 600)) {
      return true;
    }
    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || 
        error.code === 'ECONNREFUSED' || error.code === 'UND_ERR_SOCKET') {
      return true;
    }
    return false;
  }

  /**
   * High-performance HTTP request using Undici with connection pooling
   */
  async request(url, options = {}) {
    const method = options.method || 'GET';
    const headers = {
      'content-type': 'application/json',
      'connection': 'keep-alive',
      ...options.headers
    };
    
    const requestId = options.requestId || randomUUID();
    const urlObj = new URL(url);
    const origin = urlObj.origin;
    
    // Use pooled dispatcher for known origins
    const dispatcher = this.usePooling ? getPoolForOrigin(origin) : this.agent;
    
    let lastError;
    const maxAttempts = options.noRetry ? 1 : this.retryConfig.maxRetries + 1;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
          dispatcher,
          signal: options.signal,
        });

        // Handle non-retryable errors immediately
        if (!response.ok) {
          const status = response.status;
          
          // Don't retry auth errors
          if (status === 401 || status === 403) {
            const errorText = await response.text();
            const error = new Error(`HTTP ${status}: ${errorText.substring(0, 500)}`);
            error.status = status;
            error.requestId = requestId;
            throw error;
          }
          
          // Check if retryable
          if (this._isRetryable(null, status) && attempt < maxAttempts - 1) {
            const delay = this._getRetryDelay(attempt);
            console.log(`[Transport] HTTP ${status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxAttempts})`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          
          const errorText = await response.text();
          const error = new Error(`HTTP ${status} ${response.statusText}: ${errorText.substring(0, 500)}`);
          error.status = status;
          throw error;
        }

        const contentType = response.headers.get('content-type');
        
        if (options.stream) {
          return response.body;
        }

        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        }

        return await response.text();
        
      } catch (error) {
        lastError = error;
        lastError.requestId = requestId;
        lastError.url = url;
        
        if (!error.context) {
          error.context = { url, method, attempt };
        }
        
        // Check if we should retry
        if (this._isRetryable(error, error.status) && attempt < maxAttempts - 1) {
          const delay = this._getRetryDelay(attempt);
          console.log(`[Transport] ${error.code || error.message}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxAttempts})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * Stream request with keep-alive and efficient parsing
   */
  async *streamRequest(url, options = {}) {
    const method = options.method || 'POST';
    const headers = {
      'content-type': 'application/json',
      'connection': 'keep-alive',
      'accept': 'text/event-stream',
      ...options.headers
    };
    
    const urlObj = new URL(url);
    const origin = urlObj.origin;
    const dispatcher = this.usePooling ? getPoolForOrigin(origin) : this.agent;
    
    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
      dispatcher,
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`HTTP ${response.status}: ${errorText.substring(0, 500)}`);
      error.status = response.status;
      throw error;
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.substring(0, newlineIndex).trim();
          buffer = buffer.substring(newlineIndex + 1);
          
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data === '[DONE]') {
              return;
            }
            try {
              yield JSON.parse(data);
            } catch (e) {
              // Non-JSON data, yield as string
              if (data) yield { raw: data };
            }
          }
        }
      }
      
      // Process remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data && data !== '[DONE]') {
              try {
                yield JSON.parse(data);
              } catch (e) {
                if (data) yield { raw: data };
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const defaultTransport = new UnifiedTransport();

// Pre-warm connections to common LLM API endpoints
export async function prewarmConnections(origins = []) {
  const defaultOrigins = [
    'https://api.openai.com',
    'https://api.anthropic.com',
    'https://generativelanguage.googleapis.com',
    'https://apis.iflow.cn',
  ];
  
  const allOrigins = [...new Set([...defaultOrigins, ...origins])];
  
  for (const origin of allOrigins) {
    try {
      getPoolForOrigin(origin);
      console.log(`[Transport] Pre-warmed connection pool for ${origin}`);
    } catch (e) {
      // Ignore errors during pre-warming
    }
  }
}
