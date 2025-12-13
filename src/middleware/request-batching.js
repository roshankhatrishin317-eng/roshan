/**
 * Request Batching
 * Batch multiple small requests into single API calls
 * Reduces overhead and improves throughput for high-volume scenarios
 */

class RequestBatcher {
  constructor(options = {}) {
    this.maxBatchSize = options.maxBatchSize || 10;
    this.maxWaitMs = options.maxWaitMs || 100; // Max time to wait for batch
    this.enabled = options.enabled !== false;
    
    // Batches by provider+model
    this.batches = new Map();
    
    this.stats = {
      totalRequests: 0,
      totalBatches: 0,
      avgBatchSize: 0,
      requestsSaved: 0, // Requests saved by batching
    };
    
    this._batchSizes = [];
  }

  /**
   * Generate batch key
   */
  _getBatchKey(provider, model) {
    return `${provider}:${model}`;
  }

  /**
   * Add request to batch
   */
  async addToBatch(provider, model, requestBody, executor) {
    if (!this.enabled || requestBody.stream) {
      // Don't batch streaming requests
      return executor(requestBody);
    }
    
    this.stats.totalRequests++;
    const key = this._getBatchKey(provider, model);
    
    // Get or create batch
    if (!this.batches.has(key)) {
      this.batches.set(key, {
        requests: [],
        timer: null,
        executor: null,
      });
    }
    
    const batch = this.batches.get(key);
    
    // Store batch executor on first request
    if (!batch.executor) {
      batch.executor = executor;
    }
    
    return new Promise((resolve, reject) => {
      batch.requests.push({
        requestBody,
        resolve,
        reject,
      });
      
      // Start timer on first request
      if (!batch.timer) {
        batch.timer = setTimeout(() => {
          this._executeBatch(key);
        }, this.maxWaitMs);
      }
      
      // Execute immediately if batch is full
      if (batch.requests.length >= this.maxBatchSize) {
        clearTimeout(batch.timer);
        this._executeBatch(key);
      }
    });
  }

  /**
   * Execute a batch of requests
   */
  async _executeBatch(key) {
    const batch = this.batches.get(key);
    if (!batch || batch.requests.length === 0) return;
    
    const requests = batch.requests;
    const executor = batch.executor;
    
    // Clear batch
    this.batches.delete(key);
    
    this.stats.totalBatches++;
    this._batchSizes.push(requests.length);
    
    // Keep last 100 batch sizes for average calculation
    if (this._batchSizes.length > 100) {
      this._batchSizes.shift();
    }
    
    // Calculate requests saved (batch of N saves N-1 request overhead)
    if (requests.length > 1) {
      this.stats.requestsSaved += requests.length - 1;
    }
    
    // Update average
    this.stats.avgBatchSize = 
      this._batchSizes.reduce((a, b) => a + b, 0) / this._batchSizes.length;
    
    if (requests.length === 1) {
      // Single request, execute normally
      try {
        const result = await executor(requests[0].requestBody);
        requests[0].resolve(result);
      } catch (error) {
        requests[0].reject(error);
      }
      return;
    }
    
    console.log(`[Batcher] Executing batch of ${requests.length} requests`);
    
    // For multiple requests, we have options:
    // 1. Execute in parallel (current implementation)
    // 2. Use batch API if provider supports it (OpenAI has batch API)
    
    // Execute all requests in parallel
    const results = await Promise.allSettled(
      requests.map(req => executor(req.requestBody))
    );
    
    // Resolve/reject individual requests
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        requests[index].resolve(result.value);
      } else {
        requests[index].reject(result.reason);
      }
    });
  }

  /**
   * Create batched request that combines multiple prompts
   * Note: This creates a single request with multiple completions
   * Only works with certain API configurations
   */
  combineBatchRequest(requests, model) {
    // This is a simplified example - actual implementation depends on API
    // OpenAI's Chat API doesn't natively support batching in a single request
    // But embeddings API and some others do
    
    return {
      model,
      // Some APIs support 'n' parameter for multiple completions
      n: requests.length,
      // Or array of inputs for embedding-style APIs
      input: requests.map(r => {
        if (r.messages) {
          return r.messages.map(m => m.content).join('\n');
        }
        return r.prompt || '';
      }),
    };
  }

  /**
   * Flush all pending batches
   */
  async flush() {
    const keys = Array.from(this.batches.keys());
    await Promise.all(keys.map(key => this._executeBatch(key)));
  }

  /**
   * Get statistics
   */
  getStats() {
    const pendingBatches = {};
    for (const [key, batch] of this.batches) {
      pendingBatches[key] = batch.requests.length;
    }
    
    return {
      ...this.stats,
      avgBatchSize: this.stats.avgBatchSize.toFixed(2),
      pendingBatches,
      pendingRequests: Array.from(this.batches.values())
        .reduce((sum, b) => sum + b.requests.length, 0),
      enabled: this.enabled,
      maxBatchSize: this.maxBatchSize,
      maxWaitMs: this.maxWaitMs,
    };
  }

  /**
   * Enable/disable batching
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    
    if (!enabled) {
      // Flush pending batches
      this.flush();
    }
  }

  /**
   * Shutdown - flush all pending
   */
  async shutdown() {
    await this.flush();
  }
}

/**
 * Embedding-specific batcher
 * Many embedding APIs support true batching
 */
class EmbeddingBatcher extends RequestBatcher {
  constructor(options = {}) {
    super({
      maxBatchSize: options.maxBatchSize || 100, // Embedding APIs often support large batches
      maxWaitMs: options.maxWaitMs || 50,
      ...options,
    });
  }

  /**
   * Execute batch of embeddings
   */
  async _executeBatch(key) {
    const batch = this.batches.get(key);
    if (!batch || batch.requests.length === 0) return;
    
    const requests = batch.requests;
    const executor = batch.executor;
    
    this.batches.delete(key);
    this.stats.totalBatches++;
    
    if (requests.length === 1) {
      try {
        const result = await executor(requests[0].requestBody);
        requests[0].resolve(result);
      } catch (error) {
        requests[0].reject(error);
      }
      return;
    }
    
    console.log(`[EmbeddingBatcher] Batching ${requests.length} embedding requests`);
    
    // Combine into single batch request
    const combinedRequest = {
      model: requests[0].requestBody.model,
      input: requests.map(r => r.requestBody.input).flat(),
    };
    
    try {
      const batchResult = await executor(combinedRequest);
      
      // Distribute results back to individual requests
      let resultIndex = 0;
      for (let i = 0; i < requests.length; i++) {
        const inputCount = Array.isArray(requests[i].requestBody.input)
          ? requests[i].requestBody.input.length
          : 1;
        
        const individualResult = {
          ...batchResult,
          data: batchResult.data.slice(resultIndex, resultIndex + inputCount),
        };
        
        requests[i].resolve(individualResult);
        resultIndex += inputCount;
      }
      
      this.stats.requestsSaved += requests.length - 1;
      
    } catch (error) {
      // If batch fails, try individual requests
      console.log(`[EmbeddingBatcher] Batch failed, falling back to individual requests`);
      
      const results = await Promise.allSettled(
        requests.map(req => executor(req.requestBody))
      );
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          requests[index].resolve(result.value);
        } else {
          requests[index].reject(result.reason);
        }
      });
    }
  }
}

export const requestBatcher = new RequestBatcher();
export const embeddingBatcher = new EmbeddingBatcher();
export { RequestBatcher, EmbeddingBatcher };
