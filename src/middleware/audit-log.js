/**
 * Audit Logging
 * Comprehensive logging for compliance, security, and debugging
 * Tracks all API access, changes, and significant events
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

class AuditLogger {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.logToMemory = options.logToMemory !== false;
    this.logToFile = options.logToFile || false;
    this.logFilePath = options.logFilePath || './audit.log';
    this.rotateSize = options.rotateSize || 10 * 1024 * 1024; // 10MB
    
    this.logs = [];
    this.maxMemoryLogs = options.maxMemoryLogs || 10000;
    
    // Categories
    this.categories = {
      ACCESS: 'access',       // API access logs
      AUTH: 'auth',           // Authentication events
      CONFIG: 'config',       // Configuration changes
      DATA: 'data',           // Data access/modification
      SECURITY: 'security',   // Security events
      SYSTEM: 'system',       // System events
      ERROR: 'error',         // Errors
    };
    
    this.stats = {
      totalLogs: 0,
      byCategory: {},
      byAction: {},
    };
    
    // File write buffer
    this.fileBuffer = [];
    this.flushInterval = setInterval(() => this._flushToFile(), 5000);
  }

  /**
   * Create an audit log entry
   */
  log(entry) {
    if (!this.enabled) return null;
    
    const auditEntry = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      ...entry,
      // Ensure required fields
      category: entry.category || this.categories.SYSTEM,
      action: entry.action || 'unknown',
      actor: this._normalizeActor(entry.actor),
      resource: entry.resource || null,
      outcome: entry.outcome || 'success',
      metadata: this._sanitizeMetadata(entry.metadata || {}),
    };
    
    // Add hash for integrity
    auditEntry.hash = this._hashEntry(auditEntry);
    
    // Update stats
    this.stats.totalLogs++;
    this.stats.byCategory[auditEntry.category] = (this.stats.byCategory[auditEntry.category] || 0) + 1;
    this.stats.byAction[auditEntry.action] = (this.stats.byAction[auditEntry.action] || 0) + 1;
    
    // Store in memory
    if (this.logToMemory) {
      this.logs.push(auditEntry);
      if (this.logs.length > this.maxMemoryLogs) {
        this.logs.shift();
      }
    }
    
    // Queue for file
    if (this.logToFile) {
      this.fileBuffer.push(auditEntry);
    }
    
    return auditEntry;
  }

  /**
   * Log API access
   */
  logAccess(request, response, metadata = {}) {
    return this.log({
      category: this.categories.ACCESS,
      action: 'api_request',
      actor: {
        ip: request.ip || request.headers?.['x-forwarded-for'],
        userAgent: request.headers?.['user-agent'],
        apiKey: this._maskApiKey(request.headers?.['authorization']),
        userId: metadata.userId,
      },
      resource: {
        method: request.method,
        path: request.url || request.path,
        model: metadata.model,
        provider: metadata.provider,
      },
      outcome: response.statusCode < 400 ? 'success' : 'failure',
      metadata: {
        statusCode: response.statusCode,
        latency: metadata.latency,
        inputTokens: metadata.inputTokens,
        outputTokens: metadata.outputTokens,
        traceId: metadata.traceId,
      },
    });
  }

  /**
   * Log authentication event
   */
  logAuth(action, actor, outcome, metadata = {}) {
    return this.log({
      category: this.categories.AUTH,
      action,
      actor,
      outcome,
      metadata,
    });
  }

  /**
   * Log configuration change
   */
  logConfigChange(actor, resource, oldValue, newValue) {
    return this.log({
      category: this.categories.CONFIG,
      action: 'config_change',
      actor,
      resource,
      outcome: 'success',
      metadata: {
        oldValue: this._sanitizeValue(oldValue),
        newValue: this._sanitizeValue(newValue),
      },
    });
  }

  /**
   * Log security event
   */
  logSecurity(action, actor, details, severity = 'medium') {
    return this.log({
      category: this.categories.SECURITY,
      action,
      actor,
      outcome: 'alert',
      metadata: {
        severity,
        details,
      },
    });
  }

  /**
   * Log error
   */
  logError(error, context = {}) {
    return this.log({
      category: this.categories.ERROR,
      action: 'error',
      actor: context.actor,
      resource: context.resource,
      outcome: 'failure',
      metadata: {
        errorMessage: error.message,
        errorCode: error.code,
        errorStack: error.stack?.split('\n').slice(0, 5),
        context,
      },
    });
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  /**
   * Hash entry for integrity verification
   */
  _hashEntry(entry) {
    const data = JSON.stringify({
      timestamp: entry.timestamp,
      category: entry.category,
      action: entry.action,
      outcome: entry.outcome,
    });
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Normalize actor information
   */
  _normalizeActor(actor) {
    if (!actor) return { type: 'system' };
    if (typeof actor === 'string') return { id: actor, type: 'user' };
    return actor;
  }

  /**
   * Sanitize metadata (remove sensitive data)
   */
  _sanitizeMetadata(metadata) {
    const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization'];
    const sanitized = { ...metadata };
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  /**
   * Sanitize a single value
   */
  _sanitizeValue(value) {
    if (typeof value === 'string' && value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    return value;
  }

  /**
   * Mask API key for logging
   */
  _maskApiKey(authHeader) {
    if (!authHeader) return null;
    
    const key = authHeader.replace(/^Bearer\s+/i, '');
    if (key.length <= 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  }

  /**
   * Flush buffer to file
   */
  async _flushToFile() {
    if (!this.logToFile || this.fileBuffer.length === 0) return;
    
    const entries = this.fileBuffer.splice(0, this.fileBuffer.length);
    const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    
    try {
      await fs.appendFile(this.logFilePath, lines);
      
      // Check for rotation
      const stats = await fs.stat(this.logFilePath).catch(() => null);
      if (stats && stats.size > this.rotateSize) {
        await this._rotateLogFile();
      }
    } catch (error) {
      console.error('[AuditLog] Failed to write to file:', error.message);
      // Re-add to buffer
      this.fileBuffer.unshift(...entries);
    }
  }

  /**
   * Rotate log file
   */
  async _rotateLogFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = this.logFilePath.replace(/\.log$/, `-${timestamp}.log`);
    
    try {
      await fs.rename(this.logFilePath, rotatedPath);
      console.log(`[AuditLog] Rotated log file to ${rotatedPath}`);
    } catch (error) {
      console.error('[AuditLog] Failed to rotate log file:', error.message);
    }
  }

  /**
   * Query logs
   */
  query(options = {}) {
    let results = [...this.logs];
    
    if (options.category) {
      results = results.filter(l => l.category === options.category);
    }
    
    if (options.action) {
      results = results.filter(l => l.action === options.action);
    }
    
    if (options.outcome) {
      results = results.filter(l => l.outcome === options.outcome);
    }
    
    if (options.since) {
      results = results.filter(l => new Date(l.timestamp) >= new Date(options.since));
    }
    
    if (options.until) {
      results = results.filter(l => new Date(l.timestamp) <= new Date(options.until));
    }
    
    if (options.actorId) {
      results = results.filter(l => l.actor?.id === options.actorId || l.actor?.userId === options.actorId);
    }
    
    if (options.search) {
      const search = options.search.toLowerCase();
      results = results.filter(l => 
        JSON.stringify(l).toLowerCase().includes(search)
      );
    }
    
    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }
    
    return results;
  }

  /**
   * Get recent logs
   */
  getRecent(limit = 100) {
    return this.logs.slice(-limit).reverse();
  }

  /**
   * Export logs
   */
  async export(options = {}) {
    const logs = this.query(options);
    const format = options.format || 'json';
    
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }
    
    if (format === 'csv') {
      const headers = ['id', 'timestamp', 'category', 'action', 'outcome', 'actor', 'resource'];
      const rows = logs.map(l => [
        l.id,
        l.timestamp,
        l.category,
        l.action,
        l.outcome,
        JSON.stringify(l.actor),
        JSON.stringify(l.resource),
      ]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
    
    return logs;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      logToFile: this.logToFile,
      ...this.stats,
      memoryLogs: this.logs.length,
      pendingFileWrites: this.fileBuffer.length,
    };
  }

  /**
   * Clear memory logs
   */
  clearMemory() {
    this.logs = [];
  }

  /**
   * Shutdown
   */
  async shutdown() {
    clearInterval(this.flushInterval);
    await this._flushToFile();
  }
}

export const auditLogger = new AuditLogger();
export { AuditLogger };
