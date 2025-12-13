/**
 * Request Replay
 * Store and replay failed requests for debugging and recovery
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

class RequestReplay {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.maxStoredRequests = options.maxStoredRequests || 1000;
    this.storePath = options.storePath || null; // Optional file storage
    
    this.requests = new Map(); // requestId -> request data
    this.failedRequests = [];
    this.replayHistory = [];
    
    this.stats = {
      totalStored: 0,
      totalFailed: 0,
      totalReplayed: 0,
      successfulReplays: 0,
    };
  }

  /**
   * Generate request ID
   */
  _generateId() {
    return createHash('sha256')
      .update(Date.now().toString() + Math.random().toString())
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Store a request for potential replay
   */
  store(requestData, metadata = {}) {
    if (!this.enabled) return null;
    
    const requestId = this._generateId();
    
    const stored = {
      id: requestId,
      timestamp: Date.now(),
      request: {
        method: requestData.method || 'POST',
        url: requestData.url,
        headers: this._sanitizeHeaders(requestData.headers),
        body: requestData.body,
      },
      metadata: {
        provider: metadata.provider,
        model: metadata.model,
        traceId: metadata.traceId,
        userId: metadata.userId,
      },
      status: 'stored',
      attempts: 0,
      lastAttempt: null,
      lastError: null,
    };
    
    this.requests.set(requestId, stored);
    this.stats.totalStored++;
    
    // Enforce max stored
    if (this.requests.size > this.maxStoredRequests) {
      const oldest = this.requests.keys().next().value;
      this.requests.delete(oldest);
    }
    
    return requestId;
  }

  /**
   * Mark request as failed
   */
  markFailed(requestId, error) {
    const request = this.requests.get(requestId);
    if (!request) return;
    
    request.status = 'failed';
    request.lastError = {
      message: error.message,
      code: error.code || error.status,
      timestamp: Date.now(),
    };
    request.attempts++;
    request.lastAttempt = Date.now();
    
    this.failedRequests.push({
      id: requestId,
      timestamp: Date.now(),
      error: request.lastError,
    });
    
    this.stats.totalFailed++;
    
    // Keep only recent failures
    if (this.failedRequests.length > 100) {
      this.failedRequests.shift();
    }
  }

  /**
   * Mark request as successful
   */
  markSuccess(requestId) {
    const request = this.requests.get(requestId);
    if (!request) return;
    
    request.status = 'success';
    request.completedAt = Date.now();
  }

  /**
   * Get request for replay
   */
  getForReplay(requestId) {
    const request = this.requests.get(requestId);
    if (!request) return null;
    
    return {
      ...request.request,
      metadata: request.metadata,
    };
  }

  /**
   * Replay a failed request
   */
  async replay(requestId, executor) {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }
    
    console.log(`[Replay] Replaying request ${requestId}`);
    
    request.status = 'replaying';
    request.attempts++;
    request.lastAttempt = Date.now();
    
    try {
      const result = await executor(request.request, request.metadata);
      
      request.status = 'success';
      request.completedAt = Date.now();
      this.stats.totalReplayed++;
      this.stats.successfulReplays++;
      
      this.replayHistory.push({
        id: requestId,
        timestamp: Date.now(),
        success: true,
        attempts: request.attempts,
      });
      
      return { success: true, result };
      
    } catch (error) {
      request.status = 'failed';
      request.lastError = {
        message: error.message,
        code: error.code || error.status,
        timestamp: Date.now(),
      };
      
      this.stats.totalReplayed++;
      
      this.replayHistory.push({
        id: requestId,
        timestamp: Date.now(),
        success: false,
        error: error.message,
        attempts: request.attempts,
      });
      
      return { success: false, error };
    }
  }

  /**
   * Replay all failed requests
   */
  async replayAllFailed(executor, options = {}) {
    const maxConcurrent = options.maxConcurrent || 5;
    const maxRetries = options.maxRetries || 3;
    
    const failed = Array.from(this.requests.values())
      .filter(r => r.status === 'failed' && r.attempts < maxRetries);
    
    console.log(`[Replay] Replaying ${failed.length} failed requests`);
    
    const results = [];
    
    // Process in batches
    for (let i = 0; i < failed.length; i += maxConcurrent) {
      const batch = failed.slice(i, i + maxConcurrent);
      const batchResults = await Promise.allSettled(
        batch.map(r => this.replay(r.id, executor))
      );
      results.push(...batchResults);
    }
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    return {
      total: failed.length,
      successful,
      failed: failed.length - successful,
    };
  }

  /**
   * Get failed requests list
   */
  getFailedRequests(limit = 50) {
    return Array.from(this.requests.values())
      .filter(r => r.status === 'failed')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        provider: r.metadata.provider,
        model: r.metadata.model,
        attempts: r.attempts,
        lastError: r.lastError,
      }));
  }

  /**
   * Sanitize headers (remove sensitive data)
   */
  _sanitizeHeaders(headers) {
    if (!headers) return {};
    
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'x-api-key', 'api-key', 'cookie'];
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  /**
   * Export failed requests to file
   */
  async exportFailed(filePath) {
    const failed = this.getFailedRequests(1000);
    await fs.writeFile(filePath, JSON.stringify(failed, null, 2));
    return failed.length;
  }

  /**
   * Clear old requests
   */
  clearOld(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleared = 0;
    
    for (const [id, request] of this.requests) {
      if (now - request.timestamp > maxAgeMs && request.status === 'success') {
        this.requests.delete(id);
        cleared++;
      }
    }
    
    return cleared;
  }

  /**
   * Get statistics
   */
  getStats() {
    const byStatus = { stored: 0, failed: 0, success: 0, replaying: 0 };
    for (const request of this.requests.values()) {
      byStatus[request.status] = (byStatus[request.status] || 0) + 1;
    }
    
    return {
      enabled: this.enabled,
      ...this.stats,
      currentStored: this.requests.size,
      byStatus,
      recentFailed: this.failedRequests.slice(-10),
      recentReplays: this.replayHistory.slice(-10),
    };
  }
}

export const requestReplay = new RequestReplay();
export { RequestReplay };
