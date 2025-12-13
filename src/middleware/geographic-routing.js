/**
 * Geographic Routing
 * Route requests to nearest/optimal endpoints based on location
 */

class GeographicRouter {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.endpoints = new Map();
    this.regions = new Map();
    this.defaultRegion = options.defaultRegion || 'us-east';
    
    this.stats = {
      totalRouted: 0,
      byRegion: {},
    };
    
    // Initialize default regions
    this._initDefaultRegions();
  }

  /**
   * Initialize default region mappings
   */
  _initDefaultRegions() {
    // Major cloud regions
    this.regions.set('us-east', {
      name: 'US East',
      latLng: [39.0438, -77.4874], // Virginia
      providers: [],
    });
    this.regions.set('us-west', {
      name: 'US West',
      latLng: [37.7749, -122.4194], // San Francisco
      providers: [],
    });
    this.regions.set('eu-west', {
      name: 'EU West',
      latLng: [53.3498, -6.2603], // Dublin
      providers: [],
    });
    this.regions.set('eu-central', {
      name: 'EU Central',
      latLng: [50.1109, 8.6821], // Frankfurt
      providers: [],
    });
    this.regions.set('asia-east', {
      name: 'Asia East',
      latLng: [35.6762, 139.6503], // Tokyo
      providers: [],
    });
    this.regions.set('asia-southeast', {
      name: 'Asia Southeast',
      latLng: [1.3521, 103.8198], // Singapore
      providers: [],
    });
  }

  /**
   * Register an endpoint
   */
  registerEndpoint(config) {
    const {
      id,
      name,
      url,
      region,
      provider,
      weight = 100,
      healthCheck,
      latencyMs = null,
    } = config;
    
    if (!id || !url || !region) {
      throw new Error('Endpoint must have id, url, and region');
    }
    
    const endpoint = {
      id,
      name: name || id,
      url,
      region,
      provider,
      weight,
      healthCheck,
      latencyMs,
      healthy: true,
      lastCheck: null,
      requestCount: 0,
    };
    
    this.endpoints.set(id, endpoint);
    
    // Add to region
    if (this.regions.has(region)) {
      this.regions.get(region).providers.push(id);
    }
    
    return endpoint;
  }

  /**
   * Route request based on client location
   */
  route(options = {}) {
    if (!this.enabled) {
      return this._getDefaultEndpoint();
    }
    
    this.stats.totalRouted++;
    
    let region;
    
    // Determine region from options
    if (options.region) {
      region = options.region;
    } else if (options.latLng) {
      region = this._findNearestRegion(options.latLng);
    } else if (options.ip) {
      region = this._regionFromIp(options.ip);
    } else if (options.country) {
      region = this._regionFromCountry(options.country);
    } else {
      region = this.defaultRegion;
    }
    
    this.stats.byRegion[region] = (this.stats.byRegion[region] || 0) + 1;
    
    // Get endpoints for region
    const regionData = this.regions.get(region);
    if (!regionData || regionData.providers.length === 0) {
      return this._getDefaultEndpoint();
    }
    
    // Select endpoint (weighted random among healthy endpoints)
    const endpoint = this._selectEndpoint(regionData.providers);
    
    if (endpoint) {
      endpoint.requestCount++;
      return {
        endpoint,
        region,
        url: endpoint.url,
      };
    }
    
    return this._getDefaultEndpoint();
  }

  /**
   * Find nearest region based on coordinates
   */
  _findNearestRegion(latLng) {
    let nearestRegion = this.defaultRegion;
    let minDistance = Infinity;
    
    for (const [regionId, region] of this.regions) {
      if (region.providers.length === 0) continue;
      
      const distance = this._haversineDistance(latLng, region.latLng);
      if (distance < minDistance) {
        minDistance = distance;
        nearestRegion = regionId;
      }
    }
    
    return nearestRegion;
  }

  /**
   * Calculate haversine distance between two points
   */
  _haversineDistance([lat1, lng1], [lat2, lng2]) {
    const R = 6371; // Earth's radius in km
    const dLat = this._toRad(lat2 - lat1);
    const dLng = this._toRad(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  _toRad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Map country to region
   */
  _regionFromCountry(country) {
    const countryMapping = {
      // North America
      US: 'us-east', CA: 'us-east', MX: 'us-west',
      // Europe
      GB: 'eu-west', IE: 'eu-west', FR: 'eu-west', ES: 'eu-west', PT: 'eu-west',
      DE: 'eu-central', NL: 'eu-central', BE: 'eu-central', AT: 'eu-central',
      PL: 'eu-central', CZ: 'eu-central', CH: 'eu-central',
      IT: 'eu-central', SE: 'eu-central', NO: 'eu-central', FI: 'eu-central', DK: 'eu-central',
      // Asia
      JP: 'asia-east', KR: 'asia-east', TW: 'asia-east', CN: 'asia-east',
      SG: 'asia-southeast', MY: 'asia-southeast', ID: 'asia-southeast',
      TH: 'asia-southeast', VN: 'asia-southeast', PH: 'asia-southeast',
      IN: 'asia-southeast', AU: 'asia-southeast', NZ: 'asia-southeast',
    };
    
    return countryMapping[country?.toUpperCase()] || this.defaultRegion;
  }

  /**
   * Simple IP-based region detection
   */
  _regionFromIp(ip) {
    // This is a simplified version - in production use a GeoIP database
    // For now, just return default
    return this.defaultRegion;
  }

  /**
   * Select endpoint from region
   */
  _selectEndpoint(endpointIds) {
    // Filter healthy endpoints
    const healthy = endpointIds
      .map(id => this.endpoints.get(id))
      .filter(e => e && e.healthy);
    
    if (healthy.length === 0) return null;
    if (healthy.length === 1) return healthy[0];
    
    // Weighted random selection
    const totalWeight = healthy.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * totalWeight;
    
    for (const endpoint of healthy) {
      rand -= endpoint.weight;
      if (rand <= 0) return endpoint;
    }
    
    return healthy[0];
  }

  /**
   * Get default endpoint
   */
  _getDefaultEndpoint() {
    const regionData = this.regions.get(this.defaultRegion);
    if (regionData && regionData.providers.length > 0) {
      const endpoint = this.endpoints.get(regionData.providers[0]);
      if (endpoint) {
        endpoint.requestCount++;
        return { endpoint, region: this.defaultRegion, url: endpoint.url };
      }
    }
    return null;
  }

  /**
   * Update endpoint health
   */
  setEndpointHealth(endpointId, healthy) {
    const endpoint = this.endpoints.get(endpointId);
    if (endpoint) {
      endpoint.healthy = healthy;
      endpoint.lastCheck = Date.now();
    }
  }

  /**
   * Update endpoint latency
   */
  updateLatency(endpointId, latencyMs) {
    const endpoint = this.endpoints.get(endpointId);
    if (endpoint) {
      endpoint.latencyMs = latencyMs;
    }
  }

  /**
   * Get endpoint
   */
  getEndpoint(endpointId) {
    return this.endpoints.get(endpointId);
  }

  /**
   * List endpoints
   */
  listEndpoints() {
    return Array.from(this.endpoints.values()).map(e => ({
      id: e.id,
      name: e.name,
      region: e.region,
      healthy: e.healthy,
      latencyMs: e.latencyMs,
      requestCount: e.requestCount,
    }));
  }

  /**
   * List regions
   */
  listRegions() {
    return Array.from(this.regions.entries()).map(([id, r]) => ({
      id,
      name: r.name,
      endpointCount: r.providers.length,
    }));
  }

  /**
   * Delete endpoint
   */
  deleteEndpoint(endpointId) {
    const endpoint = this.endpoints.get(endpointId);
    if (endpoint) {
      const region = this.regions.get(endpoint.region);
      if (region) {
        region.providers = region.providers.filter(p => p !== endpointId);
      }
      this.endpoints.delete(endpointId);
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
      defaultRegion: this.defaultRegion,
      endpointCount: this.endpoints.size,
      regionCount: this.regions.size,
      ...this.stats,
      endpoints: this.listEndpoints(),
      regions: this.listRegions(),
    };
  }
}

export const geographicRouter = new GeographicRouter();
export { GeographicRouter };
