/**
 * Conversation Memory
 * Persist and manage chat history across sessions
 */

class ConversationMemory {
  constructor(options = {}) {
    this.conversations = new Map();
    this.maxMessages = options.maxMessages || 100;
    this.maxConversations = options.maxConversations || 1000;
    this.defaultTTL = options.defaultTTL || 24 * 60 * 60 * 1000; // 24 hours
    
    this.stats = {
      totalConversations: 0,
      activeConversations: 0,
      totalMessages: 0,
    };
    
    // Cleanup old conversations periodically
    this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
  }

  /**
   * Create or get conversation
   */
  getOrCreate(conversationId, metadata = {}) {
    if (this.conversations.has(conversationId)) {
      const conv = this.conversations.get(conversationId);
      conv.lastAccessed = Date.now();
      return conv;
    }
    
    // Enforce max conversations
    if (this.conversations.size >= this.maxConversations) {
      this._evictOldest();
    }
    
    const conversation = {
      id: conversationId,
      messages: [],
      metadata,
      systemPrompt: metadata.systemPrompt || null,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      ttl: metadata.ttl || this.defaultTTL,
      summary: null,
    };
    
    this.conversations.set(conversationId, conversation);
    this.stats.totalConversations++;
    this.stats.activeConversations++;
    
    return conversation;
  }

  /**
   * Add message to conversation
   */
  addMessage(conversationId, message) {
    const conversation = this.getOrCreate(conversationId);
    
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      role: message.role,
      content: message.content,
      timestamp: Date.now(),
      metadata: message.metadata || {},
      tokens: message.tokens,
    };
    
    conversation.messages.push(msg);
    conversation.lastAccessed = Date.now();
    this.stats.totalMessages++;
    
    // Enforce max messages
    if (conversation.messages.length > this.maxMessages) {
      this._compactConversation(conversation);
    }
    
    return msg;
  }

  /**
   * Get messages for API call
   */
  getMessages(conversationId, options = {}) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return [];
    
    conversation.lastAccessed = Date.now();
    
    let messages = conversation.messages;
    
    // Apply limit
    if (options.limit) {
      messages = messages.slice(-options.limit);
    }
    
    // Apply token limit
    if (options.maxTokens) {
      messages = this._limitByTokens(messages, options.maxTokens);
    }
    
    // Format for API
    const result = [];
    
    // Add system prompt
    if (conversation.systemPrompt) {
      result.push({ role: 'system', content: conversation.systemPrompt });
    }
    
    // Add summary if available
    if (conversation.summary && options.includeSummary !== false) {
      result.push({
        role: 'system',
        content: `Previous conversation summary: ${conversation.summary}`,
      });
    }
    
    // Add messages
    for (const msg of messages) {
      result.push({
        role: msg.role,
        content: msg.content,
      });
    }
    
    return result;
  }

  /**
   * Set system prompt
   */
  setSystemPrompt(conversationId, prompt) {
    const conversation = this.getOrCreate(conversationId);
    conversation.systemPrompt = prompt;
  }

  /**
   * Get conversation
   */
  get(conversationId) {
    const conv = this.conversations.get(conversationId);
    if (conv) {
      conv.lastAccessed = Date.now();
    }
    return conv;
  }

  /**
   * Delete conversation
   */
  delete(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return false;
    
    this.stats.totalMessages -= conversation.messages.length;
    this.stats.activeConversations--;
    
    return this.conversations.delete(conversationId);
  }

  /**
   * Clear conversation messages
   */
  clearMessages(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return false;
    
    this.stats.totalMessages -= conversation.messages.length;
    conversation.messages = [];
    conversation.summary = null;
    
    return true;
  }

  /**
   * Set conversation summary
   */
  setSummary(conversationId, summary) {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.summary = summary;
    }
  }

  /**
   * Generate summary (requires executor function)
   */
  async generateSummary(conversationId, executor) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.messages.length < 5) {
      return null;
    }
    
    const messagesText = conversation.messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    const request = {
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: `Summarize this conversation in 2-3 sentences:\n\n${messagesText}`,
      }],
      max_tokens: 150,
    };
    
    try {
      const response = await executor(request);
      const summary = response.content || response.choices?.[0]?.message?.content;
      conversation.summary = summary;
      return summary;
    } catch (error) {
      console.error('[ConversationMemory] Failed to generate summary:', error.message);
      return null;
    }
  }

  /**
   * Compact conversation by summarizing old messages
   */
  _compactConversation(conversation) {
    if (conversation.messages.length <= this.maxMessages / 2) return;
    
    // Keep recent messages, summarize old ones
    const keepCount = Math.floor(this.maxMessages / 2);
    const oldMessages = conversation.messages.slice(0, -keepCount);
    
    // Create simple summary of old messages
    const topics = new Set();
    for (const msg of oldMessages) {
      // Extract key words (simple approach)
      const words = msg.content.toLowerCase().match(/\b\w{5,}\b/g) || [];
      words.slice(0, 3).forEach(w => topics.add(w));
    }
    
    conversation.summary = `Earlier discussion covered: ${Array.from(topics).slice(0, 10).join(', ')}`;
    conversation.messages = conversation.messages.slice(-keepCount);
    this.stats.totalMessages -= oldMessages.length;
  }

  /**
   * Limit messages by token count
   */
  _limitByTokens(messages, maxTokens) {
    let totalTokens = 0;
    const result = [];
    
    // Process from newest to oldest
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const tokens = msg.tokens || Math.ceil(msg.content.length / 4);
      
      if (totalTokens + tokens > maxTokens) break;
      
      totalTokens += tokens;
      result.unshift(msg);
    }
    
    return result;
  }

  /**
   * Evict oldest conversation
   */
  _evictOldest() {
    let oldest = null;
    let oldestTime = Infinity;
    
    for (const [id, conv] of this.conversations) {
      if (conv.lastAccessed < oldestTime) {
        oldestTime = conv.lastAccessed;
        oldest = id;
      }
    }
    
    if (oldest) {
      this.delete(oldest);
    }
  }

  /**
   * Cleanup expired conversations
   */
  _cleanup() {
    const now = Date.now();
    
    for (const [id, conv] of this.conversations) {
      if (now - conv.lastAccessed > conv.ttl) {
        this.delete(id);
      }
    }
  }

  /**
   * List conversations
   */
  list(options = {}) {
    let conversations = Array.from(this.conversations.values());
    
    if (options.userId) {
      conversations = conversations.filter(c => c.metadata?.userId === options.userId);
    }
    
    return conversations.map(c => ({
      id: c.id,
      messageCount: c.messages.length,
      createdAt: c.createdAt,
      lastAccessed: c.lastAccessed,
      metadata: c.metadata,
      hasSummary: !!c.summary,
    }));
  }

  /**
   * Export conversation
   */
  export(conversationId) {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;
    
    return {
      id: conv.id,
      messages: conv.messages,
      systemPrompt: conv.systemPrompt,
      summary: conv.summary,
      metadata: conv.metadata,
      createdAt: conv.createdAt,
    };
  }

  /**
   * Import conversation
   */
  import(data) {
    const conversation = {
      id: data.id,
      messages: data.messages || [],
      systemPrompt: data.systemPrompt,
      summary: data.summary,
      metadata: data.metadata || {},
      createdAt: data.createdAt || Date.now(),
      lastAccessed: Date.now(),
      ttl: this.defaultTTL,
    };
    
    this.conversations.set(data.id, conversation);
    this.stats.totalConversations++;
    this.stats.activeConversations++;
    this.stats.totalMessages += conversation.messages.length;
    
    return conversation;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      maxMessages: this.maxMessages,
      maxConversations: this.maxConversations,
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
  }
}

export const conversationMemory = new ConversationMemory();
export { ConversationMemory };
