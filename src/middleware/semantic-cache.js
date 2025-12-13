/**
 * Semantic Cache
 * Cache similar (not just identical) prompts using similarity matching
 * Reduces API calls for semantically equivalent queries
 */

import { createHash } from 'crypto';

class SemanticCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 500;
    this.defaultTTL = options.defaultTTL || 600000; // 10 minutes
    this.similarityThreshold = options.similarityThreshold || 0.85; // 85% similarity
    
    // Simple tokenization for similarity comparison
    this.stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall',
      'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
      'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'again', 'further', 'then', 'once',
      'here', 'there', 'when', 'where', 'why', 'how', 'all',
      'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
      'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
      'until', 'while', 'although', 'though', 'after', 'before',
    ]);
    
    this.stats = {
      hits: 0,
      misses: 0,
      semanticHits: 0,
      exactHits: 0,
    };
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
  }

  /**
   * Tokenize text for comparison
   */
  _tokenize(text) {
    if (!text) return [];
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word));
  }

  /**
   * Calculate Jaccard similarity between two token sets
   */
  _calculateSimilarity(tokens1, tokens2) {
    if (tokens1.length === 0 || tokens2.length === 0) return 0;
    
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    
    let intersection = 0;
    for (const token of set1) {
      if (set2.has(token)) intersection++;
    }
    
    const union = set1.size + set2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Extract key content from request body
   */
  _extractContent(requestBody) {
    const parts = [];
    
    // Extract messages
    if (requestBody.messages) {
      for (const msg of requestBody.messages) {
        if (typeof msg.content === 'string') {
          parts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.text) parts.push(part.text);
          }
        }
      }
    }
    
    // Extract system prompt
    if (requestBody.system) {
      parts.push(typeof requestBody.system === 'string' 
        ? requestBody.system 
        : JSON.stringify(requestBody.system)
      );
    }
    
    return parts.join(' ');
  }

  /**
   * Generate cache key
   */
  _generateKey(model, requestBody) {
    const content = this._extractContent(requestBody);
    const normalized = {
      model,
      content,
      temperature: requestBody.temperature || 1,
      max_tokens: requestBody.max_tokens,
    };
    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Find similar cached entry
   */
  _findSimilar(model, requestBody) {
    const content = this._extractContent(requestBody);
    const tokens = this._tokenize(content);
    
    if (tokens.length === 0) return null;
    
    let bestMatch = null;
    let bestSimilarity = 0;
    
    for (const [key, entry] of this.cache) {
      // Skip different models
      if (entry.model !== model) continue;
      
      // Skip expired
      if (Date.now() > entry.expiresAt) continue;
      
      // Calculate similarity
      const similarity = this._calculateSimilarity(tokens, entry.tokens);
      
      if (similarity > bestSimilarity && similarity >= this.similarityThreshold) {
        bestSimilarity = similarity;
        bestMatch = { entry, similarity, key };
      }
    }
    
    return bestMatch;
  }

  /**
   * Get cached response
   */
  get(model, requestBody) {
    // Check for exact match first
    const exactKey = this._generateKey(model, requestBody);
    const exactEntry = this.cache.get(exactKey);
    
    if (exactEntry && Date.now() <= exactEntry.expiresAt) {
      this.stats.hits++;
      this.stats.exactHits++;
      
      // Move to end (LRU)
      this.cache.delete(exactKey);
      this.cache.set(exactKey, exactEntry);
      
      return {
        response: exactEntry.response,
        exact: true,
        similarity: 1.0,
      };
    }
    
    // Look for semantic match
    const similar = this._findSimilar(model, requestBody);
    
    if (similar) {
      this.stats.hits++;
      this.stats.semanticHits++;
      
      console.log(`[SemanticCache] Similar match found (${(similar.similarity * 100).toFixed(1)}% similarity)`);
      
      return {
        response: similar.entry.response,
        exact: false,
        similarity: similar.similarity,
      };
    }
    
    this.stats.misses++;
    return null;
  }

  /**
   * Store response in cache
   */
  set(model, requestBody, response, ttl = null) {
    // Don't cache streaming or error responses
    if (requestBody.stream || response.error) return;
    
    const key = this._generateKey(model, requestBody);
    const content = this._extractContent(requestBody);
    const tokens = this._tokenize(content);
    
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      response,
      model,
      tokens,
      content: content.substring(0, 500), // Store snippet for debugging
      expiresAt: Date.now() + (ttl || this.defaultTTL),
      createdAt: Date.now(),
    });
  }

  /**
   * Cleanup expired entries
   */
  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[SemanticCache] Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      semanticHitRate: this.stats.hits > 0
        ? ((this.stats.semanticHits / this.stats.hits) * 100).toFixed(2) + '%'
        : '0%',
      entries: this.cache.size,
      maxSize: this.maxSize,
      similarityThreshold: this.similarityThreshold,
    };
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

export const semanticCache = new SemanticCache();
export { SemanticCache };
