/**
 * Function Call Router
 * Route tool/function calls to appropriate handlers
 */

class FunctionRouter {
  constructor(options = {}) {
    this.functions = new Map();
    this.middlewares = [];
    this.defaultHandler = options.defaultHandler || null;
    
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      byFunction: {},
    };
  }

  /**
   * Register a function handler
   */
  register(config) {
    const {
      name,
      description,
      parameters,
      handler,
      schema,
      timeout = 30000,
      retries = 0,
      middleware = [],
    } = config;
    
    if (!name || !handler) {
      throw new Error('Function must have name and handler');
    }
    
    const func = {
      name,
      description,
      parameters: parameters || schema?.properties || {},
      required: schema?.required || [],
      handler,
      timeout,
      retries,
      middleware,
      callCount: 0,
      errorCount: 0,
    };
    
    this.functions.set(name, func);
    
    return this._getSchema(func);
  }

  /**
   * Unregister a function
   */
  unregister(name) {
    return this.functions.delete(name);
  }

  /**
   * Add global middleware
   */
  use(middleware) {
    this.middlewares.push(middleware);
  }

  /**
   * Execute a function call
   */
  async execute(call, context = {}) {
    const { name, arguments: args } = call;
    
    this.stats.totalCalls++;
    this.stats.byFunction[name] = (this.stats.byFunction[name] || 0) + 1;
    
    const func = this.functions.get(name);
    
    if (!func) {
      if (this.defaultHandler) {
        return this.defaultHandler(call, context);
      }
      this.stats.failedCalls++;
      throw new Error(`Function ${name} not found`);
    }
    
    func.callCount++;
    
    // Parse arguments
    let parsedArgs;
    try {
      parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
    } catch (e) {
      this.stats.failedCalls++;
      func.errorCount++;
      throw new Error(`Invalid arguments for ${name}: ${e.message}`);
    }
    
    // Validate required parameters
    for (const required of func.required) {
      if (parsedArgs[required] === undefined) {
        this.stats.failedCalls++;
        func.errorCount++;
        throw new Error(`Missing required parameter: ${required}`);
      }
    }
    
    // Apply middlewares
    const ctx = { ...context, functionName: name, arguments: parsedArgs };
    
    for (const mw of [...this.middlewares, ...func.middleware]) {
      await mw(ctx);
    }
    
    // Execute with timeout and retries
    let lastError;
    for (let attempt = 0; attempt <= func.retries; attempt++) {
      try {
        const result = await this._executeWithTimeout(
          func.handler,
          parsedArgs,
          ctx,
          func.timeout
        );
        
        this.stats.successfulCalls++;
        return {
          success: true,
          result,
          functionName: name,
        };
        
      } catch (error) {
        lastError = error;
        if (attempt < func.retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    
    this.stats.failedCalls++;
    func.errorCount++;
    
    return {
      success: false,
      error: lastError.message,
      functionName: name,
    };
  }

  /**
   * Execute handler with timeout
   */
  async _executeWithTimeout(handler, args, context, timeout) {
    return Promise.race([
      handler(args, context),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Function timeout')), timeout)
      ),
    ]);
  }

  /**
   * Execute multiple function calls
   */
  async executeAll(calls, context = {}) {
    const results = [];
    
    for (const call of calls) {
      const result = await this.execute(call, context);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Execute function calls in parallel
   */
  async executeParallel(calls, context = {}) {
    return Promise.all(
      calls.map(call => this.execute(call, context))
    );
  }

  /**
   * Get OpenAI-compatible function schema
   */
  _getSchema(func) {
    return {
      name: func.name,
      description: func.description,
      parameters: {
        type: 'object',
        properties: func.parameters,
        required: func.required,
      },
    };
  }

  /**
   * Get all function schemas
   */
  getSchemas() {
    return Array.from(this.functions.values()).map(f => this._getSchema(f));
  }

  /**
   * Get function info
   */
  getFunction(name) {
    const func = this.functions.get(name);
    if (!func) return null;
    
    return {
      name: func.name,
      description: func.description,
      parameters: func.parameters,
      required: func.required,
      callCount: func.callCount,
      errorCount: func.errorCount,
    };
  }

  /**
   * List all functions
   */
  listFunctions() {
    return Array.from(this.functions.values()).map(f => ({
      name: f.name,
      description: f.description,
      callCount: f.callCount,
      errorCount: f.errorCount,
    }));
  }

  /**
   * Create OpenAI tools format
   */
  getTools() {
    return Array.from(this.functions.values()).map(f => ({
      type: 'function',
      function: this._getSchema(f),
    }));
  }

  /**
   * Process tool calls from response
   */
  async processToolCalls(response, context = {}) {
    const toolCalls = response.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return null;
    }
    
    const results = [];
    
    for (const toolCall of toolCalls) {
      const result = await this.execute({
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      }, context);
      
      results.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        content: JSON.stringify(result.result || { error: result.error }),
      });
    }
    
    return results;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      registeredFunctions: this.functions.size,
      ...this.stats,
      functions: this.listFunctions(),
    };
  }
}

export const functionRouter = new FunctionRouter();
export { FunctionRouter };
