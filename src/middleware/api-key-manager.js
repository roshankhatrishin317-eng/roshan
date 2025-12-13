/**
 * API Key Management
 * Create, rotate, revoke, and validate API keys
 */

import { createHash, randomBytes } from 'crypto';

class ApiKeyManager {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.keys = new Map(); // keyHash -> key data
    this.keyPrefix = options.keyPrefix || 'ak_';
    this.defaultExpiry = options.defaultExpiry || null; // null = no expiry
    
    this.stats = {
      totalKeys: 0,
      activeKeys: 0,
      revokedKeys: 0,
      expiredKeys: 0,
      totalValidations: 0,
      failedValidations: 0,
    };
  }

  /**
   * Generate a new API key
   */
  generateKey(options = {}) {
    const {
      name,
      tenantId,
      scopes = ['*'],
      expiresAt,
      metadata = {},
      rateLimit,
    } = options;
    
    // Generate key
    const keyBytes = randomBytes(32);
    const key = this.keyPrefix + keyBytes.toString('base64url');
    const keyHash = this._hashKey(key);
    
    const keyData = {
      id: randomBytes(8).toString('hex'),
      hash: keyHash,
      name: name || `Key ${this.stats.totalKeys + 1}`,
      tenantId,
      scopes: new Set(scopes),
      prefix: key.substring(0, 12) + '...', // For display
      createdAt: Date.now(),
      expiresAt: expiresAt || (this.defaultExpiry ? Date.now() + this.defaultExpiry : null),
      lastUsed: null,
      usageCount: 0,
      status: 'active',
      metadata,
      rateLimit: rateLimit || null,
      rateWindow: { count: 0, windowStart: Date.now() },
    };
    
    this.keys.set(keyHash, keyData);
    this.stats.totalKeys++;
    this.stats.activeKeys++;
    
    console.log(`[ApiKey] Created key: ${keyData.name} (${keyData.prefix})`);
    
    // Return full key only on creation
    return {
      key,
      ...this._sanitizeKeyData(keyData),
    };
  }

  /**
   * Validate an API key
   */
  validate(key, options = {}) {
    this.stats.totalValidations++;
    
    if (!key || !key.startsWith(this.keyPrefix)) {
      this.stats.failedValidations++;
      return { valid: false, reason: 'Invalid key format' };
    }
    
    const keyHash = this._hashKey(key);
    const keyData = this.keys.get(keyHash);
    
    if (!keyData) {
      this.stats.failedValidations++;
      return { valid: false, reason: 'Key not found' };
    }
    
    if (keyData.status !== 'active') {
      this.stats.failedValidations++;
      return { valid: false, reason: `Key is ${keyData.status}` };
    }
    
    // Check expiry
    if (keyData.expiresAt && Date.now() > keyData.expiresAt) {
      keyData.status = 'expired';
      this.stats.activeKeys--;
      this.stats.expiredKeys++;
      this.stats.failedValidations++;
      return { valid: false, reason: 'Key expired' };
    }
    
    // Check scope
    if (options.scope && !this._hasScope(keyData, options.scope)) {
      this.stats.failedValidations++;
      return { valid: false, reason: 'Insufficient scope' };
    }
    
    // Check rate limit
    if (keyData.rateLimit) {
      const now = Date.now();
      const window = keyData.rateLimit.window || 60000;
      
      if (now - keyData.rateWindow.windowStart > window) {
        keyData.rateWindow = { count: 0, windowStart: now };
      }
      
      if (keyData.rateWindow.count >= keyData.rateLimit.requests) {
        return { valid: false, reason: 'Rate limit exceeded' };
      }
      
      keyData.rateWindow.count++;
    }
    
    // Update usage
    keyData.lastUsed = Date.now();
    keyData.usageCount++;
    
    return {
      valid: true,
      keyId: keyData.id,
      tenantId: keyData.tenantId,
      scopes: Array.from(keyData.scopes),
      metadata: keyData.metadata,
    };
  }

  /**
   * Rotate an API key (create new, revoke old)
   */
  rotate(oldKey) {
    const oldHash = this._hashKey(oldKey);
    const oldKeyData = this.keys.get(oldHash);
    
    if (!oldKeyData) {
      throw new Error('Key not found');
    }
    
    // Create new key with same settings
    const newKey = this.generateKey({
      name: oldKeyData.name + ' (rotated)',
      tenantId: oldKeyData.tenantId,
      scopes: Array.from(oldKeyData.scopes),
      expiresAt: oldKeyData.expiresAt,
      metadata: oldKeyData.metadata,
      rateLimit: oldKeyData.rateLimit,
    });
    
    // Revoke old key
    this.revoke(oldKey, 'Rotated');
    
    return newKey;
  }

  /**
   * Revoke an API key
   */
  revoke(key, reason = 'Manual revocation') {
    const keyHash = this._hashKey(key);
    const keyData = this.keys.get(keyHash);
    
    if (!keyData) {
      throw new Error('Key not found');
    }
    
    if (keyData.status === 'active') {
      this.stats.activeKeys--;
    }
    
    keyData.status = 'revoked';
    keyData.revokedAt = Date.now();
    keyData.revocationReason = reason;
    this.stats.revokedKeys++;
    
    console.log(`[ApiKey] Revoked key: ${keyData.name}`);
    return true;
  }

  /**
   * Get key info by ID
   */
  getKeyById(keyId) {
    for (const keyData of this.keys.values()) {
      if (keyData.id === keyId) {
        return this._sanitizeKeyData(keyData);
      }
    }
    return null;
  }

  /**
   * List keys for a tenant
   */
  listKeys(tenantId = null) {
    const keys = [];
    for (const keyData of this.keys.values()) {
      if (!tenantId || keyData.tenantId === tenantId) {
        keys.push(this._sanitizeKeyData(keyData));
      }
    }
    return keys;
  }

  /**
   * Update key metadata
   */
  updateKey(keyId, updates) {
    for (const keyData of this.keys.values()) {
      if (keyData.id === keyId) {
        if (updates.name) keyData.name = updates.name;
        if (updates.metadata) keyData.metadata = { ...keyData.metadata, ...updates.metadata };
        if (updates.scopes) keyData.scopes = new Set(updates.scopes);
        if (updates.rateLimit !== undefined) keyData.rateLimit = updates.rateLimit;
        if (updates.expiresAt !== undefined) keyData.expiresAt = updates.expiresAt;
        
        keyData.updatedAt = Date.now();
        return this._sanitizeKeyData(keyData);
      }
    }
    throw new Error('Key not found');
  }

  /**
   * Delete a key permanently
   */
  deleteKey(keyId) {
    for (const [hash, keyData] of this.keys) {
      if (keyData.id === keyId) {
        if (keyData.status === 'active') this.stats.activeKeys--;
        this.keys.delete(hash);
        this.stats.totalKeys--;
        return true;
      }
    }
    return false;
  }

  /**
   * Hash API key
   */
  _hashKey(key) {
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * Check if key has scope
   */
  _hasScope(keyData, requiredScope) {
    if (keyData.scopes.has('*')) return true;
    if (keyData.scopes.has(requiredScope)) return true;
    
    // Check wildcard scopes
    for (const scope of keyData.scopes) {
      if (scope.endsWith(':*')) {
        const prefix = scope.slice(0, -1);
        if (requiredScope.startsWith(prefix)) return true;
      }
    }
    
    return false;
  }

  /**
   * Sanitize key data for external use
   */
  _sanitizeKeyData(keyData) {
    return {
      id: keyData.id,
      name: keyData.name,
      prefix: keyData.prefix,
      tenantId: keyData.tenantId,
      scopes: Array.from(keyData.scopes),
      status: keyData.status,
      createdAt: keyData.createdAt,
      expiresAt: keyData.expiresAt,
      lastUsed: keyData.lastUsed,
      usageCount: keyData.usageCount,
      metadata: keyData.metadata,
      rateLimit: keyData.rateLimit,
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      ...this.stats,
      validationRate: this.stats.totalValidations > 0
        ? ((this.stats.totalValidations - this.stats.failedValidations) / this.stats.totalValidations * 100).toFixed(1) + '%'
        : 'N/A',
    };
  }

  /**
   * Cleanup expired keys
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const keyData of this.keys.values()) {
      if (keyData.status === 'active' && keyData.expiresAt && now > keyData.expiresAt) {
        keyData.status = 'expired';
        this.stats.activeKeys--;
        this.stats.expiredKeys++;
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

export const apiKeyManager = new ApiKeyManager();
export { ApiKeyManager };
