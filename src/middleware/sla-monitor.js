/**
 * SLA Monitoring
 * Track uptime, latency, and error rate against SLA targets
 */

class SlaMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.slas = new Map();
    this.windows = new Map(); // Rolling windows for metrics
    
    this.stats = {
      totalSlas: 0,
      healthySlas: 0,
      breachedSlas: 0,
    };
    
    // Periodic SLA check
    this.checkInterval = setInterval(() => this._checkAllSlas(), 60000);
  }

  /**
   * Define an SLA
   */
  defineSla(config) {
    const {
      id,
      name,
      description,
      targets,         // SLA targets
      windowSize = 3600000, // 1 hour default window
      alertOnBreach = true,
      metadata = {},
    } = config;
    
    if (!id || !targets) {
      throw new Error('SLA must have id and targets');
    }
    
    const sla = {
      id,
      name: name || id,
      description,
      targets: {
        uptime: targets.uptime || 99.9,           // % uptime
        latencyP50: targets.latencyP50 || 500,    // ms
        latencyP95: targets.latencyP95 || 2000,   // ms
        latencyP99: targets.latencyP99 || 5000,   // ms
        errorRate: targets.errorRate || 0.1,      // % error rate
        ...targets,
      },
      windowSize,
      alertOnBreach,
      metadata,
      createdAt: Date.now(),
      status: 'healthy',
      lastCheck: null,
      breaches: [],
    };
    
    // Initialize window
    this.windows.set(id, {
      requests: [],
      errors: [],
      latencies: [],
      downtime: 0,
      lastHealthy: Date.now(),
    });
    
    this.slas.set(id, sla);
    this.stats.totalSlas++;
    this.stats.healthySlas++;
    
    return this._getSlaInfo(sla);
  }

  /**
   * Record a request
   */
  record(slaId, result) {
    const window = this.windows.get(slaId);
    if (!window) return;
    
    const timestamp = Date.now();
    
    // Record request
    window.requests.push({ timestamp, success: !result.error });
    
    // Record error
    if (result.error) {
      window.errors.push({ timestamp, error: result.error });
    }
    
    // Record latency
    if (result.latency !== undefined) {
      window.latencies.push({ timestamp, value: result.latency });
    }
    
    // Cleanup old data
    this._cleanupWindow(window, this.slas.get(slaId).windowSize);
  }

  /**
   * Record downtime
   */
  recordDowntime(slaId, durationMs) {
    const window = this.windows.get(slaId);
    if (window) {
      window.downtime += durationMs;
    }
  }

  /**
   * Mark as healthy
   */
  markHealthy(slaId) {
    const window = this.windows.get(slaId);
    if (window) {
      window.lastHealthy = Date.now();
    }
  }

  /**
   * Cleanup old window data
   */
  _cleanupWindow(window, windowSize) {
    const cutoff = Date.now() - windowSize;
    
    window.requests = window.requests.filter(r => r.timestamp > cutoff);
    window.errors = window.errors.filter(e => e.timestamp > cutoff);
    window.latencies = window.latencies.filter(l => l.timestamp > cutoff);
  }

  /**
   * Check all SLAs
   */
  _checkAllSlas() {
    for (const [id, sla] of this.slas) {
      this._checkSla(id, sla);
    }
  }

  /**
   * Check a single SLA
   */
  _checkSla(id, sla) {
    const window = this.windows.get(id);
    if (!window) return;
    
    const now = Date.now();
    sla.lastCheck = now;
    
    const metrics = this._calculateMetrics(window, sla.windowSize);
    const breaches = this._checkBreaches(sla.targets, metrics);
    
    const wasHealthy = sla.status === 'healthy';
    
    if (breaches.length > 0) {
      sla.status = 'breached';
      
      // Record breach
      sla.breaches.push({
        timestamp: now,
        breaches,
        metrics,
      });
      
      // Keep only last 100 breaches
      if (sla.breaches.length > 100) {
        sla.breaches.shift();
      }
      
      if (wasHealthy) {
        this.stats.healthySlas--;
        this.stats.breachedSlas++;
      }
      
      if (sla.alertOnBreach) {
        console.log(`[SLA] Breach detected for ${sla.name}:`, breaches);
      }
    } else {
      sla.status = 'healthy';
      
      if (!wasHealthy) {
        this.stats.healthySlas++;
        this.stats.breachedSlas--;
      }
    }
    
    sla.currentMetrics = metrics;
  }

  /**
   * Calculate metrics from window
   */
  _calculateMetrics(window, windowSize) {
    const now = Date.now();
    
    // Calculate uptime
    const totalTime = windowSize;
    const uptime = ((totalTime - window.downtime) / totalTime) * 100;
    
    // Calculate error rate
    const totalRequests = window.requests.length;
    const errorCount = window.errors.length;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
    
    // Calculate latency percentiles
    const latencies = window.latencies.map(l => l.value).sort((a, b) => a - b);
    const latencyP50 = this._percentile(latencies, 50);
    const latencyP95 = this._percentile(latencies, 95);
    const latencyP99 = this._percentile(latencies, 99);
    
    return {
      uptime: uptime.toFixed(3),
      errorRate: errorRate.toFixed(3),
      latencyP50,
      latencyP95,
      latencyP99,
      totalRequests,
      errorCount,
      windowStart: now - windowSize,
      windowEnd: now,
    };
  }

  /**
   * Calculate percentile
   */
  _percentile(sortedArray, p) {
    if (sortedArray.length === 0) return null;
    
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Check for breaches
   */
  _checkBreaches(targets, metrics) {
    const breaches = [];
    
    if (parseFloat(metrics.uptime) < targets.uptime) {
      breaches.push({
        metric: 'uptime',
        target: targets.uptime,
        actual: parseFloat(metrics.uptime),
        unit: '%',
      });
    }
    
    if (parseFloat(metrics.errorRate) > targets.errorRate) {
      breaches.push({
        metric: 'errorRate',
        target: targets.errorRate,
        actual: parseFloat(metrics.errorRate),
        unit: '%',
      });
    }
    
    if (metrics.latencyP50 && metrics.latencyP50 > targets.latencyP50) {
      breaches.push({
        metric: 'latencyP50',
        target: targets.latencyP50,
        actual: metrics.latencyP50,
        unit: 'ms',
      });
    }
    
    if (metrics.latencyP95 && metrics.latencyP95 > targets.latencyP95) {
      breaches.push({
        metric: 'latencyP95',
        target: targets.latencyP95,
        actual: metrics.latencyP95,
        unit: 'ms',
      });
    }
    
    if (metrics.latencyP99 && metrics.latencyP99 > targets.latencyP99) {
      breaches.push({
        metric: 'latencyP99',
        target: targets.latencyP99,
        actual: metrics.latencyP99,
        unit: 'ms',
      });
    }
    
    return breaches;
  }

  /**
   * Get SLA info
   */
  _getSlaInfo(sla) {
    return {
      id: sla.id,
      name: sla.name,
      description: sla.description,
      targets: sla.targets,
      status: sla.status,
      currentMetrics: sla.currentMetrics,
      lastCheck: sla.lastCheck,
      recentBreaches: sla.breaches.slice(-5),
    };
  }

  /**
   * Get SLA
   */
  getSla(slaId) {
    const sla = this.slas.get(slaId);
    return sla ? this._getSlaInfo(sla) : null;
  }

  /**
   * List SLAs
   */
  listSlas() {
    return Array.from(this.slas.values()).map(s => this._getSlaInfo(s));
  }

  /**
   * Delete SLA
   */
  deleteSla(slaId) {
    const sla = this.slas.get(slaId);
    if (sla) {
      if (sla.status === 'healthy') this.stats.healthySlas--;
      else this.stats.breachedSlas--;
      
      this.slas.delete(slaId);
      this.windows.delete(slaId);
      this.stats.totalSlas--;
      return true;
    }
    return false;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      ...this.stats,
      slas: this.listSlas(),
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.checkInterval);
  }
}

export const slaMonitor = new SlaMonitor();
export { SlaMonitor };
