/**
 * Smart Model Fallback
 * Automatically fallback to faster/cheaper models on timeout or errors
 * Maintains quality while improving reliability
 */

import { tokenEstimator } from './token-estimator.js';

// Model fallback chains (higher quality -> lower quality but faster)
const FALLBACK_CHAINS = {
  // OpenAI chains
  'gpt-4o': ['gpt-4o-mini', 'gpt-3.5-turbo'],
  'gpt-4-turbo': ['gpt-4o-mini', 'gpt-3.5-turbo'],
  'gpt-4': ['gpt-4o-mini', 'gpt-3.5-turbo'],
  'gpt-4o-mini': ['gpt-3.5-turbo'],
  
  // Claude chains
  'claude-3-opus': ['claude-3-sonnet', 'claude-3-haiku'],
  'claude-3-5-sonnet': ['claude-3-sonnet', 'claude-3-haiku'],
  'claude-3-7-sonnet': ['claude-3-5-sonnet', 'claude-3-haiku'],
  'claude-3-sonnet': ['claude-3-haiku'],
  
  // Gemini chains
  'gemini-2.5-pro': ['gemini-2.5-flash', 'gemini-2.0-flash'],
  'gemini-1.5-pro': ['gemini-1.5-flash', 'gemini-2.0-flash'],
  'gemini-2.5-flash': ['gemini-2.0-flash'],
};

// Model speed rankings (lower = faster)
const MODEL_SPEED_RANK = {
  'gpt-3.5-turbo': 1,
  'gpt-4o-mini': 2,
  'claude-3-haiku': 1,
  'gemini-2.0-flash': 1,
  'gemini-2.5-flash': 2,
  'gpt-4o': 3,
  'claude-3-sonnet': 3,
  'claude-3-5-sonnet': 3,
  'gemini-1.5-flash': 2,
  'gpt-4-turbo': 4,
  'gpt-4': 5,
  'claude-3-7-sonnet': 4,
  'gemini-2.5-pro': 4,
  'gemini-1.5-pro': 4,
  'claude-3-opus': 5,
};

class SmartFallback {
  constructor(options = {}) {
    this.fallbackChains = { ...FALLBACK_CHAINS, ...options.fallbackChains };
    this.speedRanks = { ...MODEL_SPEED_RANK, ...options.speedRanks };
    this.defaultTimeout = options.defaultTimeout || 30000; // 30s
    this.enabled = options.enabled !== false;
    
    // Timeout thresholds per speed rank
    this.timeoutByRank = options.timeoutByRank || {
      1: 15000,  // Fast models: 15s
      2: 20000,  // Medium models: 20s
      3: 30000,  // Standard models: 30s
      4: 45000,  // Slow models: 45s
      5: 60000,  // Very slow models: 60s
    };
    
    this.stats = {
      totalRequests: 0,
      fallbacks: 0,
      fallbacksByReason: {},
      fallbacksByModel: {},
      successAfterFallback: 0,
    };
  }

  /**
   * Get fallback chain for a model
   */
  getFallbackChain(model) {
    // Exact match
    if (this.fallbackChains[model]) {
      return this.fallbackChains[model];
    }
    
    // Partial match
    const lower = model.toLowerCase();
    for (const [key, chain] of Object.entries(this.fallbackChains)) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
        return chain;
      }
    }
    
    return [];
  }

  /**
   * Get timeout for a model based on speed rank
   */
  getTimeout(model) {
    const rank = this._getSpeedRank(model);
    return this.timeoutByRank[rank] || this.defaultTimeout;
  }

  /**
   * Get speed rank for model
   */
  _getSpeedRank(model) {
    if (this.speedRanks[model]) {
      return this.speedRanks[model];
    }
    
    const lower = model.toLowerCase();
    for (const [key, rank] of Object.entries(this.speedRanks)) {
      if (lower.includes(key.toLowerCase())) {
        return rank;
      }
    }
    
    return 3; // Default to standard
  }

  /**
   * Execute with smart fallback
   */
  async executeWithFallback(model, requestBody, executor, options = {}) {
    if (!this.enabled) {
      return executor(model, requestBody);
    }
    
    this.stats.totalRequests++;
    const chain = [model, ...this.getFallbackChain(model)];
    const maxAttempts = options.maxAttempts || chain.length;
    
    let lastError = null;
    
    for (let i = 0; i < Math.min(maxAttempts, chain.length); i++) {
      const currentModel = chain[i];
      const timeout = options.timeout || this.getTimeout(currentModel);
      
      try {
        // Adjust request for fallback model if needed
        const adjustedRequest = i > 0 
          ? this._adjustRequestForModel(requestBody, currentModel)
          : requestBody;
        
        // Execute with timeout
        const result = await this._executeWithTimeout(
          () => executor(currentModel, adjustedRequest),
          timeout
        );
        
        if (i > 0) {
          this.stats.successAfterFallback++;
          console.log(`[SmartFallback] Success with fallback model: ${currentModel}`);
        }
        
        return {
          result,
          model: currentModel,
          wasFallback: i > 0,
          attemptNumber: i + 1,
        };
        
      } catch (error) {
        lastError = error;
        
        const reason = this._categorizeError(error);
        this.stats.fallbacksByReason[reason] = (this.stats.fallbacksByReason[reason] || 0) + 1;
        
        if (i < chain.length - 1) {
          this.stats.fallbacks++;
          this.stats.fallbacksByModel[currentModel] = (this.stats.fallbacksByModel[currentModel] || 0) + 1;
          
          console.log(`[SmartFallback] ${currentModel} failed (${reason}), trying ${chain[i + 1]}`);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Execute with timeout
   */
  async _executeWithTimeout(executor, timeout) {
    return Promise.race([
      executor(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      }),
    ]);
  }

  /**
   * Adjust request for fallback model
   */
  _adjustRequestForModel(requestBody, model) {
    const adjusted = { ...requestBody };
    
    // Check if request fits in new model's context
    const check = tokenEstimator.checkFits(adjusted, model, adjusted.max_tokens);
    
    if (!check.fits) {
      // Truncate to fit
      const truncated = tokenEstimator.truncateToFit(adjusted, model);
      Object.assign(adjusted, truncated.requestBody);
      
      // Adjust max_tokens
      adjusted.max_tokens = tokenEstimator.suggestMaxTokens(adjusted, model);
    }
    
    return adjusted;
  }

  /**
   * Categorize error for stats
   */
  _categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('rate') || message.includes('429')) return 'rate_limit';
    if (message.includes('context') || message.includes('token')) return 'context_overflow';
    if (message.includes('500') || message.includes('502') || message.includes('503')) return 'server_error';
    if (message.includes('network') || message.includes('connect')) return 'network_error';
    
    return 'other';
  }

  /**
   * Get faster alternative for a model
   */
  getFasterAlternative(model) {
    const chain = this.getFallbackChain(model);
    
    if (chain.length === 0) return null;
    
    // Return the fastest in the chain
    const ranked = chain.map(m => ({
      model: m,
      rank: this._getSpeedRank(m),
    })).sort((a, b) => a.rank - b.rank);
    
    return ranked[0]?.model || null;
  }

  /**
   * Get model recommendation based on latency requirements
   */
  recommendModel(originalModel, maxLatencyMs) {
    // Estimate latency based on speed rank
    const estimatedLatency = {
      1: 2000,   // ~2s
      2: 5000,   // ~5s
      3: 10000,  // ~10s
      4: 20000,  // ~20s
      5: 30000,  // ~30s
    };
    
    const chain = [originalModel, ...this.getFallbackChain(originalModel)];
    
    for (const model of chain) {
      const rank = this._getSpeedRank(model);
      if (estimatedLatency[rank] <= maxLatencyMs) {
        return model;
      }
    }
    
    // Return fastest available
    return chain[chain.length - 1];
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      fallbackRate: this.stats.totalRequests > 0
        ? ((this.stats.fallbacks / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      recoveryRate: this.stats.fallbacks > 0
        ? ((this.stats.successAfterFallback / this.stats.fallbacks) * 100).toFixed(2) + '%'
        : 'N/A',
      enabled: this.enabled,
    };
  }

  /**
   * Enable/disable
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

export const smartFallback = new SmartFallback();
export { SmartFallback, FALLBACK_CHAINS, MODEL_SPEED_RANK };
