/**
 * Canary Deployments
 * Gradually roll out new providers/models with traffic shifting
 */

class CanaryDeployment {
  constructor(options = {}) {
    this.deployments = new Map();
    this.enabled = options.enabled !== false;
    
    this.stats = {
      totalDeployments: 0,
      activeDeployments: 0,
      completedDeployments: 0,
    };
  }

  /**
   * Create a canary deployment
   */
  create(config) {
    const {
      id,
      name,
      baseline,        // Current/stable config
      canary,          // New config to test
      initialWeight = 5,  // Initial canary traffic %
      maxWeight = 100,    // Max canary traffic %
      incrementStep = 5,  // Weight increment per step
      incrementInterval = 300000, // 5 minutes between increments
      rollbackThreshold,  // Error rate threshold to rollback
      successThreshold,   // Success threshold to complete
      metrics = ['errorRate', 'latency'],
    } = config;
    
    if (!id || !baseline || !canary) {
      throw new Error('Deployment must have id, baseline, and canary configs');
    }
    
    const deployment = {
      id,
      name: name || id,
      baseline,
      canary,
      currentWeight: initialWeight,
      maxWeight,
      incrementStep,
      incrementInterval,
      rollbackThreshold: rollbackThreshold || { errorRate: 0.1, latencyIncrease: 0.5 },
      successThreshold: successThreshold || { minRequests: 100, maxErrorRate: 0.02 },
      metrics,
      status: 'active',
      createdAt: Date.now(),
      lastIncrement: Date.now(),
      stats: {
        baseline: { requests: 0, errors: 0, totalLatency: 0 },
        canary: { requests: 0, errors: 0, totalLatency: 0 },
      },
      history: [],
    };
    
    this.deployments.set(id, deployment);
    this.stats.totalDeployments++;
    this.stats.activeDeployments++;
    
    // Start auto-increment
    deployment.incrementTimer = setInterval(
      () => this._autoIncrement(deployment),
      incrementInterval
    );
    
    console.log(`[Canary] Created deployment: ${name} (${initialWeight}% canary)`);
    
    return this._getDeploymentInfo(deployment);
  }

  /**
   * Route request based on canary weight
   */
  route(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment || deployment.status !== 'active') {
      return { config: deployment?.baseline || null, variant: 'baseline' };
    }
    
    // Random routing based on weight
    const rand = Math.random() * 100;
    const variant = rand < deployment.currentWeight ? 'canary' : 'baseline';
    
    return {
      config: variant === 'canary' ? deployment.canary : deployment.baseline,
      variant,
      deploymentId,
    };
  }

  /**
   * Record request result
   */
  recordResult(deploymentId, variant, result) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;
    
    const stats = deployment.stats[variant];
    if (!stats) return;
    
    stats.requests++;
    if (result.error) stats.errors++;
    if (result.latency) stats.totalLatency += result.latency;
    
    // Check thresholds
    this._checkThresholds(deployment);
  }

  /**
   * Check if thresholds are met
   */
  _checkThresholds(deployment) {
    const canary = deployment.stats.canary;
    const baseline = deployment.stats.baseline;
    
    if (canary.requests < 10) return; // Need minimum data
    
    const canaryErrorRate = canary.errors / canary.requests;
    const baselineErrorRate = baseline.requests > 0 ? baseline.errors / baseline.requests : 0;
    
    const canaryLatency = canary.totalLatency / canary.requests;
    const baselineLatency = baseline.requests > 0 ? baseline.totalLatency / baseline.requests : canaryLatency;
    
    // Check rollback conditions
    if (canaryErrorRate > deployment.rollbackThreshold.errorRate) {
      this._rollback(deployment, `Error rate too high: ${(canaryErrorRate * 100).toFixed(1)}%`);
      return;
    }
    
    const latencyIncrease = (canaryLatency - baselineLatency) / baselineLatency;
    if (latencyIncrease > deployment.rollbackThreshold.latencyIncrease) {
      this._rollback(deployment, `Latency increase too high: ${(latencyIncrease * 100).toFixed(1)}%`);
      return;
    }
    
    // Check success conditions
    if (deployment.currentWeight >= deployment.maxWeight &&
        canary.requests >= deployment.successThreshold.minRequests &&
        canaryErrorRate <= deployment.successThreshold.maxErrorRate) {
      this._complete(deployment);
    }
  }

  /**
   * Auto-increment canary weight
   */
  _autoIncrement(deployment) {
    if (deployment.status !== 'active') return;
    if (deployment.currentWeight >= deployment.maxWeight) return;
    
    const oldWeight = deployment.currentWeight;
    deployment.currentWeight = Math.min(
      deployment.currentWeight + deployment.incrementStep,
      deployment.maxWeight
    );
    deployment.lastIncrement = Date.now();
    
    deployment.history.push({
      action: 'increment',
      from: oldWeight,
      to: deployment.currentWeight,
      timestamp: Date.now(),
    });
    
    console.log(`[Canary] ${deployment.name}: ${oldWeight}% -> ${deployment.currentWeight}%`);
  }

  /**
   * Manually set canary weight
   */
  setWeight(deploymentId, weight) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    
    const oldWeight = deployment.currentWeight;
    deployment.currentWeight = Math.max(0, Math.min(weight, deployment.maxWeight));
    
    deployment.history.push({
      action: 'manual_set',
      from: oldWeight,
      to: deployment.currentWeight,
      timestamp: Date.now(),
    });
    
    return this._getDeploymentInfo(deployment);
  }

  /**
   * Rollback deployment
   */
  _rollback(deployment, reason) {
    deployment.status = 'rolled_back';
    deployment.endTime = Date.now();
    deployment.rollbackReason = reason;
    
    clearInterval(deployment.incrementTimer);
    
    deployment.history.push({
      action: 'rollback',
      reason,
      timestamp: Date.now(),
    });
    
    this.stats.activeDeployments--;
    
    console.log(`[Canary] Rolled back ${deployment.name}: ${reason}`);
  }

  /**
   * Complete deployment
   */
  _complete(deployment) {
    deployment.status = 'completed';
    deployment.endTime = Date.now();
    
    clearInterval(deployment.incrementTimer);
    
    deployment.history.push({
      action: 'complete',
      timestamp: Date.now(),
    });
    
    this.stats.activeDeployments--;
    this.stats.completedDeployments++;
    
    console.log(`[Canary] Completed ${deployment.name}`);
  }

  /**
   * Manually rollback
   */
  rollback(deploymentId, reason = 'Manual rollback') {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    
    this._rollback(deployment, reason);
    return this._getDeploymentInfo(deployment);
  }

  /**
   * Promote canary to 100%
   */
  promote(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    
    deployment.currentWeight = 100;
    this._complete(deployment);
    
    return this._getDeploymentInfo(deployment);
  }

  /**
   * Get deployment info
   */
  _getDeploymentInfo(deployment) {
    const canary = deployment.stats.canary;
    const baseline = deployment.stats.baseline;
    
    return {
      id: deployment.id,
      name: deployment.name,
      status: deployment.status,
      currentWeight: deployment.currentWeight,
      maxWeight: deployment.maxWeight,
      createdAt: deployment.createdAt,
      endTime: deployment.endTime,
      rollbackReason: deployment.rollbackReason,
      stats: {
        baseline: {
          requests: baseline.requests,
          errorRate: baseline.requests > 0 ? (baseline.errors / baseline.requests * 100).toFixed(2) + '%' : 'N/A',
          avgLatency: baseline.requests > 0 ? Math.round(baseline.totalLatency / baseline.requests) : null,
        },
        canary: {
          requests: canary.requests,
          errorRate: canary.requests > 0 ? (canary.errors / canary.requests * 100).toFixed(2) + '%' : 'N/A',
          avgLatency: canary.requests > 0 ? Math.round(canary.totalLatency / canary.requests) : null,
        },
      },
      history: deployment.history.slice(-10),
    };
  }

  /**
   * Get deployment
   */
  getDeployment(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    return deployment ? this._getDeploymentInfo(deployment) : null;
  }

  /**
   * List deployments
   */
  listDeployments() {
    return Array.from(this.deployments.values()).map(d => this._getDeploymentInfo(d));
  }

  /**
   * Delete deployment
   */
  deleteDeployment(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (deployment) {
      clearInterval(deployment.incrementTimer);
      if (deployment.status === 'active') this.stats.activeDeployments--;
      this.deployments.delete(deploymentId);
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
      deployments: this.listDeployments(),
    };
  }
}

export const canaryDeployment = new CanaryDeployment();
export { CanaryDeployment };
