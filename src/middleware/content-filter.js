/**
 * Content Filtering
 * Block inappropriate, harmful, or policy-violating content
 * Works on both requests (prompts) and responses
 */

class ContentFilter {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.strictMode = options.strictMode || false;
    
    // Categories to filter
    this.categories = {
      violence: options.filterViolence !== false,
      sexual: options.filterSexual !== false,
      hate: options.filterHate !== false,
      selfHarm: options.filterSelfHarm !== false,
      illegal: options.filterIllegal !== false,
      pii: options.filterPII !== false,
      jailbreak: options.filterJailbreak !== false,
    };
    
    // Pattern definitions
    this._initPatterns();
    
    this.stats = {
      totalChecked: 0,
      blocked: 0,
      flagged: 0,
      byCategory: {},
    };
    
    // Whitelist for allowed terms that might trigger false positives
    this.whitelist = new Set(options.whitelist || []);
    
    // Custom blocked terms
    this.customBlocked = new Set(options.customBlocked || []);
  }

  /**
   * Initialize detection patterns
   */
  _initPatterns() {
    this.patterns = {
      // Violence patterns
      violence: [
        /\b(kill|murder|assassinate|execute|slaughter)\s+(him|her|them|people|everyone)/i,
        /\bhow\s+to\s+(make|build|create)\s+(bomb|weapon|explosive)/i,
        /\b(terrorist|terrorism)\s+(attack|plot|plan)/i,
      ],
      
      // Sexual content patterns
      sexual: [
        /\b(explicit|graphic)\s+sexual/i,
        /\bpornograph(y|ic)/i,
        /\bsexual\s+(content|material|acts)\s+with\s+(minor|child)/i,
      ],
      
      // Hate speech patterns
      hate: [
        /\b(hate|kill|exterminate)\s+(all\s+)?(jews|muslims|christians|blacks|whites|asians)/i,
        /\b(racial|ethnic)\s+(cleansing|purge)/i,
        /\bgenoci(de|dal)/i,
      ],
      
      // Self-harm patterns
      selfHarm: [
        /\bhow\s+to\s+(commit\s+)?suicide/i,
        /\bbest\s+(way|method)\s+to\s+(kill|harm)\s+(myself|yourself)/i,
        /\bself[- ]?harm\s+(methods|techniques)/i,
      ],
      
      // Illegal activity patterns
      illegal: [
        /\bhow\s+to\s+(hack|breach|compromise)\s+(bank|account|system)/i,
        /\b(create|make|synthesize)\s+(meth|cocaine|heroin|fentanyl)/i,
        /\b(counterfeit|forge)\s+(money|currency|documents)/i,
        /\bchild\s+(porn|exploitation|abuse)/i,
      ],
      
      // PII patterns
      pii: [
        /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,  // SSN
        /\b\d{16}\b/,                       // Credit card
        /\b[A-Z]{2}\d{6,9}\b/,              // Passport
      ],
      
      // Jailbreak/prompt injection patterns
      jailbreak: [
        /\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/i,
        /\b(DAN|do\s+anything\s+now)\s*mode/i,
        /\bpretend\s+(you\s+are|to\s+be)\s+(evil|unfiltered|unrestricted)/i,
        /\byou\s+are\s+now\s+(evil|DAN|jailbroken)/i,
        /\bdisregard\s+(your\s+)?(safety|ethical)\s+(guidelines|rules)/i,
        /\b(system|developer)\s*:\s*(ignore|override|disable)/i,
        /\[\[SYSTEM\]\]/i,
        /\bact\s+as\s+if\s+(you\s+have\s+)?no\s+(restrictions|limitations|rules)/i,
      ],
    };
    
    // Severity levels
    this.severityLevels = {
      violence: 'high',
      sexual: 'high',
      hate: 'high',
      selfHarm: 'critical',
      illegal: 'critical',
      pii: 'medium',
      jailbreak: 'high',
    };
  }

  /**
   * Check content against filters
   */
  check(content, options = {}) {
    if (!this.enabled) {
      return { allowed: true, flags: [] };
    }
    
    this.stats.totalChecked++;
    const text = this._extractText(content);
    const flags = [];
    
    // Check custom blocked terms first
    for (const term of this.customBlocked) {
      if (text.toLowerCase().includes(term.toLowerCase())) {
        flags.push({
          category: 'custom',
          severity: 'high',
          matched: term,
        });
      }
    }
    
    // Check each enabled category
    for (const [category, patterns] of Object.entries(this.patterns)) {
      if (!this.categories[category]) continue;
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && !this._isWhitelisted(match[0])) {
          flags.push({
            category,
            severity: this.severityLevels[category],
            matched: match[0],
            position: match.index,
          });
        }
      }
    }
    
    // Determine if should block
    const shouldBlock = this._shouldBlock(flags, options);
    
    if (shouldBlock) {
      this.stats.blocked++;
    }
    if (flags.length > 0) {
      this.stats.flagged++;
      for (const flag of flags) {
        this.stats.byCategory[flag.category] = (this.stats.byCategory[flag.category] || 0) + 1;
      }
    }
    
    return {
      allowed: !shouldBlock,
      flags,
      flagCount: flags.length,
      highestSeverity: this._getHighestSeverity(flags),
      message: shouldBlock ? this._getBlockMessage(flags) : null,
    };
  }

  /**
   * Check request before sending
   */
  checkRequest(requestBody) {
    let textToCheck = '';
    
    // Extract all text from request
    if (requestBody.messages) {
      textToCheck = requestBody.messages
        .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
        .join(' ');
    }
    if (requestBody.system) {
      textToCheck += ' ' + (typeof requestBody.system === 'string' ? requestBody.system : JSON.stringify(requestBody.system));
    }
    if (requestBody.prompt) {
      textToCheck += ' ' + requestBody.prompt;
    }
    
    return this.check(textToCheck, { isRequest: true });
  }

  /**
   * Check response before returning
   */
  checkResponse(response) {
    let textToCheck = '';
    
    // OpenAI format
    if (response.choices?.[0]?.message?.content) {
      textToCheck = response.choices[0].message.content;
    }
    // Claude format
    else if (response.content?.[0]?.text) {
      textToCheck = response.content[0].text;
    }
    // Gemini format
    else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
      textToCheck = response.candidates[0].content.parts[0].text;
    }
    
    return this.check(textToCheck, { isResponse: true });
  }

  /**
   * Extract text from various formats
   */
  _extractText(content) {
    if (typeof content === 'string') return content;
    if (typeof content === 'object') return JSON.stringify(content);
    return String(content);
  }

  /**
   * Check if term is whitelisted
   */
  _isWhitelisted(term) {
    return this.whitelist.has(term.toLowerCase());
  }

  /**
   * Determine if content should be blocked
   */
  _shouldBlock(flags, options = {}) {
    if (flags.length === 0) return false;
    
    // Always block critical severity
    if (flags.some(f => f.severity === 'critical')) {
      return true;
    }
    
    // In strict mode, block any flag
    if (this.strictMode) {
      return flags.length > 0;
    }
    
    // Block if multiple high severity or jailbreak attempt
    const highSeverityCount = flags.filter(f => f.severity === 'high').length;
    const hasJailbreak = flags.some(f => f.category === 'jailbreak');
    
    if (hasJailbreak && options.isRequest) {
      return true; // Always block jailbreak attempts in requests
    }
    
    return highSeverityCount >= 2;
  }

  /**
   * Get highest severity from flags
   */
  _getHighestSeverity(flags) {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    let highest = -1;
    
    for (const flag of flags) {
      const idx = severityOrder.indexOf(flag.severity);
      if (idx > highest) highest = idx;
    }
    
    return highest >= 0 ? severityOrder[highest] : null;
  }

  /**
   * Get appropriate block message
   */
  _getBlockMessage(flags) {
    const categories = [...new Set(flags.map(f => f.category))];
    
    if (categories.includes('jailbreak')) {
      return 'Request blocked: Potential prompt injection or jailbreak attempt detected.';
    }
    if (categories.includes('selfHarm')) {
      return 'Content blocked: Self-harm related content is not allowed. If you are struggling, please reach out to a crisis helpline.';
    }
    if (categories.includes('illegal')) {
      return 'Content blocked: Requests related to illegal activities are not allowed.';
    }
    if (categories.includes('pii')) {
      return 'Content blocked: Personal identifiable information detected.';
    }
    
    return `Content blocked: Policy violation detected in categories: ${categories.join(', ')}.`;
  }

  /**
   * Add custom blocked term
   */
  addBlockedTerm(term) {
    this.customBlocked.add(term.toLowerCase());
  }

  /**
   * Add whitelist term
   */
  addWhitelistTerm(term) {
    this.whitelist.add(term.toLowerCase());
  }

  /**
   * Set category filter
   */
  setCategoryFilter(category, enabled) {
    if (this.categories.hasOwnProperty(category)) {
      this.categories[category] = enabled;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      strictMode: this.strictMode,
      categories: this.categories,
      ...this.stats,
      blockRate: this.stats.totalChecked > 0 
        ? ((this.stats.blocked / this.stats.totalChecked) * 100).toFixed(2) + '%'
        : '0%',
    };
  }

  /**
   * Enable/disable filter
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

export const contentFilter = new ContentFilter();
export { ContentFilter };
