import { EventEmitter } from 'events';

/**
 * Advanced Metrics with Latency Histograms, Cost Tracking, and Prometheus Export
 */

// Cost per 1M tokens (approximate, update as needed)
const COST_PER_MILLION_TOKENS = {
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  // Claude
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-7-sonnet': { input: 3.00, output: 15.00 },
  // Gemini (free tier pricing may vary)
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  // Default fallback
  'default': { input: 1.00, output: 3.00 },
};

class LatencyHistogram {
  constructor(buckets = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]) {
    this.buckets = buckets;
    this.counts = new Array(buckets.length + 1).fill(0);
    this.values = [];
    this.maxValues = 10000; // Keep last 10k values for percentiles
    this.sum = 0;
    this.count = 0;
    this.min = Infinity;
    this.max = 0;
  }

  record(value) {
    this.sum += value;
    this.count++;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
    
    // Store value for percentile calculation
    this.values.push(value);
    if (this.values.length > this.maxValues) {
      this.values.shift();
    }
    
    // Update bucket counts
    let bucketIdx = this.buckets.findIndex(b => value <= b);
    if (bucketIdx === -1) bucketIdx = this.buckets.length;
    this.counts[bucketIdx]++;
  }

  percentile(p) {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getStats() {
    return {
      count: this.count,
      sum: this.sum,
      avg: this.count > 0 ? (this.sum / this.count).toFixed(2) : 0,
      min: this.min === Infinity ? 0 : this.min,
      max: this.max,
      p50: this.percentile(50),
      p90: this.percentile(90),
      p95: this.percentile(95),
      p99: this.percentile(99),
      buckets: this.buckets.map((b, i) => ({
        le: b,
        count: this.counts.slice(0, i + 1).reduce((a, b) => a + b, 0),
      })),
    };
  }

  reset() {
    this.counts = new Array(this.buckets.length + 1).fill(0);
    this.values = [];
    this.sum = 0;
    this.count = 0;
    this.min = Infinity;
    this.max = 0;
  }
}

class AdvancedMetrics extends EventEmitter {
  constructor() {
    super();
    
    // Request tracing
    this.traces = new Map();
    this.maxTraces = 1000;
    
    // Per-provider metrics
    this.providerMetrics = new Map();
    
    // Per-model metrics
    this.modelMetrics = new Map();
    
    // Global latency histogram
    this.globalLatency = new LatencyHistogram();
    
    // Cost tracking
    this.costs = {
      total: 0,
      byProvider: {},
      byModel: {},
      hourly: [],
    };
    
    // Time-series data (last 24 hours, per minute)
    this.timeSeries = {
      requests: [],
      tokens: [],
      latency: [],
      errors: [],
    };
    this.maxTimeSeriesPoints = 1440; // 24 hours * 60 minutes
    
    // Record timestamp for hourly cost tracking
    this.lastHourlyReset = Date.now();
    this.currentHourlyCost = 0;
    
    // Periodic aggregation
    setInterval(() => this._aggregateMinute(), 60000);
    setInterval(() => this._aggregateHour(), 3600000);
  }

  /**
   * Get or create provider metrics
   */
  _getProviderMetrics(providerId) {
    if (!this.providerMetrics.has(providerId)) {
      this.providerMetrics.set(providerId, {
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        latency: new LatencyHistogram(),
        ttfb: new LatencyHistogram(), // Time to first byte
        cost: 0,
      });
    }
    return this.providerMetrics.get(providerId);
  }

  /**
   * Get or create model metrics
   */
  _getModelMetrics(model) {
    if (!this.modelMetrics.has(model)) {
      this.modelMetrics.set(model, {
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        latency: new LatencyHistogram(),
        cost: 0,
      });
    }
    return this.modelMetrics.get(model);
  }

  /**
   * Start tracking a request
   */
  startTrace(traceId, metadata = {}) {
    this.traces.set(traceId, {
      startTime: Date.now(),
      ttfb: null,
      endTime: null,
      provider: metadata.provider,
      model: metadata.model,
      inputTokens: 0,
      outputTokens: 0,
      error: null,
      ...metadata,
    });
    
    // Cleanup old traces
    if (this.traces.size > this.maxTraces) {
      const oldestKey = this.traces.keys().next().value;
      this.traces.delete(oldestKey);
    }
    
    return traceId;
  }

  /**
   * Record time to first byte
   */
  recordTTFB(traceId) {
    const trace = this.traces.get(traceId);
    if (trace && !trace.ttfb) {
      trace.ttfb = Date.now() - trace.startTime;
      
      if (trace.provider) {
        const pm = this._getProviderMetrics(trace.provider);
        pm.ttfb.record(trace.ttfb);
      }
    }
  }

  /**
   * Record tokens for a trace
   */
  recordTokens(traceId, inputTokens, outputTokens) {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.inputTokens += inputTokens;
      trace.outputTokens += outputTokens;
    }
  }

  /**
   * End trace and record all metrics
   */
  endTrace(traceId, error = null) {
    const trace = this.traces.get(traceId);
    if (!trace) return;
    
    trace.endTime = Date.now();
    trace.error = error;
    const latency = trace.endTime - trace.startTime;
    
    // Record global latency
    this.globalLatency.record(latency);
    
    // Record provider metrics
    if (trace.provider) {
      const pm = this._getProviderMetrics(trace.provider);
      pm.requests++;
      pm.inputTokens += trace.inputTokens;
      pm.outputTokens += trace.outputTokens;
      pm.latency.record(latency);
      if (error) pm.errors++;
      
      // Calculate cost
      const cost = this._calculateCost(trace.model, trace.inputTokens, trace.outputTokens);
      pm.cost += cost;
      this.costs.byProvider[trace.provider] = (this.costs.byProvider[trace.provider] || 0) + cost;
    }
    
    // Record model metrics
    if (trace.model) {
      const mm = this._getModelMetrics(trace.model);
      mm.requests++;
      mm.inputTokens += trace.inputTokens;
      mm.outputTokens += trace.outputTokens;
      mm.latency.record(latency);
      if (error) mm.errors++;
      
      const cost = this._calculateCost(trace.model, trace.inputTokens, trace.outputTokens);
      mm.cost += cost;
      this.costs.byModel[trace.model] = (this.costs.byModel[trace.model] || 0) + cost;
      this.costs.total += cost;
      this.currentHourlyCost += cost;
    }
    
    this.emit('trace:end', trace);
  }

  /**
   * Calculate cost for tokens
   */
  _calculateCost(model, inputTokens, outputTokens) {
    // Find matching cost config
    let costConfig = COST_PER_MILLION_TOKENS.default;
    for (const [key, config] of Object.entries(COST_PER_MILLION_TOKENS)) {
      if (model && model.toLowerCase().includes(key.toLowerCase())) {
        costConfig = config;
        break;
      }
    }
    
    const inputCost = (inputTokens / 1000000) * costConfig.input;
    const outputCost = (outputTokens / 1000000) * costConfig.output;
    return inputCost + outputCost;
  }

  /**
   * Aggregate per-minute metrics
   */
  _aggregateMinute() {
    const now = Date.now();
    
    // Calculate current minute stats
    let totalRequests = 0;
    let totalTokens = 0;
    let totalErrors = 0;
    let latencySum = 0;
    let latencyCount = 0;
    
    for (const [, pm] of this.providerMetrics) {
      totalRequests += pm.requests;
      totalTokens += pm.inputTokens + pm.outputTokens;
      totalErrors += pm.errors;
      latencySum += pm.latency.sum;
      latencyCount += pm.latency.count;
    }
    
    // Add to time series
    const point = {
      timestamp: now,
      value: totalRequests,
    };
    
    this.timeSeries.requests.push({ timestamp: now, value: totalRequests });
    this.timeSeries.tokens.push({ timestamp: now, value: totalTokens });
    this.timeSeries.latency.push({ timestamp: now, value: latencyCount > 0 ? latencySum / latencyCount : 0 });
    this.timeSeries.errors.push({ timestamp: now, value: totalErrors });
    
    // Trim to max points
    for (const key of Object.keys(this.timeSeries)) {
      if (this.timeSeries[key].length > this.maxTimeSeriesPoints) {
        this.timeSeries[key] = this.timeSeries[key].slice(-this.maxTimeSeriesPoints);
      }
    }
  }

  /**
   * Aggregate hourly cost
   */
  _aggregateHour() {
    this.costs.hourly.push({
      timestamp: this.lastHourlyReset,
      cost: this.currentHourlyCost,
    });
    
    // Keep last 24 hours
    if (this.costs.hourly.length > 24) {
      this.costs.hourly.shift();
    }
    
    this.currentHourlyCost = 0;
    this.lastHourlyReset = Date.now();
  }

  /**
   * Get comprehensive stats
   */
  getStats() {
    const providerStats = {};
    for (const [id, pm] of this.providerMetrics) {
      providerStats[id] = {
        requests: pm.requests,
        errors: pm.errors,
        errorRate: pm.requests > 0 ? ((pm.errors / pm.requests) * 100).toFixed(2) + '%' : '0%',
        inputTokens: pm.inputTokens,
        outputTokens: pm.outputTokens,
        latency: pm.latency.getStats(),
        ttfb: pm.ttfb.getStats(),
        cost: `$${pm.cost.toFixed(4)}`,
      };
    }
    
    const modelStats = {};
    for (const [id, mm] of this.modelMetrics) {
      modelStats[id] = {
        requests: mm.requests,
        errors: mm.errors,
        inputTokens: mm.inputTokens,
        outputTokens: mm.outputTokens,
        latency: mm.latency.getStats(),
        cost: `$${mm.cost.toFixed(4)}`,
      };
    }
    
    return {
      global: {
        latency: this.globalLatency.getStats(),
      },
      providers: providerStats,
      models: modelStats,
      costs: {
        total: `$${this.costs.total.toFixed(4)}`,
        currentHour: `$${this.currentHourlyCost.toFixed(4)}`,
        byProvider: Object.fromEntries(
          Object.entries(this.costs.byProvider).map(([k, v]) => [k, `$${v.toFixed(4)}`])
        ),
        byModel: Object.fromEntries(
          Object.entries(this.costs.byModel).map(([k, v]) => [k, `$${v.toFixed(4)}`])
        ),
        hourly: this.costs.hourly,
      },
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheus() {
    const lines = [];
    const timestamp = Date.now();
    
    // Global latency histogram
    const gl = this.globalLatency.getStats();
    lines.push('# HELP llm_request_duration_seconds Request latency in seconds');
    lines.push('# TYPE llm_request_duration_seconds histogram');
    for (const bucket of gl.buckets) {
      lines.push(`llm_request_duration_seconds_bucket{le="${bucket.le / 1000}"} ${bucket.count}`);
    }
    lines.push(`llm_request_duration_seconds_bucket{le="+Inf"} ${gl.count}`);
    lines.push(`llm_request_duration_seconds_sum ${gl.sum / 1000}`);
    lines.push(`llm_request_duration_seconds_count ${gl.count}`);
    
    // Per-provider metrics
    lines.push('');
    lines.push('# HELP llm_provider_requests_total Total requests per provider');
    lines.push('# TYPE llm_provider_requests_total counter');
    for (const [id, pm] of this.providerMetrics) {
      lines.push(`llm_provider_requests_total{provider="${id}"} ${pm.requests}`);
    }
    
    lines.push('');
    lines.push('# HELP llm_provider_errors_total Total errors per provider');
    lines.push('# TYPE llm_provider_errors_total counter');
    for (const [id, pm] of this.providerMetrics) {
      lines.push(`llm_provider_errors_total{provider="${id}"} ${pm.errors}`);
    }
    
    lines.push('');
    lines.push('# HELP llm_tokens_total Total tokens processed');
    lines.push('# TYPE llm_tokens_total counter');
    for (const [id, pm] of this.providerMetrics) {
      lines.push(`llm_tokens_total{provider="${id}",type="input"} ${pm.inputTokens}`);
      lines.push(`llm_tokens_total{provider="${id}",type="output"} ${pm.outputTokens}`);
    }
    
    lines.push('');
    lines.push('# HELP llm_cost_dollars_total Total cost in USD');
    lines.push('# TYPE llm_cost_dollars_total counter');
    lines.push(`llm_cost_dollars_total ${this.costs.total}`);
    
    // Per-provider latency percentiles
    lines.push('');
    lines.push('# HELP llm_provider_latency_p99_seconds 99th percentile latency per provider');
    lines.push('# TYPE llm_provider_latency_p99_seconds gauge');
    for (const [id, pm] of this.providerMetrics) {
      const stats = pm.latency.getStats();
      lines.push(`llm_provider_latency_p99_seconds{provider="${id}"} ${stats.p99 / 1000}`);
    }
    
    lines.push('');
    lines.push('# HELP llm_provider_latency_p95_seconds 95th percentile latency per provider');
    lines.push('# TYPE llm_provider_latency_p95_seconds gauge');
    for (const [id, pm] of this.providerMetrics) {
      const stats = pm.latency.getStats();
      lines.push(`llm_provider_latency_p95_seconds{provider="${id}"} ${stats.p95 / 1000}`);
    }
    
    lines.push('');
    lines.push('# HELP llm_provider_latency_p50_seconds 50th percentile latency per provider');
    lines.push('# TYPE llm_provider_latency_p50_seconds gauge');
    for (const [id, pm] of this.providerMetrics) {
      const stats = pm.latency.getStats();
      lines.push(`llm_provider_latency_p50_seconds{provider="${id}"} ${stats.p50 / 1000}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId) {
    return this.traces.get(traceId);
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.traces.clear();
    this.providerMetrics.clear();
    this.modelMetrics.clear();
    this.globalLatency.reset();
    this.costs = {
      total: 0,
      byProvider: {},
      byModel: {},
      hourly: [],
    };
    this.timeSeries = {
      requests: [],
      tokens: [],
      latency: [],
      errors: [],
    };
  }
}

export const advancedMetrics = new AdvancedMetrics();
export { AdvancedMetrics, LatencyHistogram, COST_PER_MILLION_TOKENS };
