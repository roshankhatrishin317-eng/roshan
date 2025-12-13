/**
 * Per-Client Rate Limiting
 * Fine-grained rate limiting by API key, tenant, IP, or custom identifier
 */

class ClientRateLimiter {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.defaultLimits = {
      requests: options.defaultRequests || 100,
      window: options.defaultWindow || 60000, // 1 minute
      tokens: options.defaultTokens || 100000,
    };
    
    this.clients = new Map(); // clientId -> rate data
    this.customLimits = new Map(); // clientId -> custom limits
    this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
    
    this.stats = {
      totalChecks: 0,
      totalAllowed: 0,
      totalBlocked: 0,
      byReason: {},
    };
  }

  /**
   * Check rate limit for a client
   */
  check(clientId, options = {}) {
    if (!this.enabled) return { allowed: true };
    
    this.stats.totalChecks++;
    
    const now = Date.now();
    const limits = this._getLimits(clientId);
    let client = this.clients.get(clientId);
    
    if (!client) {
      client = this._createClient(clientId, limits);
      this.clients.set(clientId, client);
    }
    
    // Reset window if expired
    if (now - client.windowStart > limits.window) {
      client.requestCount = 0;
      client.tokenCount = 0;
      client.windowStart = now;
    }
    
    // Check request limit
    if (client.requestCount >= limits.requests) {
      this.stats.totalBlocked++;
      this.stats.byReason['request_limit'] = (this.stats.byReason['request_limit'] || 0) + 1;
      
      return {
        allowed: false,
        reason: 'Request rate limit exceeded',
        limit: limits.requests,
        current: client.requestCount,
        retryAfter: Math.ceil((client.windowStart + limits.window - now) / 1000),
      };
    }
    
    // Check token limit if specified
    const tokens = options.tokens || 0;
    if (limits.tokens && client.tokenCount + tokens > limits.tokens) {
      this.stats.totalBlocked++;
      this.stats.byReason['token_limit'] = (this.stats.byReason['token_limit'] || 0) + 1;
      
      return {
        allowed: false,
        reason: 'Token rate limit exceeded',
        limit: limits.tokens,
        current: client.tokenCount,
        retryAfter: Math.ceil((client.windowStart + limits.window - now) / 1000),
      };
    }
    
    // Increment counters
    client.requestCount++;
    client.tokenCount += tokens;
    client.lastRequest = now;
    
    this.stats.totalAllowed++;
    
    return {
      allowed: true,
      remaining: {
        requests: limits.requests - client.requestCount,
        tokens: limits.tokens ? limits.tokens - client.tokenCount : null,
      },
      resetAt: client.windowStart + limits.window,
    };
  }

  /**
   * Record token usage after request
   */
  recordTokens(clientId, tokens) {
    const client = this.clients.get(clientId);
    if (client) {
      client.tokenCount += tokens;
    }
  }

  /**
   * Set custom limits for a client
   */
  setLimits(clientId, limits) {
    this.customLimits.set(clientId, {
      requests: limits.requests || this.defaultLimits.requests,
      window: limits.window || this.defaultLimits.window,
      tokens: limits.tokens || this.defaultLimits.tokens,
    });
  }

  /**
   * Remove custom limits
   */
  removeLimits(clientId) {
    this.customLimits.delete(clientId);
  }

  /**
   * Get current limits for client
   */
  _getLimits(clientId) {
    return this.customLimits.get(clientId) || this.defaultLimits;
  }

  /**
   * Create client tracking object
   */
  _createClient(clientId, limits) {
    return {
      id: clientId,
      requestCount: 0,
      tokenCount: 0,
      windowStart: Date.now(),
      lastRequest: null,
      createdAt: Date.now(),
    };
  }

  /**
   * Get client status
   */
  getClientStatus(clientId) {
    const client = this.clients.get(clientId);
    const limits = this._getLimits(clientId);
    
    if (!client) {
      return {
        clientId,
        limits,
        usage: { requests: 0, tokens: 0 },
        remaining: { requests: limits.requests, tokens: limits.tokens },
      };
    }
    
    const now = Date.now();
    const windowExpired = now - client.windowStart > limits.window;
    
    return {
      clientId,
      limits,
      usage: windowExpired ? { requests: 0, tokens: 0 } : {
        requests: client.requestCount,
        tokens: client.tokenCount,
      },
      remaining: windowExpired ? { requests: limits.requests, tokens: limits.tokens } : {
        requests: Math.max(0, limits.requests - client.requestCount),
        tokens: limits.tokens ? Math.max(0, limits.tokens - client.tokenCount) : null,
      },
      resetAt: client.windowStart + limits.window,
      lastRequest: client.lastRequest,
    };
  }

  /**
   * Reset client rate limit
   */
  resetClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.requestCount = 0;
      client.tokenCount = 0;
      client.windowStart = Date.now();
    }
  }

  /**
   * Cleanup old clients
   */
  _cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [id, client] of this.clients) {
      if (client.lastRequest && now - client.lastRequest > maxAge) {
        this.clients.delete(id);
      }
    }
  }

  /**
   * Get all clients status
   */
  listClients() {
    return Array.from(this.clients.keys()).map(id => this.getClientStatus(id));
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      defaultLimits: this.defaultLimits,
      trackedClients: this.clients.size,
      customLimitsCount: this.customLimits.size,
      ...this.stats,
      blockRate: this.stats.totalChecks > 0
        ? ((this.stats.totalBlocked / this.stats.totalChecks) * 100).toFixed(2) + '%'
        : '0%',
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
  }
}

export const clientRateLimiter = new ClientRateLimiter();
export { ClientRateLimiter };
