/**
 * Webhook Notifications
 * Send async notifications to external endpoints for events
 */

import { fetch } from 'undici';
import { createHash, createHmac } from 'crypto';

class WebhookManager {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.webhooks = new Map(); // webhookId -> webhook config
    this.queue = [];
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 5000;
    
    this.stats = {
      totalSent: 0,
      totalFailed: 0,
      totalRetried: 0,
      byEvent: {},
    };
    
    // Process queue periodically
    this.processInterval = setInterval(() => this._processQueue(), 1000);
    this.isProcessing = false;
  }

  /**
   * Register a webhook
   */
  register(config) {
    const {
      id,
      url,
      events = ['*'], // Event types to subscribe to
      secret,          // Optional secret for signing
      headers = {},    // Custom headers
      enabled = true,
    } = config;
    
    if (!id || !url) {
      throw new Error('Webhook must have id and url');
    }
    
    const webhook = {
      id,
      url,
      events: new Set(events),
      secret,
      headers,
      enabled,
      createdAt: Date.now(),
      lastTriggered: null,
      successCount: 0,
      failureCount: 0,
    };
    
    this.webhooks.set(id, webhook);
    console.log(`[Webhooks] Registered webhook: ${id} -> ${url}`);
    
    return webhook;
  }

  /**
   * Unregister a webhook
   */
  unregister(webhookId) {
    this.webhooks.delete(webhookId);
  }

  /**
   * Trigger webhooks for an event
   */
  async trigger(event, data = {}) {
    if (!this.enabled) return;
    
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };
    
    // Find matching webhooks
    for (const webhook of this.webhooks.values()) {
      if (!webhook.enabled) continue;
      if (!webhook.events.has('*') && !webhook.events.has(event)) continue;
      
      // Add to queue
      this.queue.push({
        webhookId: webhook.id,
        payload,
        attempts: 0,
        createdAt: Date.now(),
      });
    }
    
    // Enforce queue limit
    while (this.queue.length > this.maxQueueSize) {
      this.queue.shift();
    }
    
    this.stats.byEvent[event] = (this.stats.byEvent[event] || 0) + 1;
  }

  /**
   * Process webhook queue
   */
  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      // Process up to 10 webhooks at a time
      const batch = this.queue.splice(0, 10);
      
      await Promise.allSettled(
        batch.map(item => this._sendWebhook(item))
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Send a webhook
   */
  async _sendWebhook(queueItem) {
    const webhook = this.webhooks.get(queueItem.webhookId);
    if (!webhook) return;
    
    const { payload } = queueItem;
    const body = JSON.stringify(payload);
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'AIClient-Webhook/1.0',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': payload.timestamp,
      ...webhook.headers,
    };
    
    // Sign payload if secret is configured
    if (webhook.secret) {
      const signature = this._signPayload(body, webhook.secret);
      headers['X-Webhook-Signature'] = signature;
    }
    
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30000), // 30s timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      // Success
      webhook.lastTriggered = Date.now();
      webhook.successCount++;
      this.stats.totalSent++;
      
    } catch (error) {
      queueItem.attempts++;
      
      // Retry if attempts remaining
      if (queueItem.attempts < this.retryAttempts) {
        this.stats.totalRetried++;
        
        // Add back to queue with delay
        setTimeout(() => {
          this.queue.push(queueItem);
        }, this.retryDelay * queueItem.attempts);
        
        console.warn(`[Webhooks] Retry ${queueItem.attempts}/${this.retryAttempts} for ${webhook.id}: ${error.message}`);
      } else {
        // Final failure
        webhook.failureCount++;
        this.stats.totalFailed++;
        console.error(`[Webhooks] Failed to send webhook ${webhook.id}: ${error.message}`);
      }
    }
  }

  /**
   * Sign payload with HMAC-SHA256
   */
  _signPayload(payload, secret) {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return 'sha256=' + hmac.digest('hex');
  }

  /**
   * Verify webhook signature (for incoming webhooks)
   */
  verifySignature(payload, signature, secret) {
    const expected = this._signPayload(payload, secret);
    return signature === expected;
  }

  /**
   * Common event types
   */
  static Events = {
    REQUEST_COMPLETED: 'request.completed',
    REQUEST_FAILED: 'request.failed',
    PROVIDER_ERROR: 'provider.error',
    PROVIDER_RECOVERED: 'provider.recovered',
    CIRCUIT_OPENED: 'circuit.opened',
    CIRCUIT_CLOSED: 'circuit.closed',
    ANOMALY_DETECTED: 'anomaly.detected',
    RATE_LIMIT_HIT: 'rate_limit.hit',
    COST_THRESHOLD: 'cost.threshold',
    QUALITY_LOW: 'quality.low',
  };

  /**
   * Get webhook info
   */
  getWebhook(webhookId) {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return null;
    
    return {
      id: webhook.id,
      url: webhook.url,
      events: Array.from(webhook.events),
      enabled: webhook.enabled,
      createdAt: webhook.createdAt,
      lastTriggered: webhook.lastTriggered,
      successCount: webhook.successCount,
      failureCount: webhook.failureCount,
    };
  }

  /**
   * List all webhooks
   */
  listWebhooks() {
    return Array.from(this.webhooks.keys()).map(id => this.getWebhook(id));
  }

  /**
   * Enable/disable webhook
   */
  setWebhookEnabled(webhookId, enabled) {
    const webhook = this.webhooks.get(webhookId);
    if (webhook) {
      webhook.enabled = enabled;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      webhookCount: this.webhooks.size,
      queueSize: this.queue.length,
      ...this.stats,
      webhooks: this.listWebhooks(),
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

export const webhookManager = new WebhookManager();
export { WebhookManager };
