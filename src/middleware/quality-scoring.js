/**
 * Response Quality Scoring
 * Automatically scores response quality based on multiple factors
 * Helps identify low-quality responses and problematic providers
 */

class QualityScorer {
  constructor(options = {}) {
    this.weights = {
      completeness: 0.25,    // Did response complete properly
      coherence: 0.20,       // Is response coherent
      relevance: 0.20,       // Is response relevant to prompt
      formatting: 0.15,      // Proper formatting
      latency: 0.10,         // Response speed
      tokenEfficiency: 0.10, // Tokens used efficiently
    };
    
    this.thresholds = {
      excellent: 0.9,
      good: 0.75,
      acceptable: 0.6,
      poor: 0.4,
    };
    
    this.stats = {
      totalScored: 0,
      avgScore: 0,
      scoreDistribution: {
        excellent: 0,
        good: 0,
        acceptable: 0,
        poor: 0,
        bad: 0,
      },
      byProvider: {},
      byModel: {},
    };
    
    this._scores = []; // Rolling window for average
    this.maxScores = 1000;
  }

  /**
   * Score a response
   */
  score(request, response, metadata = {}) {
    this.stats.totalScored++;
    
    const scores = {
      completeness: this._scoreCompleteness(response, metadata),
      coherence: this._scoreCoherence(response),
      relevance: this._scoreRelevance(request, response),
      formatting: this._scoreFormatting(response),
      latency: this._scoreLatency(metadata.latency),
      tokenEfficiency: this._scoreTokenEfficiency(request, response, metadata),
    };
    
    // Calculate weighted total
    let totalScore = 0;
    for (const [factor, weight] of Object.entries(this.weights)) {
      totalScore += scores[factor] * weight;
    }
    
    // Determine quality tier
    const tier = this._getTier(totalScore);
    
    // Update stats
    this._updateStats(totalScore, tier, metadata);
    
    return {
      totalScore: Math.round(totalScore * 100) / 100,
      tier,
      factors: scores,
      suggestions: this._getSuggestions(scores),
    };
  }

  /**
   * Score response completeness
   */
  _scoreCompleteness(response, metadata) {
    let score = 1.0;
    
    // Check for finish reason
    const finishReason = this._extractFinishReason(response);
    if (finishReason === 'length' || finishReason === 'max_tokens') {
      score -= 0.3; // Truncated response
    }
    
    // Check for empty response
    const content = this._extractContent(response);
    if (!content || content.trim().length === 0) {
      return 0;
    }
    
    // Check for very short responses (might be incomplete)
    if (content.length < 50 && !metadata.expectShort) {
      score -= 0.2;
    }
    
    // Check for common truncation indicators
    const truncationIndicators = [
      /\.{3}$/,           // Ends with ...
      /[^.!?]$/,          // Doesn't end with sentence punctuation
      /\b(continued|cont'd|more)\s*$/i,
    ];
    
    for (const pattern of truncationIndicators) {
      if (pattern.test(content.trim())) {
        score -= 0.1;
      }
    }
    
    return Math.max(0, score);
  }

  /**
   * Score response coherence
   */
  _scoreCoherence(response) {
    const content = this._extractContent(response);
    if (!content) return 0;
    
    let score = 1.0;
    
    // Check for repetition
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()));
    
    if (sentences.length > 3) {
      const repetitionRatio = uniqueSentences.size / sentences.length;
      if (repetitionRatio < 0.5) {
        score -= 0.4; // High repetition
      } else if (repetitionRatio < 0.8) {
        score -= 0.2;
      }
    }
    
    // Check for gibberish patterns
    const gibberishPatterns = [
      /(.)\1{5,}/,                    // Same character repeated 5+ times
      /[^\w\s]{10,}/,                 // 10+ special characters in a row
      /\b(\w+)\s+\1\s+\1\b/,          // Same word 3 times in a row
    ];
    
    for (const pattern of gibberishPatterns) {
      if (pattern.test(content)) {
        score -= 0.3;
      }
    }
    
    // Check for reasonable word/sentence ratio
    const words = content.split(/\s+/).length;
    if (sentences.length > 0) {
      const avgWordsPerSentence = words / sentences.length;
      if (avgWordsPerSentence > 100) {
        score -= 0.2; // Sentences too long
      }
    }
    
    return Math.max(0, score);
  }

  /**
   * Score response relevance to prompt
   */
  _scoreRelevance(request, response) {
    const prompt = this._extractPrompt(request);
    const content = this._extractContent(response);
    
    if (!prompt || !content) return 0.5; // Can't determine
    
    let score = 0.7; // Base score
    
    // Check for keyword overlap
    const promptWords = this._tokenize(prompt);
    const responseWords = this._tokenize(content);
    
    if (promptWords.length > 0) {
      let overlap = 0;
      for (const word of promptWords) {
        if (responseWords.includes(word)) overlap++;
      }
      
      const overlapRatio = overlap / promptWords.length;
      score += overlapRatio * 0.3;
    }
    
    // Check for question-answer patterns
    if (/\?/.test(prompt)) {
      // Prompt is a question
      const answerIndicators = [
        /^(yes|no|sure|absolutely|definitely|probably|maybe)/i,
        /^(the|it|this|that|there|here)/i,
        /^(i |we |you |they )/i,
      ];
      
      for (const pattern of answerIndicators) {
        if (pattern.test(content.trim())) {
          score += 0.1;
          break;
        }
      }
    }
    
    return Math.min(1, score);
  }

  /**
   * Score response formatting
   */
  _scoreFormatting(response) {
    const content = this._extractContent(response);
    if (!content) return 0;
    
    let score = 1.0;
    
    // Check for code block formatting
    const codeBlockCount = (content.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      score -= 0.2; // Unclosed code blocks
    }
    
    // Check for markdown list formatting
    const listItems = content.match(/^[\s]*[-*\d.]+\s/gm) || [];
    if (listItems.length > 0) {
      // Has lists, check consistency
      const bulletStyle = listItems[0].trim()[0];
      const inconsistent = listItems.some(item => item.trim()[0] !== bulletStyle);
      if (inconsistent) {
        score -= 0.1;
      }
    }
    
    // Check for balanced brackets/parentheses
    const brackets = {
      '(': ')',
      '[': ']',
      '{': '}',
    };
    
    for (const [open, close] of Object.entries(brackets)) {
      const openCount = (content.match(new RegExp('\\' + open, 'g')) || []).length;
      const closeCount = (content.match(new RegExp('\\' + close, 'g')) || []).length;
      if (openCount !== closeCount) {
        score -= 0.05;
      }
    }
    
    return Math.max(0, score);
  }

  /**
   * Score response latency
   */
  _scoreLatency(latencyMs) {
    if (!latencyMs) return 0.5;
    
    // Scoring based on latency (optimized for LLM responses)
    if (latencyMs < 1000) return 1.0;      // < 1s: excellent
    if (latencyMs < 3000) return 0.9;      // < 3s: great
    if (latencyMs < 5000) return 0.8;      // < 5s: good
    if (latencyMs < 10000) return 0.6;     // < 10s: acceptable
    if (latencyMs < 30000) return 0.4;     // < 30s: slow
    return 0.2;                             // > 30s: very slow
  }

  /**
   * Score token efficiency
   */
  _scoreTokenEfficiency(request, response, metadata) {
    const inputTokens = metadata.inputTokens || 0;
    const outputTokens = metadata.outputTokens || 0;
    
    if (!inputTokens || !outputTokens) return 0.7;
    
    // Reasonable output/input ratio (varies by task)
    const ratio = outputTokens / inputTokens;
    
    if (ratio < 0.1) return 0.5;  // Very short response
    if (ratio > 10) return 0.6;   // Potentially verbose
    return 0.8;
  }

  /**
   * Get quality tier from score
   */
  _getTier(score) {
    if (score >= this.thresholds.excellent) return 'excellent';
    if (score >= this.thresholds.good) return 'good';
    if (score >= this.thresholds.acceptable) return 'acceptable';
    if (score >= this.thresholds.poor) return 'poor';
    return 'bad';
  }

  /**
   * Update statistics
   */
  _updateStats(score, tier, metadata) {
    this._scores.push(score);
    if (this._scores.length > this.maxScores) {
      this._scores.shift();
    }
    
    this.stats.avgScore = this._scores.reduce((a, b) => a + b, 0) / this._scores.length;
    this.stats.scoreDistribution[tier]++;
    
    if (metadata.provider) {
      if (!this.stats.byProvider[metadata.provider]) {
        this.stats.byProvider[metadata.provider] = { total: 0, sum: 0, avg: 0 };
      }
      const ps = this.stats.byProvider[metadata.provider];
      ps.total++;
      ps.sum += score;
      ps.avg = ps.sum / ps.total;
    }
    
    if (metadata.model) {
      if (!this.stats.byModel[metadata.model]) {
        this.stats.byModel[metadata.model] = { total: 0, sum: 0, avg: 0 };
      }
      const ms = this.stats.byModel[metadata.model];
      ms.total++;
      ms.sum += score;
      ms.avg = ms.sum / ms.total;
    }
  }

  /**
   * Get improvement suggestions
   */
  _getSuggestions(scores) {
    const suggestions = [];
    
    if (scores.completeness < 0.7) {
      suggestions.push('Response may be truncated. Consider increasing max_tokens.');
    }
    if (scores.coherence < 0.7) {
      suggestions.push('Response has coherence issues. Check for repetition or gibberish.');
    }
    if (scores.relevance < 0.7) {
      suggestions.push('Response may not be relevant to the prompt.');
    }
    if (scores.latency < 0.5) {
      suggestions.push('Response was slow. Consider using a faster model or provider.');
    }
    
    return suggestions;
  }

  /**
   * Extract content from response
   */
  _extractContent(response) {
    if (!response) return '';
    
    // OpenAI format
    if (response.choices?.[0]?.message?.content) {
      return response.choices[0].message.content;
    }
    // Claude format
    if (response.content?.[0]?.text) {
      return response.content[0].text;
    }
    // Gemini format
    if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
      return response.candidates[0].content.parts[0].text;
    }
    
    return '';
  }

  /**
   * Extract finish reason
   */
  _extractFinishReason(response) {
    if (response?.choices?.[0]?.finish_reason) {
      return response.choices[0].finish_reason;
    }
    if (response?.stop_reason) {
      return response.stop_reason;
    }
    if (response?.candidates?.[0]?.finishReason) {
      return response.candidates[0].finishReason;
    }
    return null;
  }

  /**
   * Extract prompt from request
   */
  _extractPrompt(request) {
    if (request.messages) {
      const userMessages = request.messages.filter(m => m.role === 'user');
      return userMessages.map(m => m.content).join(' ');
    }
    if (request.prompt) {
      return request.prompt;
    }
    return '';
  }

  /**
   * Simple tokenization
   */
  _tokenize(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
  }

  /**
   * Get statistics
   */
  getStats() {
    const providerStats = {};
    for (const [id, stats] of Object.entries(this.stats.byProvider)) {
      providerStats[id] = {
        avgScore: stats.avg.toFixed(3),
        totalScored: stats.total,
      };
    }
    
    const modelStats = {};
    for (const [id, stats] of Object.entries(this.stats.byModel)) {
      modelStats[id] = {
        avgScore: stats.avg.toFixed(3),
        totalScored: stats.total,
      };
    }
    
    return {
      totalScored: this.stats.totalScored,
      avgScore: this.stats.avgScore.toFixed(3),
      scoreDistribution: this.stats.scoreDistribution,
      byProvider: providerStats,
      byModel: modelStats,
    };
  }
}

export const qualityScorer = new QualityScorer();
export { QualityScorer };
