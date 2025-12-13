/**
 * A/B Testing for Models and Prompts
 * Test different models, prompts, or configurations to find optimal settings
 */

import { createHash } from 'crypto';
import { qualityScorer } from './quality-scoring.js';

class ABTesting {
  constructor(options = {}) {
    this.experiments = new Map();
    this.results = new Map();
    this.enabled = options.enabled !== false;
    
    this.stats = {
      totalExperiments: 0,
      activeExperiments: 0,
      totalAssignments: 0,
    };
  }

  /**
   * Create a new experiment
   */
  createExperiment(config) {
    const {
      id,
      name,
      description,
      variants,          // Array of variant configs
      trafficSplit,      // Array of percentages (must sum to 100)
      metrics = ['latency', 'quality', 'cost'],
      minSampleSize = 100,
      maxDuration = 7 * 24 * 60 * 60 * 1000, // 7 days default
    } = config;
    
    if (!id || !variants || variants.length < 2) {
      throw new Error('Experiment must have id and at least 2 variants');
    }
    
    // Validate traffic split
    const split = trafficSplit || variants.map(() => 100 / variants.length);
    if (Math.abs(split.reduce((a, b) => a + b, 0) - 100) > 0.1) {
      throw new Error('Traffic split must sum to 100');
    }
    
    const experiment = {
      id,
      name: name || id,
      description,
      variants: variants.map((v, i) => ({
        id: v.id || `variant_${i}`,
        name: v.name || `Variant ${i}`,
        config: v.config || v,
        weight: split[i],
      })),
      metrics,
      minSampleSize,
      maxDuration,
      startTime: Date.now(),
      status: 'active',
      assignments: new Map(), // userId -> variantId
    };
    
    this.experiments.set(id, experiment);
    
    // Initialize results tracking
    this.results.set(id, {
      variants: experiment.variants.map(v => ({
        id: v.id,
        name: v.name,
        samples: 0,
        metrics: {
          latency: { sum: 0, count: 0, values: [] },
          quality: { sum: 0, count: 0, values: [] },
          cost: { sum: 0, count: 0, values: [] },
          errors: 0,
        },
      })),
    });
    
    this.stats.totalExperiments++;
    this.stats.activeExperiments++;
    
    console.log(`[A/B Test] Created experiment: ${name} with ${variants.length} variants`);
    
    return experiment;
  }

  /**
   * Get variant assignment for a user/request
   */
  getAssignment(experimentId, userId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'active') {
      return null;
    }
    
    // Check for existing assignment (sticky sessions)
    if (experiment.assignments.has(userId)) {
      return this._getVariantById(experiment, experiment.assignments.get(userId));
    }
    
    // Assign new variant based on traffic split
    const variant = this._assignVariant(experiment, userId);
    experiment.assignments.set(userId, variant.id);
    this.stats.totalAssignments++;
    
    return variant;
  }

  /**
   * Assign variant based on traffic split
   */
  _assignVariant(experiment, userId) {
    // Use consistent hashing for deterministic assignment
    const hash = createHash('md5')
      .update(experiment.id + userId)
      .digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16);
    const percentage = (hashNum / 0xffffffff) * 100;
    
    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (percentage < cumulative) {
        return variant;
      }
    }
    
    return experiment.variants[experiment.variants.length - 1];
  }

  /**
   * Get variant by ID
   */
  _getVariantById(experiment, variantId) {
    return experiment.variants.find(v => v.id === variantId);
  }

  /**
   * Record result for an experiment
   */
  recordResult(experimentId, variantId, result) {
    const experimentResults = this.results.get(experimentId);
    if (!experimentResults) return;
    
    const variantResults = experimentResults.variants.find(v => v.id === variantId);
    if (!variantResults) return;
    
    variantResults.samples++;
    
    // Record latency
    if (result.latency !== undefined) {
      variantResults.metrics.latency.sum += result.latency;
      variantResults.metrics.latency.count++;
      variantResults.metrics.latency.values.push(result.latency);
      if (variantResults.metrics.latency.values.length > 1000) {
        variantResults.metrics.latency.values.shift();
      }
    }
    
    // Record quality score
    if (result.qualityScore !== undefined) {
      variantResults.metrics.quality.sum += result.qualityScore;
      variantResults.metrics.quality.count++;
      variantResults.metrics.quality.values.push(result.qualityScore);
      if (variantResults.metrics.quality.values.length > 1000) {
        variantResults.metrics.quality.values.shift();
      }
    }
    
    // Record cost
    if (result.cost !== undefined) {
      variantResults.metrics.cost.sum += result.cost;
      variantResults.metrics.cost.count++;
    }
    
    // Record error
    if (result.error) {
      variantResults.metrics.errors++;
    }
    
    // Check if experiment should conclude
    this._checkExperimentStatus(experimentId);
  }

  /**
   * Check if experiment has enough data to conclude
   */
  _checkExperimentStatus(experimentId) {
    const experiment = this.experiments.get(experimentId);
    const results = this.results.get(experimentId);
    
    if (!experiment || !results) return;
    
    // Check duration
    if (Date.now() - experiment.startTime > experiment.maxDuration) {
      this._concludeExperiment(experimentId, 'max_duration_reached');
      return;
    }
    
    // Check sample size
    const allHaveMinSamples = results.variants.every(
      v => v.samples >= experiment.minSampleSize
    );
    
    if (allHaveMinSamples) {
      // Check for statistical significance
      const significant = this._checkSignificance(results);
      if (significant) {
        this._concludeExperiment(experimentId, 'significant_result');
      }
    }
  }

  /**
   * Simple significance check
   */
  _checkSignificance(results) {
    if (results.variants.length < 2) return false;
    
    const metrics = results.variants.map(v => ({
      id: v.id,
      avgLatency: v.metrics.latency.count > 0 ? v.metrics.latency.sum / v.metrics.latency.count : 0,
      avgQuality: v.metrics.quality.count > 0 ? v.metrics.quality.sum / v.metrics.quality.count : 0,
      errorRate: v.samples > 0 ? v.metrics.errors / v.samples : 0,
    }));
    
    // Simple check: >10% difference in key metrics
    const latencyDiff = Math.abs(metrics[0].avgLatency - metrics[1].avgLatency) / 
      Math.max(metrics[0].avgLatency, metrics[1].avgLatency, 1);
    const qualityDiff = Math.abs(metrics[0].avgQuality - metrics[1].avgQuality);
    
    return latencyDiff > 0.1 || qualityDiff > 0.05;
  }

  /**
   * Conclude experiment
   */
  _concludeExperiment(experimentId, reason) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;
    
    experiment.status = 'concluded';
    experiment.endTime = Date.now();
    experiment.conclusionReason = reason;
    
    // Determine winner
    const results = this.results.get(experimentId);
    const winner = this._determineWinner(results);
    experiment.winner = winner;
    
    this.stats.activeExperiments--;
    
    console.log(`[A/B Test] Experiment ${experiment.name} concluded. Winner: ${winner?.name || 'inconclusive'}`);
  }

  /**
   * Determine winning variant
   */
  _determineWinner(results) {
    if (!results || results.variants.length === 0) return null;
    
    // Score each variant
    const scored = results.variants.map(v => {
      const avgLatency = v.metrics.latency.count > 0 ? v.metrics.latency.sum / v.metrics.latency.count : Infinity;
      const avgQuality = v.metrics.quality.count > 0 ? v.metrics.quality.sum / v.metrics.quality.count : 0;
      const errorRate = v.samples > 0 ? v.metrics.errors / v.samples : 1;
      
      // Combined score (lower latency better, higher quality better, lower errors better)
      const score = avgQuality - (avgLatency / 10000) - (errorRate * 10);
      
      return { ...v, score };
    });
    
    // Return highest scoring variant
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  /**
   * Get experiment results
   */
  getExperimentResults(experimentId) {
    const experiment = this.experiments.get(experimentId);
    const results = this.results.get(experimentId);
    
    if (!experiment || !results) return null;
    
    return {
      experiment: {
        id: experiment.id,
        name: experiment.name,
        status: experiment.status,
        startTime: experiment.startTime,
        endTime: experiment.endTime,
        winner: experiment.winner?.name,
      },
      variants: results.variants.map(v => ({
        id: v.id,
        name: v.name,
        samples: v.samples,
        avgLatency: v.metrics.latency.count > 0 
          ? Math.round(v.metrics.latency.sum / v.metrics.latency.count) 
          : null,
        avgQuality: v.metrics.quality.count > 0 
          ? (v.metrics.quality.sum / v.metrics.quality.count).toFixed(3)
          : null,
        totalCost: v.metrics.cost.sum.toFixed(4),
        errorRate: v.samples > 0 
          ? ((v.metrics.errors / v.samples) * 100).toFixed(2) + '%'
          : '0%',
      })),
    };
  }

  /**
   * List all experiments
   */
  listExperiments() {
    const list = [];
    for (const [id, exp] of this.experiments) {
      list.push({
        id,
        name: exp.name,
        status: exp.status,
        variants: exp.variants.length,
        totalAssignments: exp.assignments.size,
      });
    }
    return list;
  }

  /**
   * Stop experiment
   */
  stopExperiment(experimentId) {
    this._concludeExperiment(experimentId, 'manually_stopped');
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      experiments: this.listExperiments(),
    };
  }
}

export const abTesting = new ABTesting();
export { ABTesting };
