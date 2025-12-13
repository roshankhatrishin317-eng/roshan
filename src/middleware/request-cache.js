import { createHash } from 'crypto';

/**
 * High-performance LRU Request Cache with TTL
 * Caches identical API requests to reduce costs and latency
 */
class RequestCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes default
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
    
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
  }

  /**
   * Generate cache key from request
   */
  _generateKey(provider, model, requestBody) {
    const normalized = {
      provider,
      model,
      messages: requestBody.messages,
      temperature: requestBody.temperature || 1,
      max_tokens: requestBody.max_tokens,
      top_p: requestBody.top_p,
      // Exclude stream flag from cache key
    };
    const hash = createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
    return hash.substring(0, 32);
  }

  /**
   * Get cached response if exists and not expired
   */
  get(provider, model, requestBody) {
    const key = this._generateKey(provider, model, requestBody);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hits++;
    return entry.response;
  }

  /**
   * Store response in cache
   */
  set(provider, model, requestBody, response, ttl = null) {
    // Don't cache streaming responses or errors
    if (requestBody.stream || response.error) {
      return;
    }
    
    const key = this._generateKey(provider, model, requestBody);
    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
    
    this.cache.set(key, {
      response,
      expiresAt,
      createdAt: Date.now(),
      provider,
      model,
    });
    
    this.stats.size = this.cache.size;
  }

  /**
   * Check if request might be cacheable
   */
  isCacheable(requestBody) {
    // Don't cache streaming requests
    if (requestBody.stream) return false;
    // Don't cache if temperature > 0 (non-deterministic)
    if (requestBody.temperature && requestBody.temperature > 0) return false;
    return true;
  }

  /**
   * Invalidate cache entry
   */
  invalidate(provider, model, requestBody) {
    const key = this._generateKey(provider, model, requestBody);
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Cleanup expired entries
   */
  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    this.stats.size = this.cache.size;
    if (cleaned > 0) {
      console.log(`[Cache] Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      entries: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Shutdown cleanup
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

export const requestCache = new RequestCache();
export { RequestCache };
