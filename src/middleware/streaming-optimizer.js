/**
 * Streaming Optimizer
 * Optimize streaming responses with buffering, chunking, and backpressure
 */

import { EventEmitter } from 'events';

class StreamingOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.enabled = options.enabled !== false;
    this.bufferSize = options.bufferSize || 10; // Chunks to buffer
    this.flushInterval = options.flushInterval || 50; // ms
    this.minChunkSize = options.minChunkSize || 1; // Min chars per flush
    this.maxChunkSize = options.maxChunkSize || 1000; // Max chars per flush
    
    this.activeStreams = new Map();
    
    this.stats = {
      totalStreams: 0,
      activeStreams: 0,
      totalChunksIn: 0,
      totalChunksOut: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
      avgLatency: 0,
    };
    
    this._latencies = [];
  }

  /**
   * Create an optimized stream
   */
  createStream(streamId, options = {}) {
    const stream = {
      id: streamId,
      buffer: [],
      bufferSize: 0,
      startTime: Date.now(),
      firstChunkTime: null,
      lastFlushTime: Date.now(),
      chunksIn: 0,
      chunksOut: 0,
      bytesIn: 0,
      bytesOut: 0,
      paused: false,
      callbacks: {
        onChunk: options.onChunk,
        onComplete: options.onComplete,
        onError: options.onError,
      },
      options: {
        bufferSize: options.bufferSize || this.bufferSize,
        flushInterval: options.flushInterval || this.flushInterval,
        minChunkSize: options.minChunkSize || this.minChunkSize,
        maxChunkSize: options.maxChunkSize || this.maxChunkSize,
        aggregateTokens: options.aggregateTokens !== false,
      },
      flushTimer: null,
    };
    
    this.activeStreams.set(streamId, stream);
    this.stats.totalStreams++;
    this.stats.activeStreams++;
    
    // Start flush timer
    stream.flushTimer = setInterval(
      () => this._autoFlush(stream),
      stream.options.flushInterval
    );
    
    return {
      push: (chunk) => this.pushChunk(streamId, chunk),
      flush: () => this.flush(streamId),
      pause: () => this.pause(streamId),
      resume: () => this.resume(streamId),
      complete: () => this.complete(streamId),
      error: (err) => this.error(streamId, err),
    };
  }

  /**
   * Push chunk to stream
   */
  pushChunk(streamId, chunk) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;
    
    // Record first chunk time
    if (!stream.firstChunkTime) {
      stream.firstChunkTime = Date.now();
      const ttfb = stream.firstChunkTime - stream.startTime;
      this._recordLatency(ttfb);
    }
    
    stream.chunksIn++;
    stream.bytesIn += chunk.length || 0;
    this.stats.totalChunksIn++;
    this.stats.totalBytesIn += chunk.length || 0;
    
    // Add to buffer
    stream.buffer.push(chunk);
    stream.bufferSize += chunk.length || 0;
    
    // Check if should flush
    if (this._shouldFlush(stream)) {
      this._flushBuffer(stream);
    }
  }

  /**
   * Check if buffer should be flushed
   */
  _shouldFlush(stream) {
    if (stream.paused) return false;
    if (stream.buffer.length >= stream.options.bufferSize) return true;
    if (stream.bufferSize >= stream.options.maxChunkSize) return true;
    return false;
  }

  /**
   * Auto-flush on timer
   */
  _autoFlush(stream) {
    if (stream.paused) return;
    if (stream.bufferSize >= stream.options.minChunkSize) {
      this._flushBuffer(stream);
    }
  }

  /**
   * Flush buffer
   */
  _flushBuffer(stream) {
    if (stream.buffer.length === 0) return;
    
    // Aggregate chunks
    let aggregated;
    if (stream.options.aggregateTokens) {
      aggregated = this._aggregateChunks(stream.buffer);
    } else {
      aggregated = stream.buffer;
    }
    
    // Clear buffer
    stream.buffer = [];
    stream.bufferSize = 0;
    stream.lastFlushTime = Date.now();
    
    // Send chunks
    const chunks = Array.isArray(aggregated) ? aggregated : [aggregated];
    for (const chunk of chunks) {
      stream.chunksOut++;
      stream.bytesOut += typeof chunk === 'string' ? chunk.length : 0;
      this.stats.totalChunksOut++;
      this.stats.totalBytesOut += typeof chunk === 'string' ? chunk.length : 0;
      
      if (stream.callbacks.onChunk) {
        stream.callbacks.onChunk(chunk);
      }
      this.emit('chunk', { streamId: stream.id, chunk });
    }
  }

  /**
   * Aggregate chunks intelligently
   */
  _aggregateChunks(chunks) {
    // For text content, join into single string
    if (chunks.every(c => typeof c === 'string')) {
      return chunks.join('');
    }
    
    // For objects (like SSE data), merge where possible
    if (chunks.every(c => typeof c === 'object' && c !== null)) {
      const content = chunks
        .map(c => c.choices?.[0]?.delta?.content || '')
        .join('');
      
      if (content) {
        return {
          ...chunks[chunks.length - 1],
          choices: [{
            ...chunks[chunks.length - 1].choices?.[0],
            delta: { content },
          }],
        };
      }
    }
    
    return chunks;
  }

  /**
   * Force flush
   */
  flush(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      this._flushBuffer(stream);
    }
  }

  /**
   * Pause stream
   */
  pause(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.paused = true;
    }
  }

  /**
   * Resume stream
   */
  resume(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.paused = false;
      if (stream.buffer.length > 0) {
        this._flushBuffer(stream);
      }
    }
  }

  /**
   * Complete stream
   */
  complete(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;
    
    // Final flush
    this._flushBuffer(stream);
    
    // Cleanup
    clearInterval(stream.flushTimer);
    
    const stats = {
      duration: Date.now() - stream.startTime,
      ttfb: stream.firstChunkTime ? stream.firstChunkTime - stream.startTime : null,
      chunksIn: stream.chunksIn,
      chunksOut: stream.chunksOut,
      bytesIn: stream.bytesIn,
      bytesOut: stream.bytesOut,
      compressionRatio: stream.chunksIn > 0 ? (stream.chunksOut / stream.chunksIn).toFixed(2) : 1,
    };
    
    if (stream.callbacks.onComplete) {
      stream.callbacks.onComplete(stats);
    }
    this.emit('complete', { streamId, stats });
    
    this.activeStreams.delete(streamId);
    this.stats.activeStreams--;
    
    return stats;
  }

  /**
   * Error in stream
   */
  error(streamId, error) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;
    
    clearInterval(stream.flushTimer);
    
    if (stream.callbacks.onError) {
      stream.callbacks.onError(error);
    }
    this.emit('error', { streamId, error });
    
    this.activeStreams.delete(streamId);
    this.stats.activeStreams--;
  }

  /**
   * Record latency
   */
  _recordLatency(latency) {
    this._latencies.push(latency);
    if (this._latencies.length > 100) {
      this._latencies.shift();
    }
    this.stats.avgLatency = this._latencies.reduce((a, b) => a + b, 0) / this._latencies.length;
  }

  /**
   * Get stream info
   */
  getStreamInfo(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return null;
    
    return {
      id: stream.id,
      duration: Date.now() - stream.startTime,
      bufferSize: stream.bufferSize,
      chunksIn: stream.chunksIn,
      chunksOut: stream.chunksOut,
      paused: stream.paused,
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      config: {
        bufferSize: this.bufferSize,
        flushInterval: this.flushInterval,
        minChunkSize: this.minChunkSize,
        maxChunkSize: this.maxChunkSize,
      },
      ...this.stats,
      avgLatencyMs: Math.round(this.stats.avgLatency),
      compressionRatio: this.stats.totalChunksIn > 0
        ? (this.stats.totalChunksOut / this.stats.totalChunksIn).toFixed(2)
        : 1,
    };
  }
}

export const streamingOptimizer = new StreamingOptimizer();
export { StreamingOptimizer };
