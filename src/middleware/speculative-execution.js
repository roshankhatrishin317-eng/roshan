/**
 * Speculative Execution / Request Hedging
 * Send requests to multiple providers simultaneously, use first successful response
 * Dramatically reduces tail latency (P99) at cost of extra API calls
 */

import { circuitBreaker } from './circuit-breaker.js';
import { advancedMetrics } from '../metrics/advanced-metrics.js';

class SpeculativeExecutor {
  constructor(options = {}) {
    this.hedgeDelay = options.hedgeDelay || 2000; // Start hedge after 2s
    this.maxParallel = options.maxParallel || 3; // Max parallel requests
    this.enabled = options.enabled !== false;
    
    this.stats = {
      totalExecutions: 0,
      primaryWins: 0,
      hedgeWins: 0,
      cancelledHedges: 0,
      failedAll: 0,
    };
  }

  /**
   * Execute with speculative hedging
   * Primary request starts immediately, hedge requests start after delay
   */
  async execute(executors, options = {}) {
    if (!this.enabled || executors.length <= 1) {
      // Just run primary
      return executors[0]();
    }
    
    this.stats.totalExecutions++;
    const hedgeDelay = options.hedgeDelay || this.hedgeDelay;
    const maxParallel = Math.min(options.maxParallel || this.maxParallel, executors.length);
    
    const controllers = [];
    const promises = [];
    let winner = null;
    let winnerIndex = -1;
    
    // Start primary request immediately
    const primaryController = new AbortController();
    controllers.push(primaryController);
    
    const primaryPromise = this._executeWithAbort(executors[0], primaryController.signal, 0)
      .then(result => {
        if (!winner) {
          winner = result;
          winnerIndex = 0;
        }
        return { result, index: 0 };
      });
    promises.push(primaryPromise);
    
    // Schedule hedge requests
    for (let i = 1; i < maxParallel; i++) {
      const controller = new AbortController();
      controllers.push(controller);
      
      const hedgePromise = new Promise(async (resolve) => {
        // Wait before starting hedge
        await new Promise(r => setTimeout(r, hedgeDelay * i));
        
        // Check if we already have a winner
        if (winner) {
          this.stats.cancelledHedges++;
          resolve({ cancelled: true, index: i });
          return;
        }
        
        try {
          const result = await this._executeWithAbort(executors[i], controller.signal, i);
          if (!winner) {
            winner = result;
            winnerIndex = i;
          }
          resolve({ result, index: i });
        } catch (error) {
          resolve({ error, index: i });
        }
      });
      
      promises.push(hedgePromise);
    }
    
    // Race all promises
    try {
      const results = await Promise.race([
        // Wait for first success
        new Promise(async (resolve, reject) => {
          const outcomes = await Promise.allSettled(promises);
          
          // Find first successful result
          for (const outcome of outcomes) {
            if (outcome.status === 'fulfilled' && outcome.value.result) {
              resolve(outcome.value);
              return;
            }
          }
          
          // All failed
          this.stats.failedAll++;
          reject(new Error('All speculative executions failed'));
        }),
      ]);
      
      // Cancel remaining requests
      controllers.forEach((ctrl, i) => {
        if (i !== results.index) {
          ctrl.abort();
        }
      });
      
      // Update stats
      if (results.index === 0) {
        this.stats.primaryWins++;
      } else {
        this.stats.hedgeWins++;
        console.log(`[Speculative] Hedge request #${results.index} won!`);
      }
      
      return results.result;
      
    } catch (error) {
      // Abort all remaining
      controllers.forEach(ctrl => ctrl.abort());
      throw error;
    }
  }

  /**
   * Execute with abort support
   */
  async _executeWithAbort(executor, signal, index) {
    if (signal.aborted) {
      throw new Error('Aborted');
    }
    
    // Pass abort signal to executor if it accepts it
    return executor(signal);
  }

  /**
   * Execute streaming with hedging
   * More complex - starts multiple streams, pipes first to respond
   */
  async *executeStream(streamFactories, options = {}) {
    if (!this.enabled || streamFactories.length <= 1) {
      yield* await streamFactories[0]();
      return;
    }
    
    const hedgeDelay = options.hedgeDelay || this.hedgeDelay;
    const maxParallel = Math.min(options.maxParallel || 2, streamFactories.length); // Limit parallel streams
    
    let winningStream = null;
    let winnerIndex = -1;
    const startedStreams = [];
    
    // Start primary stream
    const primaryStreamPromise = streamFactories[0]().then(stream => {
      if (!winningStream) {
        winningStream = stream;
        winnerIndex = 0;
      }
      return { stream, index: 0 };
    });
    startedStreams.push(primaryStreamPromise);
    
    // Race to first chunk
    const racePromises = [
      primaryStreamPromise.then(async ({ stream }) => {
        const reader = stream[Symbol.asyncIterator]();
        const first = await reader.next();
        return { first, stream, reader, index: 0 };
      }),
    ];
    
    // Schedule hedge stream after delay
    if (maxParallel > 1) {
      const hedgePromise = new Promise(async (resolve) => {
        await new Promise(r => setTimeout(r, hedgeDelay));
        
        if (winningStream) {
          resolve({ cancelled: true });
          return;
        }
        
        try {
          const stream = await streamFactories[1]();
          const reader = stream[Symbol.asyncIterator]();
          const first = await reader.next();
          resolve({ first, stream, reader, index: 1 });
        } catch (error) {
          resolve({ error });
        }
      });
      racePromises.push(hedgePromise);
    }
    
    // Wait for first stream to produce a chunk
    const winner = await Promise.race(racePromises);
    
    if (winner.cancelled || winner.error) {
      // Primary won during hedge delay
      const { reader, first } = await racePromises[0];
      if (!first.done) yield first.value;
      for await (const chunk of { [Symbol.asyncIterator]: () => reader }) {
        yield chunk;
      }
      return;
    }
    
    // Use winning stream
    if (winner.index > 0) {
      this.stats.hedgeWins++;
      console.log(`[Speculative] Hedge stream #${winner.index} won!`);
    } else {
      this.stats.primaryWins++;
    }
    
    // Yield first chunk
    if (!winner.first.done) {
      yield winner.first.value;
    }
    
    // Continue with winning stream
    for await (const chunk of { [Symbol.asyncIterator]: () => winner.reader }) {
      yield chunk;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.stats.primaryWins + this.stats.hedgeWins;
    return {
      ...this.stats,
      hedgeWinRate: total > 0 
        ? ((this.stats.hedgeWins / total) * 100).toFixed(2) + '%'
        : '0%',
      enabled: this.enabled,
      hedgeDelay: this.hedgeDelay,
      maxParallel: this.maxParallel,
    };
  }

  /**
   * Enable/disable speculative execution
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

export const speculativeExecutor = new SpeculativeExecutor();
export { SpeculativeExecutor };
