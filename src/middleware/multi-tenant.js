/**
 * Multi-Tenant Support
 * Isolate clients with separate configurations, limits, and data
 */

import { createHash } from 'crypto';

class MultiTenantManager {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.tenants = new Map();
    this.defaultConfig = {
      rateLimit: { requests: 100, window: 60000 },
      budgetLimit: null,
      allowedModels: ['*'],
      allowedProviders: ['*'],
      maxTokensPerRequest: 100000,
      customHeaders: {},
      metadata: {},
    };
    
    this.stats = {
      totalTenants: 0,
      activeTenants: 0,
    };
  }

  /**
   * Create a new tenant
   */
  createTenant(config) {
    const {
      id,
      name,
      description,
      apiKeys = [],
      rateLimit,
      budgetLimit,
      allowedModels,
      allowedProviders,
      maxTokensPerRequest,
      customHeaders,
      metadata,
      enabled = true,
    } = config;
    
    if (!id) {
      throw new Error('Tenant must have an id');
    }
    
    if (this.tenants.has(id)) {
      throw new Error(`Tenant ${id} already exists`);
    }
    
    const tenant = {
      id,
      name: name || id,
      description,
      apiKeys: new Set(apiKeys),
      config: {
        rateLimit: rateLimit || this.defaultConfig.rateLimit,
        budgetLimit: budgetLimit || this.defaultConfig.budgetLimit,
        allowedModels: allowedModels || this.defaultConfig.allowedModels,
        allowedProviders: allowedProviders || this.defaultConfig.allowedProviders,
        maxTokensPerRequest: maxTokensPerRequest || this.defaultConfig.maxTokensPerRequest,
        customHeaders: customHeaders || {},
        metadata: metadata || {},
      },
      enabled,
      createdAt: Date.now(),
      usage: {
        requests: 0,
        tokens: 0,
        cost: 0,
        lastRequest: null,
      },
      rateWindow: {
        count: 0,
        windowStart: Date.now(),
      },
    };
    
    this.tenants.set(id, tenant);
    this.stats.totalTenants++;
    if (enabled) this.stats.activeTenants++;
    
    console.log(`[MultiTenant] Created tenant: ${name} (${id})`);
    return this._sanitizeTenant(tenant);
  }

  /**
   * Get tenant by ID
   */
  getTenant(tenantId) {
    const tenant = this.tenants.get(tenantId);
    return tenant ? this._sanitizeTenant(tenant) : null;
  }

  /**
   * Get tenant by API key
   */
  getTenantByApiKey(apiKey) {
    for (const tenant of this.tenants.values()) {
      if (tenant.apiKeys.has(apiKey)) {
        return tenant;
      }
    }
    return null;
  }

  /**
   * Update tenant configuration
   */
  updateTenant(tenantId, updates) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }
    
    if (updates.config) {
      tenant.config = { ...tenant.config, ...updates.config };
    }
    
    if (updates.name) tenant.name = updates.name;
    if (updates.description !== undefined) tenant.description = updates.description;
    if (updates.enabled !== undefined) {
      const wasEnabled = tenant.enabled;
      tenant.enabled = updates.enabled;
      if (wasEnabled && !updates.enabled) this.stats.activeTenants--;
      if (!wasEnabled && updates.enabled) this.stats.activeTenants++;
    }
    
    tenant.updatedAt = Date.now();
    return this._sanitizeTenant(tenant);
  }

  /**
   * Delete tenant
   */
  deleteTenant(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;
    
    if (tenant.enabled) this.stats.activeTenants--;
    this.tenants.delete(tenantId);
    this.stats.totalTenants--;
    
    return true;
  }

  /**
   * Add API key to tenant
   */
  addApiKey(tenantId, apiKey) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }
    
    tenant.apiKeys.add(apiKey);
    return true;
  }

  /**
   * Remove API key from tenant
   */
  removeApiKey(tenantId, apiKey) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;
    
    return tenant.apiKeys.delete(apiKey);
  }

  /**
   * Validate request for tenant
   */
  validateRequest(tenant, request) {
    if (!tenant.enabled) {
      return { allowed: false, reason: 'Tenant is disabled' };
    }
    
    // Check rate limit
    const now = Date.now();
    const window = tenant.config.rateLimit.window;
    
    if (now - tenant.rateWindow.windowStart > window) {
      tenant.rateWindow = { count: 0, windowStart: now };
    }
    
    if (tenant.rateWindow.count >= tenant.config.rateLimit.requests) {
      return { allowed: false, reason: 'Rate limit exceeded' };
    }
    
    // Check budget
    if (tenant.config.budgetLimit && tenant.usage.cost >= tenant.config.budgetLimit) {
      return { allowed: false, reason: 'Budget limit exceeded' };
    }
    
    // Check model
    const model = request.model;
    if (model && !this._isAllowed(model, tenant.config.allowedModels)) {
      return { allowed: false, reason: `Model ${model} not allowed for this tenant` };
    }
    
    // Check provider
    const provider = request.provider;
    if (provider && !this._isAllowed(provider, tenant.config.allowedProviders)) {
      return { allowed: false, reason: `Provider ${provider} not allowed for this tenant` };
    }
    
    return { allowed: true };
  }

  /**
   * Record usage for tenant
   */
  recordUsage(tenantId, usage) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return;
    
    tenant.usage.requests++;
    tenant.usage.tokens += usage.tokens || 0;
    tenant.usage.cost += usage.cost || 0;
    tenant.usage.lastRequest = Date.now();
    tenant.rateWindow.count++;
  }

  /**
   * Get tenant usage
   */
  getUsage(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return null;
    
    return {
      ...tenant.usage,
      rateLimit: {
        current: tenant.rateWindow.count,
        limit: tenant.config.rateLimit.requests,
        remaining: Math.max(0, tenant.config.rateLimit.requests - tenant.rateWindow.count),
        resetsAt: tenant.rateWindow.windowStart + tenant.config.rateLimit.window,
      },
      budget: tenant.config.budgetLimit ? {
        used: tenant.usage.cost,
        limit: tenant.config.budgetLimit,
        remaining: Math.max(0, tenant.config.budgetLimit - tenant.usage.cost),
      } : null,
    };
  }

  /**
   * Reset tenant usage
   */
  resetUsage(tenantId, type = 'all') {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;
    
    if (type === 'all' || type === 'cost') {
      tenant.usage.cost = 0;
    }
    if (type === 'all' || type === 'tokens') {
      tenant.usage.tokens = 0;
    }
    if (type === 'all' || type === 'requests') {
      tenant.usage.requests = 0;
    }
    
    return true;
  }

  /**
   * Check if value is in allowed list
   */
  _isAllowed(value, allowedList) {
    if (allowedList.includes('*')) return true;
    return allowedList.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(value);
      }
      return pattern === value;
    });
  }

  /**
   * Sanitize tenant for external use
   */
  _sanitizeTenant(tenant) {
    return {
      id: tenant.id,
      name: tenant.name,
      description: tenant.description,
      enabled: tenant.enabled,
      config: tenant.config,
      apiKeyCount: tenant.apiKeys.size,
      usage: tenant.usage,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  /**
   * List all tenants
   */
  listTenants() {
    return Array.from(this.tenants.values()).map(t => this._sanitizeTenant(t));
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      ...this.stats,
      tenants: this.listTenants(),
    };
  }
}

export const multiTenant = new MultiTenantManager();
export { MultiTenantManager };
