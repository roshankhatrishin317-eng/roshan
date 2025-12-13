/**
 * Rate-limit Aware Request Queue with Priority Support
 * Manages concurrent requests and enforces rate limits per provider
 */

class RequestQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 50;
    this.maxQueueSize = options.maxQueueSize || 500;
    this.defaultRateLimit = options.defaultRateLimit || 60; // requests per minute
    
    this.queues = new Map(); // Per-provider queues
    this.rateLimits = new Map(); // Per-provider rate limits
    this.activeRequests = new Map(); // Per-provider active count
    this.requestWindows = new Map(); // Per-provider sliding window
    
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalRejected: 0,
      totalRateLimited: 0,
    };
  }

  /**
   * Set rate limit for a provider
   */
  setRateLimit(providerId, requestsPerMinute) {
    this.rateLimits.set(providerId, requestsPerMinute);
  }

  /**
   * Get or initialize provider state
   */
  _getProviderState(providerId) {
    if (!this.queues.has(providerId)) {
      this.queues.set(providerId, []);
      this.activeRequests.set(providerId, 0);
      this.requestWindows.set(providerId, []);
    }
    return {
      queue: this.queues.get(providerId),
      active: this.activeRequests.get(providerId),
      window: this.requestWindows.get(providerId),
    };
  }

  /**
   * Check if rate limit allows request
   */
  _checkRateLimit(providerId) {
    const limit = this.rateLimits.get(providerId) || this.defaultRateLimit;
    const window = this.requestWindows.get(providerId) || [];
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    // Clean old entries
    const validRequests = window.filter(ts => ts > windowStart);
    this.requestWindows.set(providerId, validRequests);
    
    return validRequests.length < limit;
  }

  /**
   * Record request in rate limit window
   */
  _recordRequest(providerId) {
    const window = this.requestWindows.get(providerId) || [];
    window.push(Date.now());
    this.requestWindows.set(providerId, window);
  }

  /**
   * Enqueue a request
   * @param {string} providerId - Provider identifier
   * @param {Function} executor - Async function to execute
   * @param {object} options - { priority: 'high'|'normal'|'low', timeout: ms }
   * @returns {Promise} Resolves when request completes
   */
  async enqueue(providerId, executor, options = {}) {
    const state = this._getProviderState(providerId);
    const priority = options.priority || 'normal';
    const timeout = options.timeout || 300000; // 5 min default
    
    // Check queue size
    if (state.queue.length >= this.maxQueueSize) {
      this.stats.totalRejected++;
      throw new Error('Queue full - request rejected');
    }
    
    return new Promise((resolve, reject) => {
      const request = {
        executor,
        resolve,
        reject,
        priority,
        timeout,
        enqueuedAt: Date.now(),
        providerId,
      };
      
      // Insert by priority
      if (priority === 'high') {
        // Find first non-high priority and insert before
        const idx = state.queue.findIndex(r => r.priority !== 'high');
        if (idx === -1) {
          state.queue.push(request);
        } else {
          state.queue.splice(idx, 0, request);
        }
      } else if (priority === 'low') {
        state.queue.push(request);
      } else {
        // Normal priority - insert before low priority
        const idx = state.queue.findIndex(r => r.priority === 'low');
        if (idx === -1) {
          state.queue.push(request);
        } else {
          state.queue.splice(idx, 0, request);
        }
      }
      
      this.stats.totalQueued++;
      this._processQueue(providerId);
    });
  }

  /**
   * Process queued requests
   */
  async _processQueue(providerId) {
    const state = this._getProviderState(providerId);
    
    while (state.queue.length > 0) {
      // Check concurrency limit
      if (state.active >= this.maxConcurrent) {
        break;
      }
      
      // Check rate limit
      if (!this._checkRateLimit(providerId)) {
        this.stats.totalRateLimited++;
        // Wait and retry
        setTimeout(() => this._processQueue(providerId), 1000);
        break;
      }
      
      const request = state.queue.shift();
      
      // Check timeout
      if (Date.now() - request.enqueuedAt > request.timeout) {
        request.reject(new Error('Request timed out in queue'));
        continue;
      }
      
      // Execute request
      this.activeRequests.set(providerId, state.active + 1);
      this._recordRequest(providerId);
      
      this._executeRequest(request, providerId);
    }
  }

  /**
   * Execute a single request
   */
  async _executeRequest(request, providerId) {
    try {
      const result = await request.executor();
      request.resolve(result);
      this.stats.totalProcessed++;
    } catch (error) {
      request.reject(error);
    } finally {
      const current = this.activeRequests.get(providerId) || 1;
      this.activeRequests.set(providerId, Math.max(0, current - 1));
      
      // Process next in queue
      setImmediate(() => this._processQueue(providerId));
    }
  }

  /**
   * Get current queue stats
   */
  getStats() {
    const queueSizes = {};
    const activeReqs = {};
    const rateLimitUsage = {};
    
    for (const [providerId, queue] of this.queues) {
      queueSizes[providerId] = queue.length;
      activeReqs[providerId] = this.activeRequests.get(providerId) || 0;
      
      const window = this.requestWindows.get(providerId) || [];
      const limit = this.rateLimits.get(providerId) || this.defaultRateLimit;
      const now = Date.now();
      const validRequests = window.filter(ts => ts > now - 60000);
      rateLimitUsage[providerId] = {
        used: validRequests.length,
        limit,
        percentage: ((validRequests.length / limit) * 100).toFixed(1) + '%',
      };
    }
    
    return {
      ...this.stats,
      queueSizes,
      activeRequests: activeReqs,
      rateLimitUsage,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
    };
  }

  /**
   * Clear queue for a provider
   */
  clearQueue(providerId) {
    const queue = this.queues.get(providerId);
    if (queue) {
      queue.forEach(req => req.reject(new Error('Queue cleared')));
      this.queues.set(providerId, []);
    }
  }

  /**
   * Shutdown - reject all pending
   */
  shutdown() {
    for (const [providerId, queue] of this.queues) {
      queue.forEach(req => req.reject(new Error('Server shutting down')));
    }
    this.queues.clear();
  }
}

export const requestQueue = new RequestQueue();
export { RequestQueue };
