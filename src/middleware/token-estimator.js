/**
 * Token Estimator
 * Pre-estimate token counts to avoid API overflows and optimize requests
 * Uses approximate tokenization rules for different models
 */

// Average characters per token by model family
const CHARS_PER_TOKEN = {
  'gpt': 4.0,      // OpenAI GPT models
  'claude': 3.5,   // Anthropic Claude models
  'gemini': 4.0,   // Google Gemini models
  'llama': 4.0,    // Meta Llama models
  'mistral': 4.0,  // Mistral models
  'default': 4.0,
};

// Context window sizes by model
const MODEL_CONTEXT_LIMITS = {
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,
  
  // Claude
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-7-sonnet': 200000,
  'claude-2': 100000,
  
  // Gemini
  'gemini-2.0-flash': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-pro': 1000000,
  'gemini-1.5-pro': 1000000,
  'gemini-1.5-flash': 1000000,
  'gemini-1.0-pro': 32000,
  
  // Default
  'default': 8192,
};

// Max output tokens by model
const MODEL_OUTPUT_LIMITS = {
  'gpt-4o': 16384,
  'gpt-4o-mini': 16384,
  'gpt-4-turbo': 4096,
  'gpt-4': 4096,
  'gpt-3.5-turbo': 4096,
  'claude-3-opus': 4096,
  'claude-3-sonnet': 4096,
  'claude-3-haiku': 4096,
  'claude-3-5-sonnet': 8192,
  'claude-3-7-sonnet': 8192,
  'gemini-2.0-flash': 8192,
  'gemini-2.5-flash': 8192,
  'gemini-2.5-pro': 8192,
  'gemini-1.5-pro': 8192,
  'default': 4096,
};

class TokenEstimator {
  constructor(options = {}) {
    this.charsPerToken = options.charsPerToken || CHARS_PER_TOKEN;
    this.contextLimits = options.contextLimits || MODEL_CONTEXT_LIMITS;
    this.outputLimits = options.outputLimits || MODEL_OUTPUT_LIMITS;
    this.safetyMargin = options.safetyMargin || 0.95; // Use 95% of limit
    
    this.stats = {
      totalEstimations: 0,
      truncationWarnings: 0,
      overflowPrevented: 0,
    };
  }

  /**
   * Get model family from model name
   */
  _getModelFamily(model) {
    if (!model) return 'default';
    
    const lower = model.toLowerCase();
    if (lower.includes('gpt')) return 'gpt';
    if (lower.includes('claude')) return 'claude';
    if (lower.includes('gemini')) return 'gemini';
    if (lower.includes('llama')) return 'llama';
    if (lower.includes('mistral')) return 'mistral';
    return 'default';
  }

  /**
   * Get context limit for model
   */
  getContextLimit(model) {
    if (!model) return this.contextLimits.default;
    
    // Exact match
    if (this.contextLimits[model]) {
      return this.contextLimits[model];
    }
    
    // Partial match
    const lower = model.toLowerCase();
    for (const [key, limit] of Object.entries(this.contextLimits)) {
      if (lower.includes(key.toLowerCase())) {
        return limit;
      }
    }
    
    return this.contextLimits.default;
  }

  /**
   * Get output limit for model
   */
  getOutputLimit(model) {
    if (!model) return this.outputLimits.default;
    
    // Exact match
    if (this.outputLimits[model]) {
      return this.outputLimits[model];
    }
    
    // Partial match
    const lower = model.toLowerCase();
    for (const [key, limit] of Object.entries(this.outputLimits)) {
      if (lower.includes(key.toLowerCase())) {
        return limit;
      }
    }
    
    return this.outputLimits.default;
  }

  /**
   * Estimate tokens for text
   */
  estimateTokens(text, model = null) {
    if (!text) return 0;
    
    const family = this._getModelFamily(model);
    const charsPerToken = this.charsPerToken[family] || this.charsPerToken.default;
    
    // Count characters
    const charCount = text.length;
    
    // Estimate tokens
    let tokens = Math.ceil(charCount / charsPerToken);
    
    // Add overhead for special tokens, formatting
    tokens = Math.ceil(tokens * 1.1);
    
    return tokens;
  }

  /**
   * Estimate tokens for messages array
   */
  estimateMessagesTokens(messages, model = null) {
    if (!messages || !Array.isArray(messages)) return 0;
    
    let totalTokens = 0;
    
    for (const message of messages) {
      // Role overhead (3-4 tokens typically)
      totalTokens += 4;
      
      // Content
      if (typeof message.content === 'string') {
        totalTokens += this.estimateTokens(message.content, model);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.text) {
            totalTokens += this.estimateTokens(part.text, model);
          }
          if (part.type === 'image_url' || part.type === 'image') {
            // Images typically cost 85-170 tokens for low res, more for high res
            totalTokens += 170;
          }
        }
      }
      
      // Name field overhead
      if (message.name) {
        totalTokens += this.estimateTokens(message.name, model) + 1;
      }
    }
    
    // Message separator overhead
    totalTokens += messages.length * 3;
    
    return totalTokens;
  }

  /**
   * Estimate tokens for entire request
   */
  estimateRequestTokens(requestBody, model = null) {
    this.stats.totalEstimations++;
    
    let totalTokens = 0;
    
    // System prompt
    if (requestBody.system) {
      totalTokens += this.estimateTokens(
        typeof requestBody.system === 'string' 
          ? requestBody.system 
          : JSON.stringify(requestBody.system),
        model
      );
      totalTokens += 4; // System role overhead
    }
    
    // Messages
    if (requestBody.messages) {
      totalTokens += this.estimateMessagesTokens(requestBody.messages, model);
    }
    
    // Gemini format (contents)
    if (requestBody.contents) {
      for (const content of requestBody.contents) {
        if (content.parts) {
          for (const part of content.parts) {
            if (part.text) {
              totalTokens += this.estimateTokens(part.text, model);
            }
          }
        }
        totalTokens += 4; // Role overhead
      }
    }
    
    // Tools/Functions
    if (requestBody.tools) {
      totalTokens += this.estimateTokens(JSON.stringify(requestBody.tools), model);
    }
    
    return totalTokens;
  }

  /**
   * Check if request fits within context window
   */
  checkFits(requestBody, model, requestedMaxTokens = null) {
    const estimatedInput = this.estimateRequestTokens(requestBody, model);
    const contextLimit = this.getContextLimit(model);
    const outputLimit = this.getOutputLimit(model);
    
    const maxOutput = requestedMaxTokens || outputLimit;
    const safeContextLimit = Math.floor(contextLimit * this.safetyMargin);
    
    const totalNeeded = estimatedInput + maxOutput;
    const fits = totalNeeded <= safeContextLimit;
    
    if (!fits) {
      this.stats.truncationWarnings++;
    }
    
    return {
      fits,
      estimatedInputTokens: estimatedInput,
      requestedOutputTokens: maxOutput,
      totalNeeded,
      contextLimit,
      safeContextLimit,
      availableForOutput: Math.max(0, safeContextLimit - estimatedInput),
      overBy: fits ? 0 : totalNeeded - safeContextLimit,
    };
  }

  /**
   * Suggest optimal max_tokens based on input size
   */
  suggestMaxTokens(requestBody, model, desiredOutput = null) {
    const check = this.checkFits(requestBody, model, desiredOutput);
    
    if (check.fits && desiredOutput) {
      return desiredOutput;
    }
    
    // Suggest max that fits
    return Math.min(
      check.availableForOutput,
      this.getOutputLimit(model)
    );
  }

  /**
   * Truncate messages to fit within context
   */
  truncateToFit(requestBody, model, preserveSystem = true, preserveLastN = 2) {
    const check = this.checkFits(requestBody, model);
    
    if (check.fits) {
      return { requestBody, truncated: false };
    }
    
    this.stats.overflowPrevented++;
    
    const messages = [...(requestBody.messages || [])];
    const targetTokens = Math.floor(check.safeContextLimit * 0.7); // Leave room for output
    
    // Preserve system message if present
    let systemTokens = 0;
    if (preserveSystem && requestBody.system) {
      systemTokens = this.estimateTokens(
        typeof requestBody.system === 'string' 
          ? requestBody.system 
          : JSON.stringify(requestBody.system),
        model
      );
    }
    
    // Preserve last N messages
    const preserved = messages.slice(-preserveLastN);
    const preservedTokens = this.estimateMessagesTokens(preserved, model);
    
    // Calculate available tokens for middle messages
    const availableForMiddle = targetTokens - systemTokens - preservedTokens - 100;
    
    // Truncate from the beginning
    const toProcess = messages.slice(0, -preserveLastN);
    const truncated = [];
    let usedTokens = 0;
    
    // Keep messages from the end that fit
    for (let i = toProcess.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateMessagesTokens([toProcess[i]], model);
      if (usedTokens + msgTokens <= availableForMiddle) {
        truncated.unshift(toProcess[i]);
        usedTokens += msgTokens;
      } else {
        break;
      }
    }
    
    // Combine truncated + preserved
    const finalMessages = [...truncated, ...preserved];
    
    console.log(`[TokenEstimator] Truncated ${messages.length - finalMessages.length} messages to fit context`);
    
    return {
      requestBody: {
        ...requestBody,
        messages: finalMessages,
      },
      truncated: true,
      removedMessages: messages.length - finalMessages.length,
      originalTokens: check.estimatedInputTokens,
      newTokens: this.estimateMessagesTokens(finalMessages, model) + systemTokens,
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

export const tokenEstimator = new TokenEstimator();
export { TokenEstimator, MODEL_CONTEXT_LIMITS, MODEL_OUTPUT_LIMITS };
