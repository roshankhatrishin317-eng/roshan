/**
 * Request Signing
 * HMAC verification for request integrity and authentication
 */

import { createHmac, timingSafeEqual } from 'crypto';

class RequestSigning {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.algorithm = options.algorithm || 'sha256';
    this.headerName = options.headerName || 'x-signature';
    this.timestampHeader = options.timestampHeader || 'x-timestamp';
    this.maxTimestampAge = options.maxTimestampAge || 300000; // 5 minutes
    
    this.secrets = new Map(); // clientId -> secret
    
    this.stats = {
      totalVerifications: 0,
      successful: 0,
      failed: 0,
      byReason: {},
    };
  }

  /**
   * Register a client secret
   */
  registerSecret(clientId, secret) {
    this.secrets.set(clientId, secret);
  }

  /**
   * Remove client secret
   */
  removeSecret(clientId) {
    this.secrets.delete(clientId);
  }

  /**
   * Sign a request
   */
  sign(clientId, payload, timestamp = Date.now()) {
    const secret = this.secrets.get(clientId);
    if (!secret) {
      throw new Error(`No secret registered for client ${clientId}`);
    }
    
    const data = this._createSignatureData(payload, timestamp);
    const signature = this._createSignature(data, secret);
    
    return {
      signature,
      timestamp,
      headers: {
        [this.headerName]: signature,
        [this.timestampHeader]: timestamp.toString(),
      },
    };
  }

  /**
   * Verify a request signature
   */
  verify(clientId, payload, signature, timestamp) {
    this.stats.totalVerifications++;
    
    if (!this.enabled) {
      return { valid: true, reason: 'Signing disabled' };
    }
    
    // Check timestamp
    if (timestamp) {
      const ts = parseInt(timestamp);
      const age = Date.now() - ts;
      
      if (isNaN(ts) || age > this.maxTimestampAge || age < -60000) {
        this.stats.failed++;
        this.stats.byReason['invalid_timestamp'] = (this.stats.byReason['invalid_timestamp'] || 0) + 1;
        return { valid: false, reason: 'Invalid or expired timestamp' };
      }
    }
    
    const secret = this.secrets.get(clientId);
    if (!secret) {
      this.stats.failed++;
      this.stats.byReason['unknown_client'] = (this.stats.byReason['unknown_client'] || 0) + 1;
      return { valid: false, reason: 'Unknown client' };
    }
    
    const data = this._createSignatureData(payload, timestamp);
    const expectedSignature = this._createSignature(data, secret);
    
    // Timing-safe comparison
    const isValid = this._compareSignatures(signature, expectedSignature);
    
    if (isValid) {
      this.stats.successful++;
      return { valid: true };
    } else {
      this.stats.failed++;
      this.stats.byReason['signature_mismatch'] = (this.stats.byReason['signature_mismatch'] || 0) + 1;
      return { valid: false, reason: 'Signature mismatch' };
    }
  }

  /**
   * Verify request from headers
   */
  verifyRequest(clientId, request) {
    const signature = request.headers?.[this.headerName];
    const timestamp = request.headers?.[this.timestampHeader];
    
    if (!signature) {
      this.stats.failed++;
      this.stats.byReason['missing_signature'] = (this.stats.byReason['missing_signature'] || 0) + 1;
      return { valid: false, reason: 'Missing signature header' };
    }
    
    const payload = typeof request.body === 'string' 
      ? request.body 
      : JSON.stringify(request.body);
    
    return this.verify(clientId, payload, signature, timestamp);
  }

  /**
   * Create signature data string
   */
  _createSignatureData(payload, timestamp) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return timestamp ? `${timestamp}.${body}` : body;
  }

  /**
   * Create HMAC signature
   */
  _createSignature(data, secret) {
    const hmac = createHmac(this.algorithm, secret);
    hmac.update(data);
    return `${this.algorithm}=${hmac.digest('hex')}`;
  }

  /**
   * Compare signatures safely
   */
  _compareSignatures(provided, expected) {
    try {
      const providedBuffer = Buffer.from(provided);
      const expectedBuffer = Buffer.from(expected);
      
      if (providedBuffer.length !== expectedBuffer.length) {
        return false;
      }
      
      return timingSafeEqual(providedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Generate a new secret
   */
  static generateSecret(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = '';
    const randomValues = new Uint8Array(length);
    globalThis.crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      secret += chars[randomValues[i] % chars.length];
    }
    return secret;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      algorithm: this.algorithm,
      registeredClients: this.secrets.size,
      ...this.stats,
      successRate: this.stats.totalVerifications > 0
        ? ((this.stats.successful / this.stats.totalVerifications) * 100).toFixed(1) + '%'
        : 'N/A',
    };
  }
}

export const requestSigning = new RequestSigning();
export { RequestSigning };
