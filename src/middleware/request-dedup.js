/**
 * Request Deduplication
 * Prevents duplicate concurrent requests - returns same promise for identical in-flight requests
 * Significantly reduces API costs and latency for duplicate requests
 */

import { createHash } from 'crypto';

class RequestDeduplicator {
  constructor(options = {}) {
    this.inFlight = new Map(); // key -> { promise, subscribers, startTime }
    this.maxWaitTime = options.maxWaitTime || 30000; // Max time to wait for dedup
    this.stats = {
      totalRequests: 0,
      deduped: 0,
      saved: 0, // Estimated API calls saved
    };
    
    // Cleanup stale entries periodically
    this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
  }

  /**
   * Generate dedup key from request
   */
  _generateKey(provider, model, requestBody) {
    const normalized = {
      provider,
      model,
      messages: requestBody.messages,
      temperature: requestBody.temperature || 1,
      max_tokens: requestBody.max_tokens,
      top_p: requestBody.top_p,
      stream: requestBody.stream,
    };
    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Execute with deduplication
   * If identical request is in-flight, wait for it instead of making new request
   */
  async execute(provider, model, requestBody, executor) {
    this.stats.totalRequests++;
    
    // Don't dedup streaming requests (each client needs their own stream)
    if (requestBody.stream) {
      return executor();
    }
    
    const key = this._generateKey(provider, model, requestBody);
    
    // Check if identical request is already in-flight
    if (this.inFlight.has(key)) {
      const entry = this.inFlight.get(key);
      entry.subscribers++;
      this.stats.deduped++;
      this.stats.saved++;
      
      console.log(`[Dedup] Request deduplicated (${entry.subscribers} subscribers waiting)`);
      
      try {
        // Wait for the original request to complete
        const result = await entry.promise;
        return result;
      } finally {
        entry.subscribers--;
      }
    }
    
    // Create new in-flight entry
    let resolvePromise, rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    
    const entry = {
      promise,
      subscribers: 1,
      startTime: Date.now(),
      resolve: resolvePromise,
      reject: rejectPromise,
    };
    
    this.inFlight.set(key, entry);
    
    try {
      const result = await executor();
      entry.resolve(result);
      return result;
    } catch (error) {
      entry.reject(error);
      throw error;
    } finally {
      // Remove from in-flight after small delay to catch very close duplicates
      setTimeout(() => {
        if (this.inFlight.get(key) === entry) {
          this.inFlight.delete(key);
        }
      }, 100);
    }
  }

  /**
   * Cleanup stale entries
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.inFlight) {
      if (now - entry.startTime > this.maxWaitTime) {
        entry.reject(new Error('Dedup entry timeout'));
        this.inFlight.delete(key);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      inFlightCount: this.inFlight.size,
      dedupRate: this.stats.totalRequests > 0 
        ? ((this.stats.deduped / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
    for (const [key, entry] of this.inFlight) {
      entry.reject(new Error('Shutdown'));
    }
    this.inFlight.clear();
  }
}

export const requestDedup = new RequestDeduplicator();
export { RequestDeduplicator };
