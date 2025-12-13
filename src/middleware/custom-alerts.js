/**
 * Custom Alerts
 * Configurable alert rules with multiple notification channels
 */

import { EventEmitter } from 'events';

class CustomAlerts extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.enabled = options.enabled !== false;
    this.rules = new Map();
    this.alerts = [];
    this.maxAlerts = options.maxAlerts || 1000;
    this.channels = new Map();
    
    this.stats = {
      totalRules: 0,
      activeRules: 0,
      totalAlerts: 0,
      byRule: {},
      bySeverity: {},
    };
    
    // Evaluation interval
    this.evalInterval = setInterval(() => this._evaluateRules(), 30000);
  }

  /**
   * Create an alert rule
   */
  createRule(config) {
    const {
      id,
      name,
      description,
      condition,      // Function or expression
      threshold,      // Threshold value
      operator,       // 'gt', 'lt', 'eq', 'gte', 'lte', 'ne'
      metric,         // Metric name to check
      window = 60000, // Time window for aggregation
      aggregation = 'avg', // 'avg', 'sum', 'max', 'min', 'count'
      severity = 'warning', // 'info', 'warning', 'critical'
      channels = [],  // Notification channels
      cooldown = 300000, // 5 min cooldown between alerts
      enabled = true,
    } = config;
    
    if (!id || (!condition && !metric)) {
      throw new Error('Rule must have id and either condition or metric');
    }
    
    const rule = {
      id,
      name: name || id,
      description,
      condition,
      threshold,
      operator,
      metric,
      window,
      aggregation,
      severity,
      channels,
      cooldown,
      enabled,
      createdAt: Date.now(),
      lastTriggered: null,
      triggerCount: 0,
      dataPoints: [],
    };
    
    this.rules.set(id, rule);
    this.stats.totalRules++;
    if (enabled) this.stats.activeRules++;
    
    return this._getRuleInfo(rule);
  }

  /**
   * Record a metric value
   */
  record(metric, value, metadata = {}) {
    const timestamp = Date.now();
    
    for (const rule of this.rules.values()) {
      if (rule.metric === metric && rule.enabled) {
        rule.dataPoints.push({ value, timestamp, metadata });
        
        // Keep only recent data points
        const cutoff = timestamp - rule.window * 2;
        rule.dataPoints = rule.dataPoints.filter(dp => dp.timestamp > cutoff);
        
        // Check if should evaluate
        this._evaluateRule(rule);
      }
    }
  }

  /**
   * Evaluate all rules
   */
  _evaluateRules() {
    for (const rule of this.rules.values()) {
      if (rule.enabled) {
        this._evaluateRule(rule);
      }
    }
  }

  /**
   * Evaluate a single rule
   */
  _evaluateRule(rule) {
    // Check cooldown
    if (rule.lastTriggered && Date.now() - rule.lastTriggered < rule.cooldown) {
      return;
    }
    
    let triggered = false;
    let value;
    
    if (rule.condition && typeof rule.condition === 'function') {
      // Custom condition function
      triggered = rule.condition(rule.dataPoints);
      value = 'custom';
    } else if (rule.metric && rule.threshold !== undefined) {
      // Metric-based rule
      const now = Date.now();
      const windowData = rule.dataPoints.filter(
        dp => now - dp.timestamp <= rule.window
      );
      
      if (windowData.length === 0) return;
      
      // Aggregate data
      value = this._aggregate(windowData.map(dp => dp.value), rule.aggregation);
      
      // Compare with threshold
      triggered = this._compare(value, rule.threshold, rule.operator);
    }
    
    if (triggered) {
      this._triggerAlert(rule, value);
    }
  }

  /**
   * Aggregate values
   */
  _aggregate(values, method) {
    if (values.length === 0) return 0;
    
    switch (method) {
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'max':
        return Math.max(...values);
      case 'min':
        return Math.min(...values);
      case 'count':
        return values.length;
      default:
        return values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  /**
   * Compare value with threshold
   */
  _compare(value, threshold, operator) {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      case 'ne': return value !== threshold;
      default: return value > threshold;
    }
  }

  /**
   * Trigger an alert
   */
  _triggerAlert(rule, value) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      value,
      threshold: rule.threshold,
      operator: rule.operator,
      timestamp: Date.now(),
      message: `${rule.name}: ${value} ${rule.operator || '>'} ${rule.threshold}`,
    };
    
    // Update rule
    rule.lastTriggered = Date.now();
    rule.triggerCount++;
    
    // Store alert
    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }
    
    // Update stats
    this.stats.totalAlerts++;
    this.stats.byRule[rule.id] = (this.stats.byRule[rule.id] || 0) + 1;
    this.stats.bySeverity[rule.severity] = (this.stats.bySeverity[rule.severity] || 0) + 1;
    
    // Emit event
    this.emit('alert', alert);
    
    // Send to channels
    this._sendToChannels(alert, rule.channels);
    
    console.log(`[Alert] ${alert.severity.toUpperCase()}: ${alert.message}`);
    
    return alert;
  }

  /**
   * Register notification channel
   */
  registerChannel(id, handler) {
    this.channels.set(id, handler);
  }

  /**
   * Send alert to channels
   */
  async _sendToChannels(alert, channelIds) {
    for (const channelId of channelIds) {
      const handler = this.channels.get(channelId);
      if (handler) {
        try {
          await handler(alert);
        } catch (error) {
          console.error(`[Alert] Failed to send to channel ${channelId}:`, error.message);
        }
      }
    }
  }

  /**
   * Update rule
   */
  updateRule(ruleId, updates) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }
    
    const wasEnabled = rule.enabled;
    
    Object.assign(rule, updates);
    rule.updatedAt = Date.now();
    
    if (wasEnabled !== rule.enabled) {
      if (rule.enabled) this.stats.activeRules++;
      else this.stats.activeRules--;
    }
    
    return this._getRuleInfo(rule);
  }

  /**
   * Delete rule
   */
  deleteRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      if (rule.enabled) this.stats.activeRules--;
      this.rules.delete(ruleId);
      this.stats.totalRules--;
      return true;
    }
    return false;
  }

  /**
   * Enable/disable rule
   */
  setRuleEnabled(ruleId, enabled) {
    const rule = this.rules.get(ruleId);
    if (rule && rule.enabled !== enabled) {
      rule.enabled = enabled;
      if (enabled) this.stats.activeRules++;
      else this.stats.activeRules--;
    }
  }

  /**
   * Get rule info
   */
  _getRuleInfo(rule) {
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      metric: rule.metric,
      threshold: rule.threshold,
      operator: rule.operator,
      severity: rule.severity,
      enabled: rule.enabled,
      triggerCount: rule.triggerCount,
      lastTriggered: rule.lastTriggered,
    };
  }

  /**
   * List rules
   */
  listRules() {
    return Array.from(this.rules.values()).map(r => this._getRuleInfo(r));
  }

  /**
   * Get recent alerts
   */
  getAlerts(options = {}) {
    let alerts = [...this.alerts];
    
    if (options.ruleId) {
      alerts = alerts.filter(a => a.ruleId === options.ruleId);
    }
    if (options.severity) {
      alerts = alerts.filter(a => a.severity === options.severity);
    }
    if (options.since) {
      alerts = alerts.filter(a => a.timestamp >= options.since);
    }
    
    return alerts.slice(-(options.limit || 100)).reverse();
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
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
      channelCount: this.channels.size,
      rules: this.listRules(),
      recentAlerts: this.getAlerts({ limit: 10 }),
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.evalInterval);
  }
}

export const customAlerts = new CustomAlerts();
export { CustomAlerts };
