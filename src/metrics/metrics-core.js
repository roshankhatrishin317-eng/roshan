import { EventEmitter } from 'events';

class MetricsCore extends EventEmitter {
  constructor() {
    super();
    // Global Counters
    this.totalRequests = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.activeRequests = 0;
    this.errors = 0;

    // Time Buckets for Rolling Averages (Last 60 seconds)
    // specific counters for TPM/RPM
    this.history = Array(60).fill().map(() => ({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      timestamp: 0
    }));
    
    // Pointer to current second bucket
    this.currentSecondIndex = 0;
    
    // Start Tickers
    this.startTickers();
  }

  startTickers() {
    // 1. History Bucket Rotation (Every 1 second)
    // This maintains the RPM/TPM calculation accuracy
    setInterval(() => {
      this.rotateBucket();
    }, 1000);

    // 2. Real-time UI Broadcast (Every 300ms / 0.3s)
    // This provides the high-frequency "live" feel requested
    setInterval(() => {
      this.emit('update', this.getStats());
    }, 300);
  }

  rotateBucket() {
    // Advance bucket pointer
    this.currentSecondIndex = (this.currentSecondIndex + 1) % 60;
    
    // Reset the new current bucket
    this.history[this.currentSecondIndex] = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      timestamp: Date.now()
    };
  }

  trackRequestStart() {
    this.activeRequests++;
    this.totalRequests++;
    
    // Increment current bucket
    this.history[this.currentSecondIndex].requests++;
  }

  trackRequestEnd() {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  trackTokens(input, output) {
    this.totalInputTokens += input;
    this.totalOutputTokens += output;
    
    // Increment current bucket
    this.history[this.currentSecondIndex].inputTokens += input;
    this.history[this.currentSecondIndex].outputTokens += output;
  }
  
  trackError() {
    this.errors++;
  }

  getStats() {
    // Calculate sums for the last window (e.g. 60s)
    let requestsLastMin = 0;
    let inputTokensLastMin = 0;
    let outputTokensLastMin = 0;
    
    for (const bucket of this.history) {
      requestsLastMin += bucket.requests;
      inputTokensLastMin += bucket.inputTokens;
      outputTokensLastMin += bucket.outputTokens;
    }
    
    const totalTokensLastMin = inputTokensLastMin + outputTokensLastMin;

    return {
      active_requests: this.activeRequests,
      total_requests: this.totalRequests,
      total_errors: this.errors,
      
      // Totals
      total_input_tokens: this.totalInputTokens,
      total_output_tokens: this.totalOutputTokens,
      
      // Rates
      rpm: requestsLastMin, // Requests Per Minute
      tpm: totalTokensLastMin, // Tokens Per Minute (Total)
      tpm_input: inputTokensLastMin,
      tpm_output: outputTokensLastMin,
      
      // TPS (Transactions Per Second) - Last completed second
      tps: this.history[(this.currentSecondIndex - 1 + 60) % 60].requests,

      // Total Tokens (Combined)
      total_tokens: this.totalInputTokens + this.totalOutputTokens,

      // TTPS (Tokens Per Second) - Averaged over last minute or just last second?
      // Typically TTPS is instantaneous (last second) or short avg.
      // Let's provide last second rate for "Live" feel.
      ttps_instant: this.history[this.currentSecondIndex].inputTokens + this.history[this.currentSecondIndex].outputTokens,
      
      // Average TTPS over the last minute
      ttps_avg: parseFloat((totalTokensLastMin / 60).toFixed(2)),
      
      timestamp: Date.now()
    };
  }
}

export const metrics = new MetricsCore();
