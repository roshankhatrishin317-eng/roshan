/**
 * Advanced Stream Handler with Backpressure Support
 * Handles slow clients without blocking upstream providers
 */

import { Transform, PassThrough } from 'stream';

/**
 * Backpressure-aware stream transformer
 * Buffers chunks when downstream is slow
 */
class BackpressureStream extends Transform {
  constructor(options = {}) {
    super({
      ...options,
      objectMode: true,
    });
    
    this.maxBufferSize = options.maxBufferSize || 100;
    this.buffer = [];
    this.isPaused = false;
    this.droppedChunks = 0;
    this.totalChunks = 0;
  }

  _transform(chunk, encoding, callback) {
    this.totalChunks++;
    
    // Check if downstream can accept data
    const canPush = this.push(chunk);
    
    if (!canPush) {
      // Downstream is slow, buffer the chunk
      if (this.buffer.length < this.maxBufferSize) {
        this.buffer.push(chunk);
      } else {
        // Buffer full, drop oldest chunk (for real-time streaming)
        this.buffer.shift();
        this.buffer.push(chunk);
        this.droppedChunks++;
      }
      this.isPaused = true;
    }
    
    callback();
  }

  _flush(callback) {
    // Push any remaining buffered chunks
    while (this.buffer.length > 0) {
      this.push(this.buffer.shift());
    }
    callback();
  }

  getStats() {
    return {
      totalChunks: this.totalChunks,
      droppedChunks: this.droppedChunks,
      bufferedChunks: this.buffer.length,
      isPaused: this.isPaused,
    };
  }
}

/**
 * SSE (Server-Sent Events) Stream Formatter
 */
class SSEStream extends Transform {
  constructor(options = {}) {
    super({
      ...options,
      objectMode: true,
    });
    
    this.eventType = options.eventType || null;
    this.includeId = options.includeId || false;
    this.eventId = 0;
  }

  _transform(chunk, encoding, callback) {
    let output = '';
    
    // Add event ID if enabled
    if (this.includeId) {
      output += `id: ${++this.eventId}\n`;
    }
    
    // Add event type if specified
    if (this.eventType) {
      output += `event: ${this.eventType}\n`;
    }
    
    // Handle different chunk types
    if (typeof chunk === 'string') {
      output += `data: ${chunk}\n\n`;
    } else if (chunk && typeof chunk === 'object') {
      // Check if chunk has its own event type
      if (chunk.type) {
        output = `event: ${chunk.type}\n`;
      }
      output += `data: ${JSON.stringify(chunk)}\n\n`;
    }
    
    this.push(output);
    callback();
  }
}

/**
 * Stream timeout handler
 * Terminates stream if no data received within timeout
 */
class TimeoutStream extends Transform {
  constructor(options = {}) {
    super({
      ...options,
      objectMode: true,
    });
    
    this.timeout = options.timeout || 60000; // 60 seconds default
    this.timer = null;
    this.timedOut = false;
    
    this._resetTimer();
  }

  _resetTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.emit('timeout');
      this.destroy(new Error('Stream timeout - no data received'));
    }, this.timeout);
  }

  _transform(chunk, encoding, callback) {
    this._resetTimer();
    this.push(chunk);
    callback();
  }

  _flush(callback) {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    callback();
  }

  _destroy(err, callback) {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    callback(err);
  }
}

/**
 * Stream multiplexer - send to multiple destinations
 */
class StreamMultiplexer {
  constructor() {
    this.streams = new Map();
  }

  /**
   * Add a destination stream
   */
  addDestination(id, stream) {
    this.streams.set(id, stream);
  }

  /**
   * Remove a destination stream
   */
  removeDestination(id) {
    const stream = this.streams.get(id);
    if (stream) {
      stream.end();
      this.streams.delete(id);
    }
  }

  /**
   * Write to all destinations
   */
  write(chunk) {
    for (const [id, stream] of this.streams) {
      try {
        if (!stream.destroyed) {
          stream.write(chunk);
        } else {
          this.streams.delete(id);
        }
      } catch (error) {
        console.error(`[Multiplexer] Error writing to stream ${id}:`, error.message);
        this.streams.delete(id);
      }
    }
  }

  /**
   * End all streams
   */
  end() {
    for (const [id, stream] of this.streams) {
      try {
        stream.end();
      } catch (error) {
        // Ignore end errors
      }
    }
    this.streams.clear();
  }

  /**
   * Get active stream count
   */
  get size() {
    return this.streams.size;
  }
}

/**
 * Create a managed stream pipeline with backpressure
 */
function createManagedStream(options = {}) {
  const backpressure = new BackpressureStream({
    maxBufferSize: options.maxBufferSize || 100,
  });
  
  const timeout = new TimeoutStream({
    timeout: options.timeout || 120000, // 2 minutes for LLM streams
  });
  
  const sse = new SSEStream({
    eventType: options.eventType,
    includeId: options.includeId,
  });
  
  // Create pipeline
  const pipeline = backpressure.pipe(timeout);
  
  if (options.useSSE) {
    pipeline.pipe(sse);
    return { input: backpressure, output: sse, timeout, backpressure };
  }
  
  return { input: backpressure, output: pipeline, timeout, backpressure };
}

/**
 * Async iterator to stream converter
 */
async function* iteratorToStream(asyncIterator, transform = null) {
  for await (const chunk of asyncIterator) {
    if (transform) {
      yield transform(chunk);
    } else {
      yield chunk;
    }
  }
}

/**
 * Stream with automatic retry on failure
 */
class RetryableStream extends PassThrough {
  constructor(streamFactory, options = {}) {
    super({ objectMode: true });
    
    this.streamFactory = streamFactory;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.currentRetry = 0;
    this.chunks = []; // Buffer chunks for retry
    this.bufferForRetry = options.bufferForRetry || false;
    
    this._startStream();
  }

  async _startStream() {
    try {
      const sourceStream = await this.streamFactory();
      
      sourceStream.on('data', (chunk) => {
        if (this.bufferForRetry) {
          this.chunks.push(chunk);
        }
        this.push(chunk);
      });
      
      sourceStream.on('end', () => {
        this.push(null);
      });
      
      sourceStream.on('error', async (error) => {
        if (this.currentRetry < this.maxRetries) {
          this.currentRetry++;
          console.log(`[RetryableStream] Retry ${this.currentRetry}/${this.maxRetries} after error: ${error.message}`);
          
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.currentRetry));
          
          // Re-emit buffered chunks if needed
          if (this.bufferForRetry && this.chunks.length > 0) {
            console.log(`[RetryableStream] Re-emitting ${this.chunks.length} buffered chunks`);
          }
          
          this._startStream();
        } else {
          this.destroy(error);
        }
      });
      
    } catch (error) {
      if (this.currentRetry < this.maxRetries) {
        this.currentRetry++;
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.currentRetry));
        this._startStream();
      } else {
        this.destroy(error);
      }
    }
  }
}

export {
  BackpressureStream,
  SSEStream,
  TimeoutStream,
  StreamMultiplexer,
  RetryableStream,
  createManagedStream,
  iteratorToStream,
};
