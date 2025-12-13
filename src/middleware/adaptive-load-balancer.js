/**
 * Adaptive Load Balancer
 * Routes requests based on real-time latency, success rates, and cost
 * Automatically learns and adapts to provider performance
 */

class AdaptiveLoadBalancer {
  constructor(options = {}) {
    this.providers = new Map(); // providerId -> stats
    this.strategy = options.strategy || 'weighted'; // 'weighted', 'latency', 'cost', 'roundrobin'
    this.decayFactor = options.decayFactor || 0.95; // Exponential decay for old measurements
    this.minSamples = options.minSamples || 5; // Min samples before using stats
    this.updateInterval = options.updateInterval || 10000; // 10s
    
    this.stats = {
      totalRouted: 0,
      byStrategy: {},
    };
    
    // Periodic weight recalculation
    this.updateTimer = setInterval(() => this._updateWeights(), this.updateInterval);
  }

  /**
   * Register a provider
   */
  registerProvider(providerId, config = {}) {
    this.providers.set(providerId, {
      id: providerId,
      weight: config.weight || 1.0,
      calculatedWeight: 1.0,
      latencies: [], // Rolling window of recent latencies
      maxLatencyWindow: config.maxLatencyWindow || 100,
      successCount: 0,
      errorCount: 0,
      totalRequests: 0,
      avgLatency: 0,
      p95Latency: 0,
      successRate: 1.0,
      costPerToken: config.costPerToken || 1.0, // Relative cost
      isHealthy: true,
      lastUsed: null,
      capabilities: config.capabilities || [], // e.g., ['gpt-4', 'gpt-3.5-turbo']
      maxConcurrent: config.maxConcurrent || 100,
      currentConcurrent: 0,
      priority: config.priority || 0, // Higher = preferred
    });
  }

  /**
   * Record request result
   */
  recordResult(providerId, latency, success, tokens = 0) {
    const provider = this.providers.get(providerId);
    if (!provider) return;
    
    provider.totalRequests++;
    provider.lastUsed = Date.now();
    provider.currentConcurrent = Math.max(0, provider.currentConcurrent - 1);
    
    if (success) {
      provider.successCount++;
      provider.latencies.push(latency);
      
      // Keep rolling window
      if (provider.latencies.length > provider.maxLatencyWindow) {
        provider.latencies.shift();
      }
      
      // Update averages
      this._updateProviderStats(provider);
    } else {
      provider.errorCount++;
    }
    
    // Update success rate
    provider.successRate = provider.totalRequests > 0
      ? provider.successCount / provider.totalRequests
      : 1.0;
  }

  /**
   * Update provider statistics
   */
  _updateProviderStats(provider) {
    if (provider.latencies.length === 0) return;
    
    // Calculate average latency
    const sum = provider.latencies.reduce((a, b) => a + b, 0);
    provider.avgLatency = sum / provider.latencies.length;
    
    // Calculate P95 latency
    const sorted = [...provider.latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    provider.p95Latency = sorted[p95Index] || provider.avgLatency;
  }

  /**
   * Update calculated weights for all providers
   */
  _updateWeights() {
    const providers = Array.from(this.providers.values());
    
    if (providers.length === 0) return;
    
    // Get baseline stats for normalization
    const avgLatencies = providers
      .filter(p => p.latencies.length >= this.minSamples)
      .map(p => p.avgLatency);
    
    const minLatency = Math.min(...avgLatencies) || 100;
    const maxLatency = Math.max(...avgLatencies) || 1000;
    
    for (const provider of providers) {
      if (provider.latencies.length < this.minSamples) {
        // Not enough data, use base weight
        provider.calculatedWeight = provider.weight;
        continue;
      }
      
      // Calculate weight based on:
      // 1. Latency score (lower is better)
      // 2. Success rate (higher is better)
      // 3. Cost (lower is better)
      // 4. Base weight (manual override)
      
      const latencyScore = maxLatency > minLatency
        ? 1 - (provider.avgLatency - minLatency) / (maxLatency - minLatency)
        : 1;
      
      const successScore = provider.successRate;
      const costScore = 1 / (provider.costPerToken + 0.1); // Avoid division by zero
      
      // Weighted combination
      const weights = {
        latency: 0.4,
        success: 0.4,
        cost: 0.2,
      };
      
      const combinedScore = 
        latencyScore * weights.latency +
        successScore * weights.success +
        costScore * weights.cost;
      
      provider.calculatedWeight = combinedScore * provider.weight;
      
      // Apply health penalty
      if (!provider.isHealthy) {
        provider.calculatedWeight *= 0.1;
      }
      
      // Apply concurrency penalty
      if (provider.currentConcurrent >= provider.maxConcurrent * 0.8) {
        provider.calculatedWeight *= 0.5;
      }
    }
  }

  /**
   * Select best provider based on strategy
   */
  selectProvider(model = null, options = {}) {
    const strategy = options.strategy || this.strategy;
    let candidates = Array.from(this.providers.values());
    
    // Filter by model capability if specified
    if (model) {
      candidates = candidates.filter(p => 
        p.capabilities.length === 0 || p.capabilities.includes(model)
      );
    }
    
    // Filter healthy providers
    candidates = candidates.filter(p => p.isHealthy);
    
    // Filter by concurrency
    candidates = candidates.filter(p => p.currentConcurrent < p.maxConcurrent);
    
    if (candidates.length === 0) {
      return null;
    }
    
    this.stats.totalRouted++;
    this.stats.byStrategy[strategy] = (this.stats.byStrategy[strategy] || 0) + 1;
    
    let selected;
    
    switch (strategy) {
      case 'latency':
        // Select provider with lowest P95 latency
        selected = this._selectByLatency(candidates);
        break;
        
      case 'cost':
        // Select cheapest provider
        selected = this._selectByCost(candidates);
        break;
        
      case 'roundrobin':
        // Simple round robin
        selected = this._selectRoundRobin(candidates);
        break;
        
      case 'weighted':
      default:
        // Weighted random based on calculated weights
        selected = this._selectWeighted(candidates);
        break;
    }
    
    if (selected) {
      selected.currentConcurrent++;
    }
    
    return selected;
  }

  /**
   * Select by lowest latency
   */
  _selectByLatency(candidates) {
    const withLatency = candidates.filter(p => p.latencies.length >= this.minSamples);
    
    if (withLatency.length === 0) {
      // Not enough data, use weighted
      return this._selectWeighted(candidates);
    }
    
    return withLatency.reduce((best, p) => 
      p.p95Latency < best.p95Latency ? p : best
    );
  }

  /**
   * Select by lowest cost
   */
  _selectByCost(candidates) {
    return candidates.reduce((best, p) => 
      p.costPerToken < best.costPerToken ? p : best
    );
  }

  /**
   * Select round robin
   */
  _selectRoundRobin(candidates) {
    // Sort by last used time (oldest first)
    candidates.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
    return candidates[0];
  }

  /**
   * Select weighted random
   */
  _selectWeighted(candidates) {
    const totalWeight = candidates.reduce((sum, p) => sum + p.calculatedWeight, 0);
    
    if (totalWeight === 0) {
      // All weights are 0, use round robin
      return this._selectRoundRobin(candidates);
    }
    
    let random = Math.random() * totalWeight;
    
    for (const provider of candidates) {
      random -= provider.calculatedWeight;
      if (random <= 0) {
        return provider;
      }
    }
    
    return candidates[candidates.length - 1];
  }

  /**
   * Mark provider as healthy/unhealthy
   */
  setProviderHealth(providerId, isHealthy) {
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.isHealthy = isHealthy;
      this._updateWeights();
    }
  }

  /**
   * Get provider statistics
   */
  getProviderStats(providerId) {
    const provider = this.providers.get(providerId);
    if (!provider) return null;
    
    return {
      id: provider.id,
      weight: provider.weight,
      calculatedWeight: provider.calculatedWeight.toFixed(3),
      avgLatency: Math.round(provider.avgLatency),
      p95Latency: Math.round(provider.p95Latency),
      successRate: (provider.successRate * 100).toFixed(2) + '%',
      totalRequests: provider.totalRequests,
      currentConcurrent: provider.currentConcurrent,
      isHealthy: provider.isHealthy,
      costPerToken: provider.costPerToken,
    };
  }

  /**
   * Get all statistics
   */
  getStats() {
    const providerStats = {};
    for (const [id, provider] of this.providers) {
      providerStats[id] = this.getProviderStats(id);
    }
    
    return {
      strategy: this.strategy,
      ...this.stats,
      providers: providerStats,
    };
  }

  /**
   * Set routing strategy
   */
  setStrategy(strategy) {
    this.strategy = strategy;
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.updateTimer);
  }
}

export const loadBalancer = new AdaptiveLoadBalancer();
export { AdaptiveLoadBalancer };
