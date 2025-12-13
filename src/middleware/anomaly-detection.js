/**
 * Anomaly Detection
 * Detect unusual patterns in API usage, latency, errors, and costs
 * Alert on potential issues before they become critical
 */

import { EventEmitter } from 'events';

class AnomalyDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.enabled = options.enabled !== false;
    this.sensitivity = options.sensitivity || 'medium'; // 'low', 'medium', 'high'
    
    // Thresholds based on sensitivity
    this.thresholds = {
      low: { stdDevMultiplier: 4, minSamples: 100 },
      medium: { stdDevMultiplier: 3, minSamples: 50 },
      high: { stdDevMultiplier: 2, minSamples: 30 },
    };
    
    // Metrics tracking
    this.metrics = {
      latency: this._createMetricTracker(),
      errorRate: this._createMetricTracker(),
      requestRate: this._createMetricTracker(),
      tokenUsage: this._createMetricTracker(),
      cost: this._createMetricTracker(),
    };
    
    // Per-provider metrics
    this.providerMetrics = new Map();
    
    // Detected anomalies
    this.anomalies = [];
    this.maxAnomalies = 1000;
    
    this.stats = {
      totalChecks: 0,
      anomaliesDetected: 0,
      byType: {},
    };
    
    // Periodic baseline recalculation
    this.recalcInterval = setInterval(() => this._recalculateBaselines(), 60000);
  }

  /**
   * Create metric tracker
   */
  _createMetricTracker() {
    return {
      values: [],
      maxValues: 1000,
      mean: 0,
      stdDev: 0,
      min: Infinity,
      max: 0,
      baseline: null,
    };
  }

  /**
   * Record a metric value
   */
  record(metricName, value, metadata = {}) {
    if (!this.enabled) return;
    
    const metric = this.metrics[metricName];
    if (!metric) return;
    
    // Add to values
    metric.values.push({ value, timestamp: Date.now(), ...metadata });
    if (metric.values.length > metric.maxValues) {
      metric.values.shift();
    }
    
    // Update stats
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    
    // Track per-provider
    if (metadata.provider) {
      this._recordProviderMetric(metadata.provider, metricName, value);
    }
    
    // Check for anomaly
    this.stats.totalChecks++;
    const anomaly = this._checkAnomaly(metricName, value, metadata);
    
    if (anomaly) {
      this._recordAnomaly(anomaly);
    }
    
    return anomaly;
  }

  /**
   * Record provider-specific metric
   */
  _recordProviderMetric(provider, metricName, value) {
    if (!this.providerMetrics.has(provider)) {
      this.providerMetrics.set(provider, {});
    }
    
    const providerData = this.providerMetrics.get(provider);
    if (!providerData[metricName]) {
      providerData[metricName] = this._createMetricTracker();
    }
    
    const metric = providerData[metricName];
    metric.values.push({ value, timestamp: Date.now() });
    if (metric.values.length > metric.maxValues) {
      metric.values.shift();
    }
  }

  /**
   * Check for anomaly
   */
  _checkAnomaly(metricName, value, metadata) {
    const metric = this.metrics[metricName];
    const threshold = this.thresholds[this.sensitivity];
    
    // Need minimum samples for baseline
    if (metric.values.length < threshold.minSamples) {
      return null;
    }
    
    // Calculate baseline if not set
    if (!metric.baseline) {
      this._calculateBaseline(metric);
    }
    
    // Check if value is anomalous
    const { mean, stdDev } = metric.baseline;
    if (stdDev === 0) return null;
    
    const zScore = Math.abs(value - mean) / stdDev;
    
    if (zScore > threshold.stdDevMultiplier) {
      const severity = this._getSeverity(zScore, threshold.stdDevMultiplier);
      
      return {
        type: metricName,
        value,
        expected: mean,
        stdDev,
        zScore: zScore.toFixed(2),
        severity,
        direction: value > mean ? 'high' : 'low',
        timestamp: Date.now(),
        metadata,
      };
    }
    
    return null;
  }

  /**
   * Calculate baseline statistics
   */
  _calculateBaseline(metric) {
    const values = metric.values.map(v => v.value);
    
    // Calculate mean
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    
    // Calculate standard deviation
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(avgSquaredDiff);
    
    metric.baseline = { mean, stdDev, calculatedAt: Date.now() };
    metric.mean = mean;
    metric.stdDev = stdDev;
  }

  /**
   * Recalculate all baselines
   */
  _recalculateBaselines() {
    for (const metric of Object.values(this.metrics)) {
      if (metric.values.length >= this.thresholds[this.sensitivity].minSamples) {
        this._calculateBaseline(metric);
      }
    }
  }

  /**
   * Get severity based on z-score
   */
  _getSeverity(zScore, threshold) {
    if (zScore > threshold * 2) return 'critical';
    if (zScore > threshold * 1.5) return 'high';
    if (zScore > threshold) return 'medium';
    return 'low';
  }

  /**
   * Record detected anomaly
   */
  _recordAnomaly(anomaly) {
    this.anomalies.push(anomaly);
    if (this.anomalies.length > this.maxAnomalies) {
      this.anomalies.shift();
    }
    
    this.stats.anomaliesDetected++;
    this.stats.byType[anomaly.type] = (this.stats.byType[anomaly.type] || 0) + 1;
    
    console.log(`[Anomaly] Detected ${anomaly.severity} ${anomaly.type} anomaly: ${anomaly.value} (expected: ${anomaly.expected.toFixed(2)})`);
    
    // Emit event for alerting
    this.emit('anomaly', anomaly);
  }

  /**
   * Detect patterns (multiple anomalies in sequence)
   */
  detectPattern(windowMs = 300000) { // 5 minute window
    const now = Date.now();
    const recent = this.anomalies.filter(a => now - a.timestamp < windowMs);
    
    if (recent.length === 0) return null;
    
    // Group by type
    const byType = {};
    for (const anomaly of recent) {
      byType[anomaly.type] = (byType[anomaly.type] || []).concat(anomaly);
    }
    
    const patterns = [];
    
    for (const [type, anomalies] of Object.entries(byType)) {
      if (anomalies.length >= 3) {
        // Check if trending
        const values = anomalies.map(a => a.value);
        const isIncreasing = values.every((v, i) => i === 0 || v >= values[i - 1]);
        const isDecreasing = values.every((v, i) => i === 0 || v <= values[i - 1]);
        
        patterns.push({
          type,
          count: anomalies.length,
          trend: isIncreasing ? 'increasing' : isDecreasing ? 'decreasing' : 'fluctuating',
          avgSeverity: anomalies.filter(a => a.severity === 'critical' || a.severity === 'high').length / anomalies.length > 0.5 ? 'high' : 'medium',
        });
      }
    }
    
    return patterns.length > 0 ? patterns : null;
  }

  /**
   * Get anomaly summary
   */
  getSummary(windowMs = 3600000) { // 1 hour
    const now = Date.now();
    const recent = this.anomalies.filter(a => now - a.timestamp < windowMs);
    
    const byType = {};
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    
    for (const anomaly of recent) {
      byType[anomaly.type] = (byType[anomaly.type] || 0) + 1;
      bySeverity[anomaly.severity]++;
    }
    
    return {
      total: recent.length,
      byType,
      bySeverity,
      patterns: this.detectPattern(windowMs),
      oldestTimestamp: recent.length > 0 ? recent[0].timestamp : null,
      newestTimestamp: recent.length > 0 ? recent[recent.length - 1].timestamp : null,
    };
  }

  /**
   * Get baseline info for all metrics
   */
  getBaselines() {
    const baselines = {};
    
    for (const [name, metric] of Object.entries(this.metrics)) {
      baselines[name] = {
        mean: metric.mean?.toFixed(2) || 'N/A',
        stdDev: metric.stdDev?.toFixed(2) || 'N/A',
        min: metric.min === Infinity ? 'N/A' : metric.min,
        max: metric.max,
        samples: metric.values.length,
        baselineAge: metric.baseline 
          ? `${Math.round((Date.now() - metric.baseline.calculatedAt) / 1000)}s`
          : 'N/A',
      };
    }
    
    return baselines;
  }

  /**
   * Get recent anomalies
   */
  getRecentAnomalies(limit = 20) {
    return this.anomalies.slice(-limit).reverse();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      sensitivity: this.sensitivity,
      ...this.stats,
      baselines: this.getBaselines(),
      summary: this.getSummary(),
      recentAnomalies: this.getRecentAnomalies(10),
    };
  }

  /**
   * Set sensitivity
   */
  setSensitivity(level) {
    if (['low', 'medium', 'high'].includes(level)) {
      this.sensitivity = level;
    }
  }

  /**
   * Clear anomaly history
   */
  clearHistory() {
    this.anomalies = [];
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.recalcInterval);
  }
}

export const anomalyDetector = new AnomalyDetector();
export { AnomalyDetector };
