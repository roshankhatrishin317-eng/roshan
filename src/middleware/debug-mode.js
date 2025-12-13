/**
 * Debug Mode
 * Enhanced logging and diagnostics for troubleshooting
 */

class DebugMode {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.verboseLevel = options.verboseLevel || 1; // 1-3
    this.logToConsole = options.logToConsole !== false;
    this.logToMemory = options.logToMemory !== false;
    
    this.logs = [];
    this.maxLogs = options.maxLogs || 1000;
    
    this.trackedRequests = new Map();
    this.maxTrackedRequests = 100;
    
    this.stats = {
      totalLogs: 0,
      byLevel: { debug: 0, info: 0, warn: 0, error: 0 },
    };
  }

  /**
   * Log a message
   */
  log(level, message, data = {}) {
    if (!this.enabled && level === 'debug') return;
    
    const entry = {
      timestamp: Date.now(),
      level,
      message,
      data: this._sanitizeData(data),
      stack: level === 'error' ? new Error().stack : null,
    };
    
    this.stats.totalLogs++;
    this.stats.byLevel[level] = (this.stats.byLevel[level] || 0) + 1;
    
    // Log to console
    if (this.logToConsole) {
      const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
      if (level === 'error') {
        console.error(prefix, message, data);
      } else if (level === 'warn') {
        console.warn(prefix, message, data);
      } else if (this.enabled || level === 'info') {
        console.log(prefix, message, this.verboseLevel >= 2 ? data : '');
      }
    }
    
    // Store in memory
    if (this.logToMemory) {
      this.logs.push(entry);
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }
    }
    
    return entry;
  }

  /**
   * Convenience methods
   */
  debug(message, data = {}) {
    return this.log('debug', message, data);
  }
  
  info(message, data = {}) {
    return this.log('info', message, data);
  }
  
  warn(message, data = {}) {
    return this.log('warn', message, data);
  }
  
  error(message, data = {}) {
    return this.log('error', message, data);
  }

  /**
   * Start tracking a request
   */
  startRequest(requestId, metadata = {}) {
    if (!this.enabled) return;
    
    this.trackedRequests.set(requestId, {
      id: requestId,
      startTime: Date.now(),
      metadata,
      events: [],
      timings: {},
    });
    
    this.debug(`Request started: ${requestId}`, metadata);
    
    // Cleanup old requests
    if (this.trackedRequests.size > this.maxTrackedRequests) {
      const oldest = this.trackedRequests.keys().next().value;
      this.trackedRequests.delete(oldest);
    }
  }

  /**
   * Add event to tracked request
   */
  addRequestEvent(requestId, event, data = {}) {
    if (!this.enabled) return;
    
    const request = this.trackedRequests.get(requestId);
    if (!request) return;
    
    const eventEntry = {
      event,
      timestamp: Date.now(),
      elapsed: Date.now() - request.startTime,
      data,
    };
    
    request.events.push(eventEntry);
    
    if (this.verboseLevel >= 2) {
      this.debug(`Request ${requestId} event: ${event}`, data);
    }
  }

  /**
   * Record timing for request
   */
  recordTiming(requestId, name, durationMs) {
    if (!this.enabled) return;
    
    const request = this.trackedRequests.get(requestId);
    if (!request) return;
    
    request.timings[name] = durationMs;
    
    if (this.verboseLevel >= 2) {
      this.debug(`Request ${requestId} timing: ${name} = ${durationMs}ms`);
    }
  }

  /**
   * End request tracking
   */
  endRequest(requestId, result = {}) {
    if (!this.enabled) return;
    
    const request = this.trackedRequests.get(requestId);
    if (!request) return;
    
    request.endTime = Date.now();
    request.totalDuration = request.endTime - request.startTime;
    request.result = result;
    
    this.debug(`Request completed: ${requestId}`, {
      duration: request.totalDuration,
      events: request.events.length,
      timings: request.timings,
      result: result.success !== false ? 'success' : 'failed',
    });
    
    return request;
  }

  /**
   * Get request trace
   */
  getRequestTrace(requestId) {
    return this.trackedRequests.get(requestId);
  }

  /**
   * Create a timer utility
   */
  createTimer(name) {
    const start = Date.now();
    return {
      name,
      start,
      elapsed: () => Date.now() - start,
      end: () => {
        const duration = Date.now() - start;
        if (this.enabled && this.verboseLevel >= 2) {
          this.debug(`Timer ${name}: ${duration}ms`);
        }
        return duration;
      },
    };
  }

  /**
   * Wrap a function with debug logging
   */
  wrap(fn, name) {
    const self = this;
    return async function(...args) {
      const timer = self.createTimer(name);
      self.debug(`${name} called`, { args: self.verboseLevel >= 3 ? args : '[hidden]' });
      
      try {
        const result = await fn.apply(this, args);
        self.debug(`${name} completed`, { duration: timer.end() });
        return result;
      } catch (error) {
        self.error(`${name} failed`, { error: error.message, duration: timer.end() });
        throw error;
      }
    };
  }

  /**
   * Sanitize sensitive data
   */
  _sanitizeData(data) {
    if (!data || typeof data !== 'object') return data;
    
    const sensitiveKeys = ['apiKey', 'api_key', 'authorization', 'password', 'secret', 'token'];
    const sanitized = { ...data };
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  /**
   * Get recent logs
   */
  getLogs(options = {}) {
    let logs = [...this.logs];
    
    if (options.level) {
      logs = logs.filter(l => l.level === options.level);
    }
    
    if (options.since) {
      logs = logs.filter(l => l.timestamp >= options.since);
    }
    
    if (options.search) {
      const search = options.search.toLowerCase();
      logs = logs.filter(l => 
        l.message.toLowerCase().includes(search) ||
        JSON.stringify(l.data).toLowerCase().includes(search)
      );
    }
    
    if (options.limit) {
      logs = logs.slice(-options.limit);
    }
    
    return logs;
  }

  /**
   * Clear logs
   */
  clearLogs() {
    this.logs = [];
    this.trackedRequests.clear();
  }

  /**
   * Enable/disable debug mode
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.info(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set verbose level
   */
  setVerboseLevel(level) {
    this.verboseLevel = Math.max(1, Math.min(3, level));
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      enabled: this.enabled,
      verboseLevel: this.verboseLevel,
      ...this.stats,
      logCount: this.logs.length,
      trackedRequests: this.trackedRequests.size,
    };
  }
}

export const debugMode = new DebugMode();
export { DebugMode };
