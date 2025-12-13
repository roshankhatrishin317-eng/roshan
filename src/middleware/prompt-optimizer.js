/**
 * Prompt Optimization
 * Compress and optimize prompts to reduce tokens while maintaining quality
 * Improves speed and reduces costs
 */

class PromptOptimizer {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.aggressiveness = options.aggressiveness || 'medium'; // 'light', 'medium', 'aggressive'
    
    this.stats = {
      totalOptimized: 0,
      totalTokensSaved: 0,
      avgCompressionRatio: 0,
    };
    
    this._compressionRatios = [];
    this.maxRatios = 100;
    
    // Common verbose phrases that can be shortened
    this._verbosePatterns = this._initVerbosePatterns();
  }

  /**
   * Initialize verbose patterns for compression
   */
  _initVerbosePatterns() {
    return [
      // Verbose phrases -> shorter versions
      { pattern: /I would like you to/gi, replacement: 'Please' },
      { pattern: /Could you please/gi, replacement: 'Please' },
      { pattern: /Would you be able to/gi, replacement: 'Please' },
      { pattern: /I want you to/gi, replacement: '' },
      { pattern: /Can you help me with/gi, replacement: 'Help with' },
      { pattern: /I need you to/gi, replacement: '' },
      { pattern: /Please make sure to/gi, replacement: '' },
      { pattern: /It would be great if you could/gi, replacement: 'Please' },
      { pattern: /I'm looking for/gi, replacement: 'Find' },
      { pattern: /In order to/gi, replacement: 'To' },
      { pattern: /Due to the fact that/gi, replacement: 'Because' },
      { pattern: /At this point in time/gi, replacement: 'Now' },
      { pattern: /In the event that/gi, replacement: 'If' },
      { pattern: /For the purpose of/gi, replacement: 'To' },
      { pattern: /With regard to/gi, replacement: 'About' },
      { pattern: /In relation to/gi, replacement: 'About' },
      { pattern: /As a matter of fact/gi, replacement: '' },
      { pattern: /It is important to note that/gi, replacement: 'Note:' },
      { pattern: /Please note that/gi, replacement: 'Note:' },
      { pattern: /It should be noted that/gi, replacement: 'Note:' },
      { pattern: /The reason for this is/gi, replacement: 'Because' },
      { pattern: /In my opinion,?\s*/gi, replacement: '' },
      { pattern: /I think that/gi, replacement: '' },
      { pattern: /I believe that/gi, replacement: '' },
      
      // Multiple spaces
      { pattern: /\s{2,}/g, replacement: ' ' },
      
      // Multiple newlines (medium/aggressive only)
      { pattern: /\n{3,}/g, replacement: '\n\n', minLevel: 'medium' },
      
      // Remove filler words (aggressive only)
      { pattern: /\b(actually|basically|literally|honestly|frankly|simply|just|really|very|quite)\b\s*/gi, replacement: '', minLevel: 'aggressive' },
    ];
  }

  /**
   * Optimize a prompt
   */
  optimize(text, options = {}) {
    if (!this.enabled || !text) {
      return { text, optimized: false, savings: 0 };
    }
    
    const level = options.level || this.aggressiveness;
    const originalLength = text.length;
    let optimized = text;
    
    // Apply compression patterns
    optimized = this._applyPatterns(optimized, level);
    
    // Remove redundant whitespace
    optimized = this._cleanWhitespace(optimized);
    
    // Compress code blocks if present
    if (options.compressCode !== false) {
      optimized = this._compressCode(optimized, level);
    }
    
    // Remove redundant context (aggressive only)
    if (level === 'aggressive') {
      optimized = this._removeRedundantContext(optimized);
    }
    
    // Calculate savings
    const newLength = optimized.length;
    const savings = originalLength - newLength;
    const compressionRatio = originalLength > 0 ? savings / originalLength : 0;
    
    // Update stats
    this._updateStats(savings, compressionRatio);
    
    return {
      text: optimized,
      optimized: savings > 0,
      originalLength,
      newLength,
      savings,
      compressionRatio: (compressionRatio * 100).toFixed(1) + '%',
      estimatedTokensSaved: Math.floor(savings / 4),
    };
  }

  /**
   * Optimize request body
   */
  optimizeRequest(requestBody, options = {}) {
    const optimized = { ...requestBody };
    let totalSavings = 0;
    
    // Optimize messages
    if (optimized.messages) {
      optimized.messages = optimized.messages.map(msg => {
        if (typeof msg.content === 'string') {
          const result = this.optimize(msg.content, options);
          totalSavings += result.savings;
          return { ...msg, content: result.text };
        }
        return msg;
      });
    }
    
    // Optimize system prompt
    if (typeof optimized.system === 'string') {
      const result = this.optimize(optimized.system, options);
      totalSavings += result.savings;
      optimized.system = result.text;
    }
    
    return {
      requestBody: optimized,
      totalSavings,
      estimatedTokensSaved: Math.floor(totalSavings / 4),
    };
  }

  /**
   * Apply compression patterns
   */
  _applyPatterns(text, level) {
    const levelOrder = ['light', 'medium', 'aggressive'];
    const levelIndex = levelOrder.indexOf(level);
    
    for (const { pattern, replacement, minLevel } of this._verbosePatterns) {
      if (minLevel) {
        const minLevelIndex = levelOrder.indexOf(minLevel);
        if (levelIndex < minLevelIndex) continue;
      }
      
      text = text.replace(pattern, replacement);
    }
    
    return text;
  }

  /**
   * Clean whitespace
   */
  _cleanWhitespace(text) {
    return text
      .replace(/[ \t]+/g, ' ')           // Multiple spaces/tabs to single space
      .replace(/^ +/gm, '')              // Leading spaces on lines
      .replace(/ +$/gm, '')              // Trailing spaces on lines
      .replace(/\n\s*\n\s*\n/g, '\n\n')  // Max 2 consecutive newlines
      .trim();
  }

  /**
   * Compress code blocks
   */
  _compressCode(text, level) {
    if (level === 'light') return text;
    
    // Find code blocks and compress them
    return text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      let compressed = code
        .replace(/\/\/.*$/gm, '')        // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
        .replace(/^\s*\n/gm, '')         // Remove empty lines
        .replace(/\s+$/gm, '');          // Remove trailing whitespace
      
      if (level === 'aggressive') {
        // More aggressive compression
        compressed = compressed
          .replace(/\n{2,}/g, '\n')      // Remove multiple newlines
          .replace(/\s*{\s*/g, '{')       // Compact braces
          .replace(/\s*}\s*/g, '}')
          .replace(/\s*;\s*/g, ';');
      }
      
      return '```' + lang + '\n' + compressed.trim() + '\n```';
    });
  }

  /**
   * Remove redundant context
   */
  _removeRedundantContext(text) {
    // Remove common redundant phrases at the end
    const redundantEndings = [
      /\s*Thank you\.?\s*$/i,
      /\s*Thanks in advance\.?\s*$/i,
      /\s*Please and thank you\.?\s*$/i,
      /\s*I appreciate your help\.?\s*$/i,
      /\s*Let me know if you have any questions\.?\s*$/i,
    ];
    
    for (const pattern of redundantEndings) {
      text = text.replace(pattern, '');
    }
    
    return text;
  }

  /**
   * Summarize long context (for very long prompts)
   */
  summarizeContext(messages, maxTokens = 2000) {
    if (!messages || messages.length <= 2) return messages;
    
    // Estimate total tokens
    const totalChars = messages.reduce((sum, m) => 
      sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
    const estimatedTokens = totalChars / 4;
    
    if (estimatedTokens <= maxTokens) return messages;
    
    // Keep first (system context) and last few messages
    const keep = 3;
    const system = messages.find(m => m.role === 'system');
    const lastMessages = messages.slice(-keep);
    
    // Create summary of middle messages
    const middleMessages = messages.slice(
      system ? 1 : 0, 
      -keep
    );
    
    if (middleMessages.length === 0) return messages;
    
    const summaryContent = `[Previous conversation summarized: ${middleMessages.length} messages exchanged covering topics: ${this._extractTopics(middleMessages)}]`;
    
    const result = [];
    if (system) result.push(system);
    result.push({ role: 'system', content: summaryContent });
    result.push(...lastMessages);
    
    return result;
  }

  /**
   * Extract topics from messages for summary
   */
  _extractTopics(messages) {
    const text = messages
      .map(m => typeof m.content === 'string' ? m.content : '')
      .join(' ');
    
    // Simple keyword extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4);
    
    // Count word frequency
    const freq = {};
    for (const word of words) {
      freq[word] = (freq[word] || 0) + 1;
    }
    
    // Get top keywords
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
    
    return sorted.join(', ') || 'general discussion';
  }

  /**
   * Update statistics
   */
  _updateStats(savings, ratio) {
    this.stats.totalOptimized++;
    this.stats.totalTokensSaved += Math.floor(savings / 4);
    
    this._compressionRatios.push(ratio);
    if (this._compressionRatios.length > this.maxRatios) {
      this._compressionRatios.shift();
    }
    
    this.stats.avgCompressionRatio = 
      this._compressionRatios.reduce((a, b) => a + b, 0) / this._compressionRatios.length;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      aggressiveness: this.aggressiveness,
      totalOptimized: this.stats.totalOptimized,
      totalTokensSaved: this.stats.totalTokensSaved,
      avgCompressionRatio: (this.stats.avgCompressionRatio * 100).toFixed(1) + '%',
      estimatedCostSavings: `$${(this.stats.totalTokensSaved * 0.000002).toFixed(4)}`, // Rough estimate
    };
  }

  /**
   * Set aggressiveness level
   */
  setLevel(level) {
    if (['light', 'medium', 'aggressive'].includes(level)) {
      this.aggressiveness = level;
    }
  }
}

export const promptOptimizer = new PromptOptimizer();
export { PromptOptimizer };
