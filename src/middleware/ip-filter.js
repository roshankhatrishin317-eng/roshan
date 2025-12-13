/**
 * IP Whitelist/Blacklist
 * Control access by IP address with support for CIDR ranges
 */

class IpFilter {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.mode = options.mode || 'blacklist'; // 'whitelist' or 'blacklist'
    
    this.whitelist = new Set();
    this.blacklist = new Set();
    this.cidrWhitelist = [];
    this.cidrBlacklist = [];
    
    // Temporary blocks (for rate limit abuse, etc.)
    this.tempBlocks = new Map(); // ip -> { until, reason }
    
    this.stats = {
      totalChecks: 0,
      allowed: 0,
      blocked: 0,
      byReason: {},
    };
  }

  /**
   * Check if IP is allowed
   */
  check(ip) {
    if (!this.enabled) return { allowed: true };
    
    this.stats.totalChecks++;
    
    // Normalize IP
    ip = this._normalizeIp(ip);
    
    // Check temporary blocks first
    const tempBlock = this.tempBlocks.get(ip);
    if (tempBlock && Date.now() < tempBlock.until) {
      this.stats.blocked++;
      this.stats.byReason['temp_block'] = (this.stats.byReason['temp_block'] || 0) + 1;
      return {
        allowed: false,
        reason: tempBlock.reason || 'Temporarily blocked',
        until: tempBlock.until,
      };
    } else if (tempBlock) {
      this.tempBlocks.delete(ip);
    }
    
    // Whitelist mode: only allow whitelisted IPs
    if (this.mode === 'whitelist') {
      const isWhitelisted = this._isInList(ip, this.whitelist, this.cidrWhitelist);
      if (!isWhitelisted) {
        this.stats.blocked++;
        this.stats.byReason['not_whitelisted'] = (this.stats.byReason['not_whitelisted'] || 0) + 1;
        return { allowed: false, reason: 'IP not in whitelist' };
      }
    }
    
    // Always check blacklist
    const isBlacklisted = this._isInList(ip, this.blacklist, this.cidrBlacklist);
    if (isBlacklisted) {
      this.stats.blocked++;
      this.stats.byReason['blacklisted'] = (this.stats.byReason['blacklisted'] || 0) + 1;
      return { allowed: false, reason: 'IP is blacklisted' };
    }
    
    this.stats.allowed++;
    return { allowed: true };
  }

  /**
   * Add IP to whitelist
   */
  addToWhitelist(ip) {
    if (ip.includes('/')) {
      this.cidrWhitelist.push(this._parseCidr(ip));
    } else {
      this.whitelist.add(this._normalizeIp(ip));
    }
  }

  /**
   * Remove IP from whitelist
   */
  removeFromWhitelist(ip) {
    if (ip.includes('/')) {
      this.cidrWhitelist = this.cidrWhitelist.filter(
        c => c.original !== ip
      );
    } else {
      this.whitelist.delete(this._normalizeIp(ip));
    }
  }

  /**
   * Add IP to blacklist
   */
  addToBlacklist(ip) {
    if (ip.includes('/')) {
      this.cidrBlacklist.push(this._parseCidr(ip));
    } else {
      this.blacklist.add(this._normalizeIp(ip));
    }
  }

  /**
   * Remove IP from blacklist
   */
  removeFromBlacklist(ip) {
    if (ip.includes('/')) {
      this.cidrBlacklist = this.cidrBlacklist.filter(
        c => c.original !== ip
      );
    } else {
      this.blacklist.delete(this._normalizeIp(ip));
    }
  }

  /**
   * Temporarily block an IP
   */
  tempBlock(ip, durationMs, reason = 'Temporary block') {
    ip = this._normalizeIp(ip);
    this.tempBlocks.set(ip, {
      until: Date.now() + durationMs,
      reason,
      blockedAt: Date.now(),
    });
  }

  /**
   * Unblock temporarily blocked IP
   */
  unblock(ip) {
    this.tempBlocks.delete(this._normalizeIp(ip));
  }

  /**
   * Check if IP is in list
   */
  _isInList(ip, exactSet, cidrList) {
    // Check exact match
    if (exactSet.has(ip)) return true;
    
    // Check CIDR ranges
    for (const cidr of cidrList) {
      if (this._ipInCidr(ip, cidr)) return true;
    }
    
    return false;
  }

  /**
   * Parse CIDR notation
   */
  _parseCidr(cidr) {
    const [ipStr, bits] = cidr.split('/');
    const ip = this._ipToLong(ipStr);
    const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
    
    return {
      original: cidr,
      network: ip & mask,
      mask,
    };
  }

  /**
   * Check if IP is in CIDR range
   */
  _ipInCidr(ip, cidr) {
    const ipLong = this._ipToLong(ip);
    return (ipLong & cidr.mask) === cidr.network;
  }

  /**
   * Convert IP string to long
   */
  _ipToLong(ip) {
    // Handle IPv6-mapped IPv4
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    
    const parts = ip.split('.');
    if (parts.length !== 4) return 0;
    
    return parts.reduce((acc, part) => (acc << 8) + parseInt(part), 0) >>> 0;
  }

  /**
   * Normalize IP address
   */
  _normalizeIp(ip) {
    if (!ip) return '0.0.0.0';
    
    // Remove IPv6 prefix for IPv4-mapped addresses
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    
    // Handle localhost
    if (ip === '::1') return '127.0.0.1';
    
    return ip;
  }

  /**
   * Set mode
   */
  setMode(mode) {
    if (['whitelist', 'blacklist'].includes(mode)) {
      this.mode = mode;
    }
  }

  /**
   * Get all lists
   */
  getLists() {
    return {
      mode: this.mode,
      whitelist: Array.from(this.whitelist),
      blacklist: Array.from(this.blacklist),
      cidrWhitelist: this.cidrWhitelist.map(c => c.original),
      cidrBlacklist: this.cidrBlacklist.map(c => c.original),
      tempBlocks: Array.from(this.tempBlocks.entries()).map(([ip, data]) => ({
        ip,
        ...data,
      })),
    };
  }

  /**
   * Import lists
   */
  importLists(data) {
    if (data.whitelist) {
      data.whitelist.forEach(ip => this.addToWhitelist(ip));
    }
    if (data.blacklist) {
      data.blacklist.forEach(ip => this.addToBlacklist(ip));
    }
    if (data.mode) {
      this.setMode(data.mode);
    }
  }

  /**
   * Clear all lists
   */
  clearAll() {
    this.whitelist.clear();
    this.blacklist.clear();
    this.cidrWhitelist = [];
    this.cidrBlacklist = [];
    this.tempBlocks.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      mode: this.mode,
      whitelistCount: this.whitelist.size + this.cidrWhitelist.length,
      blacklistCount: this.blacklist.size + this.cidrBlacklist.length,
      tempBlockCount: this.tempBlocks.size,
      ...this.stats,
    };
  }
}

export const ipFilter = new IpFilter();
export { IpFilter };
