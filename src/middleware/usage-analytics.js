/**
 * Usage Analytics
 * Detailed usage reports and insights
 */

class UsageAnalytics {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.retentionDays = options.retentionDays || 30;
    
    // Usage data storage
    this.hourlyData = new Map(); // hour -> aggregated data
    this.dailyData = new Map();  // day -> aggregated data
    this.byModel = new Map();
    this.byProvider = new Map();
    this.byClient = new Map();
    this.byEndpoint = new Map();
    
    this.maxHours = 24 * 7;  // Keep 7 days of hourly data
    this.maxDays = 90;       // Keep 90 days of daily data
    
    // Cleanup old data periodically
    this.cleanupInterval = setInterval(() => this._cleanup(), 3600000);
  }

  /**
   * Record a request
   */
  record(data) {
    if (!this.enabled) return;
    
    const {
      model,
      provider,
      clientId,
      endpoint,
      inputTokens = 0,
      outputTokens = 0,
      cost = 0,
      latency = 0,
      success = true,
      cached = false,
      timestamp = Date.now(),
    } = data;
    
    const hour = this._getHourKey(timestamp);
    const day = this._getDayKey(timestamp);
    
    // Update hourly data
    this._updateAggregation(this.hourlyData, hour, {
      inputTokens, outputTokens, cost, latency, success, cached,
    });
    
    // Update daily data
    this._updateAggregation(this.dailyData, day, {
      inputTokens, outputTokens, cost, latency, success, cached,
    });
    
    // Update by dimensions
    if (model) this._updateDimension(this.byModel, model, data);
    if (provider) this._updateDimension(this.byProvider, provider, data);
    if (clientId) this._updateDimension(this.byClient, clientId, data);
    if (endpoint) this._updateDimension(this.byEndpoint, endpoint, data);
  }

  /**
   * Update aggregation
   */
  _updateAggregation(map, key, data) {
    if (!map.has(key)) {
      map.set(key, {
        requests: 0,
        successful: 0,
        failed: 0,
        cached: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        totalLatency: 0,
      });
    }
    
    const agg = map.get(key);
    agg.requests++;
    if (data.success) agg.successful++;
    else agg.failed++;
    if (data.cached) agg.cached++;
    agg.inputTokens += data.inputTokens;
    agg.outputTokens += data.outputTokens;
    agg.totalCost += data.cost;
    agg.totalLatency += data.latency;
  }

  /**
   * Update dimension
   */
  _updateDimension(map, key, data) {
    if (!map.has(key)) {
      map.set(key, {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        totalLatency: 0,
        successful: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      });
    }
    
    const dim = map.get(key);
    dim.requests++;
    dim.inputTokens += data.inputTokens || 0;
    dim.outputTokens += data.outputTokens || 0;
    dim.totalCost += data.cost || 0;
    dim.totalLatency += data.latency || 0;
    if (data.success) dim.successful++;
    dim.lastSeen = Date.now();
  }

  /**
   * Get hour key
   */
  _getHourKey(timestamp) {
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}`;
  }

  /**
   * Get day key
   */
  _getDayKey(timestamp) {
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  /**
   * Get usage summary
   */
  getSummary(options = {}) {
    const { startDate, endDate, groupBy = 'day' } = options;
    
    const dataMap = groupBy === 'hour' ? this.hourlyData : this.dailyData;
    const results = [];
    
    for (const [key, data] of dataMap) {
      if (startDate && key < startDate) continue;
      if (endDate && key > endDate) continue;
      
      results.push({
        period: key,
        ...data,
        avgLatency: data.requests > 0 ? Math.round(data.totalLatency / data.requests) : 0,
        successRate: data.requests > 0 ? ((data.successful / data.requests) * 100).toFixed(2) + '%' : 'N/A',
        cacheHitRate: data.requests > 0 ? ((data.cached / data.requests) * 100).toFixed(2) + '%' : 'N/A',
      });
    }
    
    results.sort((a, b) => a.period.localeCompare(b.period));
    return results;
  }

  /**
   * Get usage by model
   */
  getByModel(limit = 20) {
    return this._getDimensionStats(this.byModel, limit);
  }

  /**
   * Get usage by provider
   */
  getByProvider(limit = 20) {
    return this._getDimensionStats(this.byProvider, limit);
  }

  /**
   * Get usage by client
   */
  getByClient(limit = 20) {
    return this._getDimensionStats(this.byClient, limit);
  }

  /**
   * Get usage by endpoint
   */
  getByEndpoint(limit = 20) {
    return this._getDimensionStats(this.byEndpoint, limit);
  }

  /**
   * Get dimension statistics
   */
  _getDimensionStats(map, limit) {
    const results = Array.from(map.entries()).map(([key, data]) => ({
      name: key,
      requests: data.requests,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      totalCost: data.totalCost.toFixed(4),
      avgLatency: data.requests > 0 ? Math.round(data.totalLatency / data.requests) : 0,
      successRate: data.requests > 0 ? ((data.successful / data.requests) * 100).toFixed(2) + '%' : 'N/A',
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
    }));
    
    // Sort by requests descending
    results.sort((a, b) => b.requests - a.requests);
    
    return results.slice(0, limit);
  }

  /**
   * Get top consumers
   */
  getTopConsumers(options = {}) {
    const { metric = 'cost', limit = 10 } = options;
    
    const results = Array.from(this.byClient.entries()).map(([client, data]) => ({
      client,
      requests: data.requests,
      totalTokens: data.inputTokens + data.outputTokens,
      totalCost: data.totalCost,
    }));
    
    // Sort by metric
    results.sort((a, b) => {
      if (metric === 'cost') return b.totalCost - a.totalCost;
      if (metric === 'tokens') return b.totalTokens - a.totalTokens;
      return b.requests - a.requests;
    });
    
    return results.slice(0, limit);
  }

  /**
   * Get cost breakdown
   */
  getCostBreakdown(options = {}) {
    const { groupBy = 'model' } = options;
    
    const map = groupBy === 'provider' ? this.byProvider : this.byModel;
    const total = Array.from(map.values()).reduce((sum, d) => sum + d.totalCost, 0);
    
    const breakdown = Array.from(map.entries()).map(([key, data]) => ({
      name: key,
      cost: data.totalCost,
      percentage: total > 0 ? ((data.totalCost / total) * 100).toFixed(1) + '%' : '0%',
    }));
    
    breakdown.sort((a, b) => b.cost - a.cost);
    
    return {
      total: total.toFixed(4),
      breakdown,
    };
  }

  /**
   * Get trends
   */
  getTrends(options = {}) {
    const { days = 7 } = options;
    
    const summary = this.getSummary({ groupBy: 'day' }).slice(-days);
    
    if (summary.length < 2) {
      return { trend: 'insufficient_data' };
    }
    
    const first = summary[0];
    const last = summary[summary.length - 1];
    
    return {
      period: `${days} days`,
      requests: {
        start: first.requests,
        end: last.requests,
        change: this._calculateChange(first.requests, last.requests),
      },
      cost: {
        start: first.totalCost,
        end: last.totalCost,
        change: this._calculateChange(first.totalCost, last.totalCost),
      },
      tokens: {
        start: first.inputTokens + first.outputTokens,
        end: last.inputTokens + last.outputTokens,
        change: this._calculateChange(
          first.inputTokens + first.outputTokens,
          last.inputTokens + last.outputTokens
        ),
      },
    };
  }

  /**
   * Calculate percentage change
   */
  _calculateChange(start, end) {
    if (start === 0) return end > 0 ? '+100%' : '0%';
    const change = ((end - start) / start) * 100;
    return (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
  }

  /**
   * Export report
   */
  exportReport(options = {}) {
    return {
      generatedAt: new Date().toISOString(),
      summary: this.getSummary(options),
      byModel: this.getByModel(),
      byProvider: this.getByProvider(),
      byClient: this.getByClient(10),
      costBreakdown: this.getCostBreakdown(),
      trends: this.getTrends(),
    };
  }

  /**
   * Cleanup old data
   */
  _cleanup() {
    const now = Date.now();
    
    // Cleanup hourly data
    const hourCutoff = new Date(now - this.maxHours * 3600000);
    const hourKey = this._getHourKey(hourCutoff.getTime());
    for (const key of this.hourlyData.keys()) {
      if (key < hourKey) this.hourlyData.delete(key);
    }
    
    // Cleanup daily data
    const dayCutoff = new Date(now - this.maxDays * 86400000);
    const dayKey = this._getDayKey(dayCutoff.getTime());
    for (const key of this.dailyData.keys()) {
      if (key < dayKey) this.dailyData.delete(key);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalRequests = Array.from(this.dailyData.values())
      .reduce((sum, d) => sum + d.requests, 0);
    const totalCost = Array.from(this.dailyData.values())
      .reduce((sum, d) => sum + d.totalCost, 0);
    const totalTokens = Array.from(this.dailyData.values())
      .reduce((sum, d) => sum + d.inputTokens + d.outputTokens, 0);
    
    return {
      enabled: this.enabled,
      totalRequests,
      totalCost: totalCost.toFixed(4),
      totalTokens,
      uniqueModels: this.byModel.size,
      uniqueProviders: this.byProvider.size,
      uniqueClients: this.byClient.size,
      dataPoints: {
        hourly: this.hourlyData.size,
        daily: this.dailyData.size,
      },
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
  }
}

export const usageAnalytics = new UsageAnalytics();
export { UsageAnalytics };
