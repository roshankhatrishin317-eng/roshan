/**
 * Automatic Failover Handler
 * Switches providers mid-stream on error
 */

import { circuitBreaker } from './circuit-breaker.js';
import { advancedMetrics } from '../metrics/advanced-metrics.js';

class AutoFailover {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 2;
    this.retryableErrors = options.retryableErrors || [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'rate_limit',
      '429',
      '500',
      '502',
      '503',
      '504',
    ];
    
    this.providerPriority = new Map(); // Provider -> priority score
    this.failoverHistory = [];
    this.maxHistorySize = 100;
    
    this.stats = {
      totalFailovers: 0,
      successfulFailovers: 0,
      failedFailovers: 0,
    };
  }

  /**
   * Set provider priority (higher = preferred)
   */
  setProviderPriority(providerId, priority) {
    this.providerPriority.set(providerId, priority);
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const errorStr = String(error.message || error.code || error);
    return this.retryableErrors.some(e => 
      errorStr.toLowerCase().includes(e.toLowerCase())
    );
  }

  /**
   * Get next available provider
   */
  getNextProvider(currentProvider, availableProviders, excludeProviders = []) {
    const excluded = new Set([currentProvider, ...excludeProviders]);
    
    // Filter available providers
    const candidates = availableProviders.filter(p => {
      const id = p.uuid || p.id || p;
      return !excluded.has(id) && circuitBreaker.canExecute(id);
    });
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Sort by priority (higher first)
    candidates.sort((a, b) => {
      const aId = a.uuid || a.id || a;
      const bId = b.uuid || b.id || b;
      const aPriority = this.providerPriority.get(aId) || 0;
      const bPriority = this.providerPriority.get(bId) || 0;
      return bPriority - aPriority;
    });
    
    return candidates[0];
  }

  /**
   * Execute with automatic failover
   */
  async executeWithFailover(executor, options = {}) {
    const {
      providerId,
      availableProviders = [],
      traceId,
      onFailover,
    } = options;
    
    let currentProvider = providerId;
    let excludedProviders = [];
    let lastError = null;
    let attempt = 0;
    
    while (attempt <= this.maxRetries) {
      try {
        // Check circuit breaker
        if (!circuitBreaker.canExecute(currentProvider)) {
          throw new Error(`Circuit open for ${currentProvider}`);
        }
        
        // Execute request
        const result = await executor(currentProvider);
        
        // Success - record in circuit breaker
        circuitBreaker.recordSuccess(currentProvider);
        
        if (attempt > 0) {
          this.stats.successfulFailovers++;
          this._recordFailover(providerId, currentProvider, true);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Record failure in circuit breaker
        circuitBreaker.recordFailure(currentProvider, error);
        
        // Check if retryable
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Try to failover
        excludedProviders.push(currentProvider);
        const nextProvider = this.getNextProvider(
          currentProvider, 
          availableProviders, 
          excludedProviders
        );
        
        if (!nextProvider) {
          console.log(`[Failover] No more providers available after ${attempt + 1} attempts`);
          this.stats.failedFailovers++;
          throw error;
        }
        
        const nextId = nextProvider.uuid || nextProvider.id || nextProvider;
        console.log(`[Failover] Switching from ${currentProvider} to ${nextId} (attempt ${attempt + 1})`);
        
        this.stats.totalFailovers++;
        this._recordFailover(currentProvider, nextId, false);
        
        // Notify callback
        if (onFailover) {
          try {
            await onFailover(currentProvider, nextId, error);
          } catch (e) {
            // Ignore callback errors
          }
        }
        
        currentProvider = nextId;
        attempt++;
      }
    }
    
    throw lastError;
  }

  /**
   * Execute streaming request with failover
   * Note: Mid-stream failover is complex - this restarts the stream
   */
  async *executeStreamWithFailover(streamFactory, options = {}) {
    const {
      providerId,
      availableProviders = [],
      traceId,
      onFailover,
      bufferSize = 50, // Number of chunks to buffer for potential replay
    } = options;
    
    let currentProvider = providerId;
    let excludedProviders = [];
    let attempt = 0;
    let totalChunksYielded = 0;
    let buffer = [];
    
    while (attempt <= this.maxRetries) {
      try {
        // Check circuit breaker
        if (!circuitBreaker.canExecute(currentProvider)) {
          throw new Error(`Circuit open for ${currentProvider}`);
        }
        
        // Get stream
        const stream = await streamFactory(currentProvider);
        
        // Process stream
        for await (const chunk of stream) {
          // Buffer recent chunks
          buffer.push(chunk);
          if (buffer.length > bufferSize) {
            buffer.shift();
          }
          
          totalChunksYielded++;
          yield chunk;
        }
        
        // Success
        circuitBreaker.recordSuccess(currentProvider);
        
        if (attempt > 0) {
          this.stats.successfulFailovers++;
        }
        
        return;
        
      } catch (error) {
        // Record failure
        circuitBreaker.recordFailure(currentProvider, error);
        
        // Check if retryable and if we haven't yielded too much
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // If we've yielded significant content, don't restart
        if (totalChunksYielded > bufferSize) {
          console.log(`[Failover] Too many chunks yielded (${totalChunksYielded}), cannot restart stream`);
          throw error;
        }
        
        // Try failover
        excludedProviders.push(currentProvider);
        const nextProvider = this.getNextProvider(
          currentProvider,
          availableProviders,
          excludedProviders
        );
        
        if (!nextProvider) {
          this.stats.failedFailovers++;
          throw error;
        }
        
        const nextId = nextProvider.uuid || nextProvider.id || nextProvider;
        console.log(`[Failover] Stream error, switching from ${currentProvider} to ${nextId}`);
        
        this.stats.totalFailovers++;
        
        if (onFailover) {
          try {
            await onFailover(currentProvider, nextId, error);
          } catch (e) {
            // Ignore
          }
        }
        
        currentProvider = nextId;
        attempt++;
        
        // Reset buffer for new attempt
        buffer = [];
      }
    }
  }

  /**
   * Record failover event
   */
  _recordFailover(fromProvider, toProvider, success) {
    this.failoverHistory.push({
      timestamp: Date.now(),
      fromProvider,
      toProvider,
      success,
    });
    
    if (this.failoverHistory.length > this.maxHistorySize) {
      this.failoverHistory.shift();
    }
  }

  /**
   * Get failover statistics
   */
  getStats() {
    return {
      ...this.stats,
      recentFailovers: this.failoverHistory.slice(-10),
      providerPriorities: Object.fromEntries(this.providerPriority),
    };
  }

  /**
   * Reset statistics
   */
  reset() {
    this.stats = {
      totalFailovers: 0,
      successfulFailovers: 0,
      failedFailovers: 0,
    };
    this.failoverHistory = [];
  }
}

export const autoFailover = new AutoFailover();
export { AutoFailover };
