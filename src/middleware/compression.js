/**
 * Response Compression Middleware
 * Adds gzip/brotli compression for non-streaming responses
 */

import { createGzip, createBrotliCompress, constants } from 'zlib';
import { Transform } from 'stream';

/**
 * Check if response should be compressed
 */
function shouldCompress(request, contentType, contentLength) {
  // Don't compress streaming responses
  if (contentType && contentType.includes('text/event-stream')) {
    return false;
  }
  
  // Don't compress already compressed content
  if (contentType && (
    contentType.includes('gzip') ||
    contentType.includes('br') ||
    contentType.includes('deflate')
  )) {
    return false;
  }
  
  // Don't compress small responses (less than 1KB)
  if (contentLength && contentLength < 1024) {
    return false;
  }
  
  // Don't compress images/video
  if (contentType && (
    contentType.includes('image/') ||
    contentType.includes('video/') ||
    contentType.includes('audio/')
  )) {
    return false;
  }
  
  return true;
}

/**
 * Get preferred encoding from Accept-Encoding header
 */
function getPreferredEncoding(acceptEncoding) {
  if (!acceptEncoding) return null;
  
  const encodings = acceptEncoding.toLowerCase();
  
  // Prefer brotli for better compression
  if (encodings.includes('br')) {
    return 'br';
  }
  
  if (encodings.includes('gzip')) {
    return 'gzip';
  }
  
  return null;
}

/**
 * Create compression stream
 */
function createCompressionStream(encoding, options = {}) {
  const level = options.level || 6; // Default compression level
  
  if (encoding === 'br') {
    return createBrotliCompress({
      params: {
        [constants.BROTLI_PARAM_QUALITY]: level,
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      },
    });
  }
  
  if (encoding === 'gzip') {
    return createGzip({
      level,
    });
  }
  
  return null;
}

/**
 * Compress data buffer
 */
async function compressBuffer(data, encoding) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = createCompressionStream(encoding);
    
    if (!stream) {
      resolve(data);
      return;
    }
    
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    
    stream.write(data);
    stream.end();
  });
}

/**
 * Fastify compression plugin
 */
async function compressionPlugin(fastify, options = {}) {
  const threshold = options.threshold || 1024; // Min size to compress
  const level = options.level || 6;
  
  fastify.addHook('onSend', async (request, reply, payload) => {
    // Skip if already encoded
    if (reply.getHeader('content-encoding')) {
      return payload;
    }
    
    // Get client's accepted encodings
    const acceptEncoding = request.headers['accept-encoding'];
    const encoding = getPreferredEncoding(acceptEncoding);
    
    if (!encoding) {
      return payload;
    }
    
    // Check content type
    const contentType = reply.getHeader('content-type') || '';
    
    // Don't compress streams or SSE
    if (contentType.includes('text/event-stream')) {
      return payload;
    }
    
    // Get payload size
    let payloadBuffer;
    if (typeof payload === 'string') {
      payloadBuffer = Buffer.from(payload);
    } else if (Buffer.isBuffer(payload)) {
      payloadBuffer = payload;
    } else if (payload && typeof payload.pipe === 'function') {
      // Don't compress streams
      return payload;
    } else {
      return payload;
    }
    
    // Check threshold
    if (payloadBuffer.length < threshold) {
      return payload;
    }
    
    // Compress
    try {
      const compressed = await compressBuffer(payloadBuffer, encoding);
      
      // Only use if compression actually helped
      if (compressed.length < payloadBuffer.length) {
        reply.header('content-encoding', encoding);
        reply.header('content-length', compressed.length);
        reply.removeHeader('content-length'); // Let Fastify handle it
        return compressed;
      }
    } catch (error) {
      // Compression failed, return original
      console.warn('[Compression] Error:', error.message);
    }
    
    return payload;
  });
}

/**
 * Express/Connect style middleware
 */
function compressionMiddleware(options = {}) {
  const threshold = options.threshold || 1024;
  const level = options.level || 6;
  
  return (req, res, next) => {
    const acceptEncoding = req.headers['accept-encoding'];
    const encoding = getPreferredEncoding(acceptEncoding);
    
    if (!encoding) {
      return next();
    }
    
    // Store original methods
    const originalWrite = res.write;
    const originalEnd = res.end;
    
    let buffer = [];
    let isCompressing = false;
    let compressionStream = null;
    
    // Override write
    res.write = function(chunk, encoding, callback) {
      if (!shouldCompress(req, res.getHeader('content-type'))) {
        return originalWrite.apply(this, arguments);
      }
      
      if (chunk) {
        buffer.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      
      if (typeof encoding === 'function') {
        callback = encoding;
        encoding = null;
      }
      
      if (callback) callback();
      return true;
    };
    
    // Override end
    res.end = function(chunk, encoding, callback) {
      if (chunk) {
        buffer.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      
      const totalBuffer = Buffer.concat(buffer);
      
      if (!shouldCompress(req, res.getHeader('content-type'), totalBuffer.length) ||
          totalBuffer.length < threshold) {
        // Don't compress, send original
        res.write = originalWrite;
        res.end = originalEnd;
        return res.end(totalBuffer, encoding, callback);
      }
      
      // Compress and send
      compressBuffer(totalBuffer, encoding).then(compressed => {
        if (compressed.length < totalBuffer.length) {
          res.setHeader('Content-Encoding', encoding);
          res.setHeader('Content-Length', compressed.length);
          res.write = originalWrite;
          res.end = originalEnd;
          res.end(compressed, callback);
        } else {
          // Compression didn't help
          res.write = originalWrite;
          res.end = originalEnd;
          res.end(totalBuffer, callback);
        }
      }).catch(err => {
        res.write = originalWrite;
        res.end = originalEnd;
        res.end(totalBuffer, callback);
      });
    };
    
    next();
  };
}

export {
  compressionPlugin,
  compressionMiddleware,
  shouldCompress,
  getPreferredEncoding,
  createCompressionStream,
  compressBuffer,
};
