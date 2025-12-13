/**
 * Traffic Shadowing
 * Mirror traffic to alternate endpoints for testing without affecting production
 */

import { fetch } from 'undici';

class TrafficShadow {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.shadows = new Map();
    this.maxQueueSize = options.maxQueueSize || 1000;
    
    this.queue = [];
    this.isProcessing = false;
    
    this.stats = {
      totalShadowed: 0,
      successfulShadows: 0,
      failedShadows: 0,
      droppedRequests: 0,
    };
    
    // Process queue periodically
    this.processInterval = setInterval(() => this._processQueue(), 100);
  }

  /**
   * Create a shadow configuration
   */
  createShadow(config) {
    const {
      id,
      name,
      targetUrl,
      sampleRate = 100, // Percentage of traffic to shadow
      async = true,     // Don't wait for shadow response
      timeout = 30000,
      headers = {},
      transformRequest,
      compareResponse,
    } = config;
    
    if (!id || !targetUrl) {
      throw new Error('Shadow must have id and targetUrl');
    }
    
    const shadow = {
      id,
      name: name || id,
      targetUrl,
      sampleRate,
      async,
      timeout,
      headers,
      transformRequest,
      compareResponse,
      enabled: true,
      createdAt: Date.now(),
      stats: {
        total: 0,
        success: 0,
        failed: 0,
        comparisons: { match: 0, mismatch: 0 },
        avgLatency: 0,
      },
      latencies: [],
    };
    
    this.shadows.set(id, shadow);
    console.log(`[Shadow] Created shadow: ${name} -> ${targetUrl}`);
    
    return this._getShadowInfo(shadow);
  }

  /**
   * Shadow a request
   */
  shadow(request, response, options = {}) {
    if (!this.enabled) return;
    
    const shadowIds = options.shadows || Array.from(this.shadows.keys());
    
    for (const shadowId of shadowIds) {
      const shadow = this.shadows.get(shadowId);
      if (!shadow || !shadow.enabled) continue;
      
      // Sample rate check
      if (Math.random() * 100 > shadow.sampleRate) continue;
      
      // Queue shadow request
      if (this.queue.length >= this.maxQueueSize) {
        this.stats.droppedRequests++;
        continue;
      }
      
      this.queue.push({
        shadowId,
        request: { ...request },
        originalResponse: response,
        timestamp: Date.now(),
      });
      
      this.stats.totalShadowed++;
    }
    
    // Process immediately if not async
    if (!options.async) {
      this._processQueue();
    }
  }

  /**
   * Process shadow queue
   */
  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      // Process up to 10 at a time
      const batch = this.queue.splice(0, 10);
      
      await Promise.allSettled(
        batch.map(item => this._sendShadowRequest(item))
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Send shadow request
   */
  async _sendShadowRequest(item) {
    const shadow = this.shadows.get(item.shadowId);
    if (!shadow) return;
    
    shadow.stats.total++;
    const startTime = Date.now();
    
    try {
      // Transform request if needed
      let request = item.request;
      if (shadow.transformRequest) {
        request = shadow.transformRequest(request);
      }
      
      // Send request
      const response = await fetch(shadow.targetUrl, {
        method: request.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...shadow.headers,
          ...(request.headers || {}),
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(shadow.timeout),
      });
      
      const latency = Date.now() - startTime;
      this._recordLatency(shadow, latency);
      
      shadow.stats.success++;
      this.stats.successfulShadows++;
      
      // Compare responses if configured
      if (shadow.compareResponse && item.originalResponse) {
        const shadowBody = await response.json().catch(() => null);
        const match = shadow.compareResponse(item.originalResponse, shadowBody);
        
        if (match) {
          shadow.stats.comparisons.match++;
        } else {
          shadow.stats.comparisons.mismatch++;
        }
      }
      
    } catch (error) {
      shadow.stats.failed++;
      this.stats.failedShadows++;
      
      // Log but don't throw - shadows shouldn't affect production
      console.warn(`[Shadow] Failed ${shadow.name}: ${error.message}`);
    }
  }

  /**
   * Record latency
   */
  _recordLatency(shadow, latency) {
    shadow.latencies.push(latency);
    if (shadow.latencies.length > 100) {
      shadow.latencies.shift();
    }
    shadow.stats.avgLatency = shadow.latencies.reduce((a, b) => a + b, 0) / shadow.latencies.length;
  }

  /**
   * Enable/disable shadow
   */
  setShadowEnabled(shadowId, enabled) {
    const shadow = this.shadows.get(shadowId);
    if (shadow) {
      shadow.enabled = enabled;
    }
  }

  /**
   * Update shadow sample rate
   */
  setSampleRate(shadowId, rate) {
    const shadow = this.shadows.get(shadowId);
    if (shadow) {
      shadow.sampleRate = Math.max(0, Math.min(100, rate));
    }
  }

  /**
   * Delete shadow
   */
  deleteShadow(shadowId) {
    return this.shadows.delete(shadowId);
  }

  /**
   * Get shadow info
   */
  _getShadowInfo(shadow) {
    return {
      id: shadow.id,
      name: shadow.name,
      targetUrl: shadow.targetUrl,
      sampleRate: shadow.sampleRate,
      enabled: shadow.enabled,
      stats: {
        ...shadow.stats,
        avgLatency: Math.round(shadow.stats.avgLatency),
        successRate: shadow.stats.total > 0
          ? ((shadow.stats.success / shadow.stats.total) * 100).toFixed(1) + '%'
          : 'N/A',
      },
    };
  }

  /**
   * Get shadow
   */
  getShadow(shadowId) {
    const shadow = this.shadows.get(shadowId);
    return shadow ? this._getShadowInfo(shadow) : null;
  }

  /**
   * List shadows
   */
  listShadows() {
    return Array.from(this.shadows.values()).map(s => this._getShadowInfo(s));
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      queueSize: this.queue.length,
      ...this.stats,
      shadows: this.listShadows(),
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.processInterval);
    this.queue = [];
  }
}

export const trafficShadow = new TrafficShadow();
export { TrafficShadow };
